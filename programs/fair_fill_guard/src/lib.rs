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
//!
//! Dependencies are deliberately limited to `anchor-lang`. Solana Playground — the only
//! toolchain available for this build — compiles against a fixed crate list that has neither
//! `pyth-solana-receiver-sdk` nor an `anchor-spl` with the `token_2022` feature, so this
//! program reads the SPL/Token-2022 account layouts and Pyth's `PriceUpdateV2` layout
//! directly, with explicit owner checks in place of the typed wrappers those crates provide.
use anchor_lang::prelude::*;

declare_id!("FFGuardPARiTy1111111111111111111111111111111");

/// Effective and fair prices are compared at this fixed scale (USD * 1e8).
const PRICE_SCALE: i32 = 8;

/// rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ — the Pyth receiver program, the only valid
/// owner of a PriceUpdateV2 account.
const PYTH_RECEIVER: Pubkey = Pubkey::new_from_array([
    12, 183, 250, 187, 82, 247, 166, 72, 187, 91, 49, 125, 154, 1, 139, 144, 87, 203, 2, 71, 116, 250, 254, 1, 230, 196, 223, 152, 204, 56, 88, 129,
]);
/// TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
const TOKEN_PROGRAM: Pubkey = Pubkey::new_from_array([
    6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140, 245, 133, 126, 255, 0, 169,
]);
/// TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb — every issuer's stock token is Token-2022.
const TOKEN_2022_PROGRAM: Pubkey = Pubkey::new_from_array([
    6, 221, 246, 225, 238, 117, 143, 222, 24, 66, 93, 188, 228, 108, 205, 218, 182, 26, 252, 77, 131, 185, 13, 39, 254, 189, 249, 40, 216, 161, 139, 252,
]);

#[program]
pub mod fair_fill_guard {
    use super::*;

    /// `nonce` is chosen by the client and seeds the Receipt PDA, so the receipt address is
    /// known before the transaction lands (the slot is not).
    pub fn snapshot(ctx: Context<Snapshot>, nonce: u64) -> Result<()> {
        let owner = ctx.accounts.owner.key();
        let (in_mint, in_authority, in_before) = read_token_account(&ctx.accounts.in_token)?;
        let (out_mint, out_authority, out_before) = read_token_account(&ctx.accounts.out_token)?;
        require_keys_eq!(in_authority, owner, GuardError::TokenAccountNotOwned);
        require_keys_eq!(out_authority, owner, GuardError::TokenAccountNotOwned);

        let s = &mut ctx.accounts.snapshot;
        s.owner = owner;
        s.in_mint = in_mint;
        s.out_mint = out_mint;
        s.in_before = in_before;
        s.out_before = out_before;
        s.slot = Clock::get()?.slot;
        s.nonce = nonce;
        s.bump = *ctx.bumps.get("snapshot").ok_or(GuardError::BumpMissing)?;
        Ok(())
    }

    pub fn verify(ctx: Context<Verify>, args: VerifyArgs) -> Result<()> {
        let clock = Clock::get()?;
        let owner = ctx.accounts.owner.key();
        let s = &ctx.accounts.snapshot;
        // snapshot and verify must be the same transaction; slot equality is the cheapest proxy
        // and the snapshot PDA is closed below so it cannot be replayed.
        require!(s.slot == clock.slot, GuardError::SnapshotNotInThisTransaction);

        let (in_mint, in_authority, in_after) = read_token_account(&ctx.accounts.in_token)?;
        let (out_mint, out_authority, out_after) = read_token_account(&ctx.accounts.out_token)?;
        require_keys_eq!(in_authority, owner, GuardError::TokenAccountNotOwned);
        require_keys_eq!(out_authority, owner, GuardError::TokenAccountNotOwned);
        require_keys_eq!(s.in_mint, in_mint, GuardError::MintMismatch);
        require_keys_eq!(s.out_mint, out_mint, GuardError::MintMismatch);
        require_keys_eq!(s.in_mint, ctx.accounts.in_mint.key(), GuardError::MintMismatch);
        require_keys_eq!(s.out_mint, ctx.accounts.out_mint.key(), GuardError::MintMismatch);

        let spent = s.in_before.checked_sub(in_after).ok_or(GuardError::NothingSpent)?;
        let received = out_after.checked_sub(s.out_before).ok_or(GuardError::NothingReceived)?;
        require!(spent > 0, GuardError::NothingSpent);
        require!(received > 0, GuardError::NothingReceived);

        // effective price per share, scaled 1e8:
        //   (spent / 10^in_dec) / (received / 10^out_dec) * 10^8
        let in_dec = read_mint_decimals(&ctx.accounts.in_mint)? as i32;
        let out_dec = read_mint_decimals(&ctx.accounts.out_mint)? as i32;
        let num = (spent as u128)
            .checked_mul(pow10((out_dec + PRICE_SCALE - in_dec).max(0) as u32))
            .ok_or(GuardError::MathOverflow)?;
        let den = (received as u128)
            .checked_mul(pow10((in_dec - out_dec - PRICE_SCALE).max(0) as u32))
            .ok_or(GuardError::MathOverflow)?;
        let eff = num.checked_div(den).ok_or(GuardError::MathOverflow)?;

        // fair price from Pyth, scaled 1e8; the client picks the feed (US session or 24/7)
        // and the acceptable staleness for the current market state.
        let p = read_pyth_price(&ctx.accounts.price_update, &args.feed_id, args.max_age_sec, &clock)?;
        require!(p.price > 0, GuardError::OraclePriceUnavailable);
        let fair = scale(p.price as u128, p.exponent, PRICE_SCALE).ok_or(GuardError::MathOverflow)?;
        let conf = scale(p.conf as u128, p.exponent, PRICE_SCALE).ok_or(GuardError::MathOverflow)?;
        require!(fair > 0, GuardError::OraclePriceUnavailable);
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
        r.nonce = s.nonce;
        r.bump = *ctx.bumps.get("receipt").ok_or(GuardError::BumpMissing)?;

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

fn bytes32(src: &[u8]) -> Pubkey {
    let mut b = [0u8; 32];
    b.copy_from_slice(src);
    Pubkey::new_from_array(b)
}

/// SPL Token and Token-2022 share the first 72 bytes of a token account: mint, owner, amount.
/// Token-2022 extensions live past byte 165 and do not move these fields.
fn read_token_account(ai: &UncheckedAccount) -> Result<(Pubkey, Pubkey, u64)> {
    require!(*ai.owner == TOKEN_PROGRAM || *ai.owner == TOKEN_2022_PROGRAM, GuardError::NotATokenAccount);
    let d = ai.try_borrow_data()?;
    require!(d.len() >= 72, GuardError::NotATokenAccount);
    let amount = u64::from_le_bytes(d[64..72].try_into().map_err(|_| GuardError::NotATokenAccount)?);
    Ok((bytes32(&d[0..32]), bytes32(&d[32..64]), amount))
}

/// Mint layout: mint_authority (COption, 36) + supply (8) + decimals (1) at offset 44.
fn read_mint_decimals(ai: &UncheckedAccount) -> Result<u8> {
    require!(*ai.owner == TOKEN_PROGRAM || *ai.owner == TOKEN_2022_PROGRAM, GuardError::NotAMint);
    let d = ai.try_borrow_data()?;
    require!(d.len() >= 45, GuardError::NotAMint);
    Ok(d[44])
}

struct OraclePrice {
    price: i64,
    conf: u64,
    exponent: i32,
}

/// Pyth `PriceUpdateV2`, as posted by the Solana receiver program:
///   8 discriminator | 32 write_authority | 1 verification_level (+1 if Partial)
///   | 32 feed_id | 8 price | 8 conf | 4 exponent | 8 publish_time | ...
/// Only a fully verified update is accepted, which is what the sponsored feeds publish.
fn read_pyth_price(ai: &UncheckedAccount, feed_id: &[u8; 32], max_age_sec: u64, clock: &Clock) -> Result<OraclePrice> {
    require_keys_eq!(*ai.owner, PYTH_RECEIVER, GuardError::NotAPythAccount);
    let d = ai.try_borrow_data()?;
    require!(d.len() >= 101, GuardError::NotAPythAccount);
    require!(d[40] == 1, GuardError::OracleNotFullyVerified);
    require!(&d[41..73] == feed_id.as_ref(), GuardError::OracleFeedMismatch);
    let price = i64::from_le_bytes(d[73..81].try_into().map_err(|_| GuardError::NotAPythAccount)?);
    let conf = u64::from_le_bytes(d[81..89].try_into().map_err(|_| GuardError::NotAPythAccount)?);
    let exponent = i32::from_le_bytes(d[89..93].try_into().map_err(|_| GuardError::NotAPythAccount)?);
    let publish_time = i64::from_le_bytes(d[93..101].try_into().map_err(|_| GuardError::NotAPythAccount)?);
    let age = clock.unix_timestamp.saturating_sub(publish_time);
    require!(age >= 0 && (age as u64) <= max_age_sec, GuardError::OraclePriceUnavailable);
    Ok(OraclePrice { price, conf, exponent })
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
    /// CHECK: layout and program ownership are validated in `read_token_account`; the authority
    /// is checked against `owner` in the instruction.
    pub in_token: UncheckedAccount<'info>,
    /// CHECK: same as `in_token`.
    pub out_token: UncheckedAccount<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + SnapshotState::INIT_SPACE,
        // keyed by the token account, not the mint: an untyped account cannot be read inside
        // a seeds constraint. One live snapshot per token account, which is the same guarantee.
        seeds = [b"snapshot", owner.key().as_ref(), out_token.key().as_ref()],
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
    /// CHECK: validated in `read_token_account`.
    pub in_token: UncheckedAccount<'info>,
    /// CHECK: validated in `read_token_account`.
    pub out_token: UncheckedAccount<'info>,
    /// CHECK: validated in `read_mint_decimals`; identity is checked against the snapshot.
    pub in_mint: UncheckedAccount<'info>,
    /// CHECK: validated in `read_mint_decimals`; identity is checked against the snapshot.
    pub out_mint: UncheckedAccount<'info>,
    #[account(
        mut,
        close = owner,
        has_one = owner,
        seeds = [b"snapshot", owner.key().as_ref(), out_token.key().as_ref()],
        bump = snapshot.bump
    )]
    pub snapshot: Account<'info, SnapshotState>,
    /// CHECK: must be owned by the Pyth receiver; layout, feed id and staleness are validated
    /// in `read_pyth_price`.
    pub price_update: UncheckedAccount<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [b"receipt", owner.key().as_ref(), out_token.key().as_ref(), &snapshot.nonce.to_le_bytes()],
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
    pub nonce: u64,
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
    pub nonce: u64,
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
    #[msg("token account is not owned by the signer")]
    TokenAccountNotOwned,
    #[msg("account is not an SPL Token or Token-2022 token account")]
    NotATokenAccount,
    #[msg("account is not an SPL Token or Token-2022 mint")]
    NotAMint,
    #[msg("account is not owned by the Pyth receiver program")]
    NotAPythAccount,
    #[msg("oracle price update is not fully verified")]
    OracleNotFullyVerified,
    #[msg("oracle price update is for a different feed")]
    OracleFeedMismatch,
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
    #[msg("pda bump missing")]
    BumpMissing,
}
