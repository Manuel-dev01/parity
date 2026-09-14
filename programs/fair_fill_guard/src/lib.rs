//! fair_fill_guard — Parity's on-chain execution guard for tokenized stocks.
//!
//! A swap through any router is bracketed by two instructions in the same transaction:
//!
//!   snapshot  → records the trader's USDC and stock-token balances before the swap
//!   <swap>    → any Jupiter / AMM instructions
//!   verify    → measures what was actually spent and received, computes the effective
//!               price per share, compares it to the Pyth reference for the underlying,
//!               and fails the whole transaction if the fill is more than `max_dev_bps`
//!               away from fair value. On success it writes a Receipt PDA.
//!
//! The guard is issuer-agnostic: it only cares about the underlying's fair price and the
//! token decimals, so it works identically for xStocks, Ondo and Backpack tokens.
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

declare_id!("FFGuardPARiTy1111111111111111111111111111111");

/// Effective and fair prices are compared at this fixed scale (USD * 1e8).
const PRICE_SCALE: i32 = 8;

#[program]
pub mod fair_fill_guard {
    use super::*;

    pub fn snapshot(ctx: Context<Snapshot>) -> Result<()> {
        let s = &mut ctx.accounts.snapshot;
        s.owner = ctx.accounts.owner.key();
        s.in_mint = ctx.accounts.in_token.mint;
        s.out_mint = ctx.accounts.out_token.mint;
        s.in_before = ctx.accounts.in_token.amount;
        s.out_before = ctx.accounts.out_token.amount;
        s.slot = Clock::get()?.slot;
        s.bump = ctx.bumps.snapshot;
        Ok(())
    }

    pub fn verify(ctx: Context<Verify>, args: VerifyArgs) -> Result<()> {
        let clock = Clock::get()?;
        let s = &ctx.accounts.snapshot;
        // snapshot and verify must be the same transaction; slot equality is the cheapest proxy
        // and the snapshot PDA is closed below so it cannot be replayed.
        require!(s.slot == clock.slot, GuardError::SnapshotNotInThisTransaction);
        require_keys_eq!(s.in_mint, ctx.accounts.in_token.mint, GuardError::MintMismatch);
        require_keys_eq!(s.out_mint, ctx.accounts.out_token.mint, GuardError::MintMismatch);
        require_keys_eq!(s.out_mint, ctx.accounts.out_mint.key(), GuardError::MintMismatch);

        let spent = s.in_before.checked_sub(ctx.accounts.in_token.amount).ok_or(GuardError::NothingSpent)?;
        let received = ctx.accounts.out_token.amount.checked_sub(s.out_before).ok_or(GuardError::NothingReceived)?;
        require!(spent > 0, GuardError::NothingSpent);
        require!(received > 0, GuardError::NothingReceived);

        // effective price per share, scaled 1e8:
        //   (spent / 10^in_dec) / (received / 10^out_dec) * 10^8
        let in_dec = ctx.accounts.in_mint.decimals as i32;
        let out_dec = ctx.accounts.out_mint.decimals as i32;
        let num = (spent as u128)
            .checked_mul(pow10((out_dec + PRICE_SCALE - in_dec).max(0) as u32))
            .ok_or(GuardError::MathOverflow)?;
        let den = (received as u128)
            .checked_mul(pow10((in_dec - out_dec - PRICE_SCALE).max(0) as u32))
            .ok_or(GuardError::MathOverflow)?;
        let eff = num.checked_div(den).ok_or(GuardError::MathOverflow)?;

        // fair price from Pyth, scaled 1e8; the client picks the feed (US session or 24/7)
        // and the acceptable staleness for the current market state.
        let p = ctx
            .accounts
            .price_update
            .get_price_no_older_than(&clock, args.max_age_sec, &args.feed_id)
            .map_err(|_| GuardError::OraclePriceUnavailable)?;
        require!(p.price > 0, GuardError::OraclePriceUnavailable);
        let fair = scale(p.price as u128, p.exponent, PRICE_SCALE).ok_or(GuardError::MathOverflow)?;
        let conf = scale(p.conf as u128, p.exponent, PRICE_SCALE).ok_or(GuardError::MathOverflow)?;
        // refuse to guard against a reference we cannot trust
        require!(conf.saturating_mul(10_000) / fair <= args.max_conf_bps as u128, GuardError::OracleConfidenceTooWide);

        let diff = if eff > fair { eff - fair } else { fair - eff };
        let dev_bps = diff.saturating_mul(10_000) / fair;
        require!(dev_bps <= args.max_dev_bps as u128, GuardError::FillOffFairValue);

        let r = &mut ctx.accounts.receipt;
        r.owner = s.owner;
        r.out_mint = s.out_mint;
        r.issuer = args.issuer;
        r.spent = spent;
        r.received = received;
        r.fill_px = eff as u64;
        r.fair_px = fair as u64;
        r.dev_bps = dev_bps as u16;
        r.signed_dev_bps = if eff >= fair { dev_bps as i16 } else { -(dev_bps as i16) };
        r.slot = clock.slot;
        r.ts = clock.unix_timestamp;
        r.feed_id = args.feed_id;
        r.bump = ctx.bumps.receipt;

        emit!(FillVerified {
            owner: r.owner,
            out_mint: r.out_mint,
            issuer: r.issuer,
            spent,
            received,
            fill_px: r.fill_px,
            fair_px: r.fair_px,
            signed_dev_bps: r.signed_dev_bps,
            slot: r.slot,
        });
        Ok(())
    }
}

fn pow10(n: u32) -> u128 {
    10u128.pow(n)
}

/// Rescale a Pyth (mantissa, exponent) pair to `target` decimals.
fn scale(v: u128, expo: i32, target: i32) -> Option<u128> {
    let shift = target + expo; // e.g. expo -8, target 8 → 0
    if shift >= 0 {
        v.checked_mul(pow10(shift as u32))
    } else {
        v.checked_div(pow10((-shift) as u32))
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct VerifyArgs {
    /// Pyth feed id for the underlying (Equity.US.X/USD or Equity.Index.X/USD)
    pub feed_id: [u8; 32],
    /// maximum |fill − fair| / fair, in basis points
    pub max_dev_bps: u16,
    /// maximum oracle confidence / price, in basis points
    pub max_conf_bps: u16,
    /// maximum oracle age; wider off-hours, tight during the regular session
    pub max_age_sec: u64,
    /// 0 = xstocks, 1 = ondo, 2 = backpack (informational, for the receipt)
    pub issuer: u8,
}

#[derive(Accounts)]
pub struct Snapshot<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(token::authority = owner)]
    pub in_token: InterfaceAccount<'info, TokenAccount>,
    #[account(token::authority = owner)]
    pub out_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init,
        payer = owner,
        space = 8 + SnapshotState::INIT_SPACE,
        seeds = [b"snapshot", owner.key().as_ref(), out_token.mint.as_ref()],
        bump
    )]
    pub snapshot: Account<'info, SnapshotState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: VerifyArgs)]
pub struct Verify<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(token::authority = owner)]
    pub in_token: InterfaceAccount<'info, TokenAccount>,
    #[account(token::authority = owner)]
    pub out_token: InterfaceAccount<'info, TokenAccount>,
    pub in_mint: InterfaceAccount<'info, Mint>,
    pub out_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        close = owner,
        has_one = owner,
        seeds = [b"snapshot", owner.key().as_ref(), out_token.mint.as_ref()],
        bump = snapshot.bump
    )]
    pub snapshot: Account<'info, SnapshotState>,
    /// Pyth PriceUpdateV2 posted by the pyth-solana-receiver (any poster; freshness is checked)
    pub price_update: Account<'info, PriceUpdateV2>,
    #[account(
        init,
        payer = owner,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [b"receipt", owner.key().as_ref(), out_token.mint.as_ref(), &snapshot.slot.to_le_bytes()],
        bump
    )]
    pub receipt: Account<'info, Receipt>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct SnapshotState {
    pub owner: Pubkey,
    pub in_mint: Pubkey,
    pub out_mint: Pubkey,
    pub in_before: u64,
    pub out_before: u64,
    pub slot: u64,
    pub bump: u8,
}

/// Permanent, per-fill proof that the trade executed within `dev_bps` of the oracle.
#[account]
#[derive(InitSpace)]
pub struct Receipt {
    pub owner: Pubkey,
    pub out_mint: Pubkey,
    pub issuer: u8,
    pub spent: u64,
    pub received: u64,
    /// USD * 1e8
    pub fill_px: u64,
    /// USD * 1e8
    pub fair_px: u64,
    pub dev_bps: u16,
    pub signed_dev_bps: i16,
    pub slot: u64,
    pub ts: i64,
    pub feed_id: [u8; 32],
    pub bump: u8,
}

#[event]
pub struct FillVerified {
    pub owner: Pubkey,
    pub out_mint: Pubkey,
    pub issuer: u8,
    pub spent: u64,
    pub received: u64,
    pub fill_px: u64,
    pub fair_px: u64,
    pub signed_dev_bps: i16,
    pub slot: u64,
}

#[error_code]
pub enum GuardError {
    #[msg("snapshot was not taken in this transaction")]
    SnapshotNotInThisTransaction,
    #[msg("token account mint does not match snapshot")]
    MintMismatch,
    #[msg("no input tokens were spent")]
    NothingSpent,
    #[msg("no output tokens were received")]
    NothingReceived,
    #[msg("oracle price unavailable or too old")]
    OraclePriceUnavailable,
    #[msg("oracle confidence interval too wide to guard against")]
    OracleConfidenceTooWide,
    #[msg("fill deviates from fair value by more than max_dev_bps")]
    FillOffFairValue,
    #[msg("math overflow")]
    MathOverflow,
}
