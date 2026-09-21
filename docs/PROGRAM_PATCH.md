# fair_fill_guard — Receipt PDA seed fix (applied)

**Applied to `programs/fair_fill_guard/src/lib.rs` on 2026-09-21** — paste that file into
Playground as-is. Kept here as the record of why the Receipt seed changed. The client
(`src/lib/guard.ts`) targets this layout.

## Why

`Verify` derives the `Receipt` PDA from `snapshot.slot`. That slot is `Clock::get()` at execution
time — it is not known until the transaction lands. Solana requires every account, including
`init` PDAs, to be listed in the transaction up front, so a client can never supply the correct
`receipt` address and the `init` seeds check fails on every attempt. There is no client-side
workaround. The fix is a client-chosen `nonce: u64` that seeds the receipt instead of the slot.

## Diff (4 edits)

**1. `snapshot` takes and stores a nonce**

```rust
    pub fn snapshot(ctx: Context<Snapshot>, nonce: u64) -> Result<()> {
        let s = &mut ctx.accounts.snapshot;
        s.owner = ctx.accounts.owner.key();
        s.in_mint = ctx.accounts.in_token.mint;
        s.out_mint = ctx.accounts.out_token.mint;
        s.in_before = ctx.accounts.in_token.amount;
        s.out_before = ctx.accounts.out_token.amount;
        s.slot = Clock::get()?.slot;
        s.nonce = nonce;
        s.bump = ctx.bumps.snapshot;
        Ok(())
    }
```

**2. `Verify` seeds the receipt from the nonce, not the slot**

```rust
        seeds = [b"receipt", owner.key().as_ref(), out_token.mint.as_ref(), &snapshot.nonce.to_le_bytes()],
```

**3. Add `nonce` to both state structs** (Receipt gets it too so it can be re-derived from the
account alone)

```rust
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
```

```rust
pub struct Receipt {
    // …existing fields…
    pub feed_id: [u8; 32],
    pub nonce: u64,
    pub bump: u8,
}
```

**4. `verify` copies it onto the receipt** (next to `r.feed_id = args.feed_id;`)

```rust
        r.nonce = s.nonce;
```

`#[derive(InitSpace)]` picks up the new fields automatically. Nothing else changes: the slot
equality check in `verify` still enforces same-transaction, and the snapshot PDA (seeded by
owner + out mint, no slot) is closed on verify so it cannot be replayed.

## Client contract (already implemented in `src/lib/guard.ts`)

- `snapshot` data: `sha256("global:snapshot")[..8] ++ nonce:u64 LE`
- `verify` data: `sha256("global:verify")[..8] ++ feed_id[32] ++ max_dev_bps:u16 ++ max_conf_bps:u16 ++ max_age_sec:u64 ++ issuer:u8`
- Receipt PDA: `["receipt", owner, out_mint, nonce LE]`; Snapshot PDA: `["snapshot", owner, out_mint]`
- After deploying, set `NEXT_PUBLIC_GUARD_PROGRAM_ID=<program id>` in `.env`; `/api/v1/swap`
  switches composable venues from `plain` to `guarded` automatically.
