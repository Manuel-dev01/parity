# fair_fill_guard — build & deploy

Source: `programs/fair_fill_guard/src/lib.rs`. Thin Anchor program: `snapshot` → (Jupiter swap) → `verify`, reading Pyth's sponsored on-chain `PriceUpdateV2` accounts and writing a `Receipt` PDA.

## Toolchain decision (2026-09-14)

This Windows machine has no Solana CLI / Anchor / cargo, and the link is ~150 KB/s, so a WSL2 + Rust + Solana + Anchor install (several GB) is not viable before Friday. **Build and deploy with [Solana Playground](https://beta.solpg.io)** — it compiles Anchor in the browser and deploys to mainnet from a Playground wallet.

## Steps (Tuesday)

1. Open https://beta.solpg.io → **Create a new project → Anchor (Rust)**, name `fair_fill_guard`.
2. Replace `src/lib.rs` with `programs/fair_fill_guard/src/lib.rs`. In `Cargo.toml` (Playground's) add:
   ```toml
   anchor-spl = { version = "0.31.1", features = ["token_2022"] }
   pyth-solana-receiver-sdk = "0.6"
   ```
   If Playground's Anchor version differs, match `anchor-lang`/`anchor-spl` to it. If `pyth-solana-receiver-sdk` fails to resolve after the Aug-2026 Pyth Core upgrade, check https://docs.pyth.network/price-feeds/core/use-real-time-data/pull-integration/solana for the current crate name/version.
3. **Build** (hammer icon). Fix compile errors in the Playground editor; mirror every change back into this repo.
4. Playground wallet: export its keypair (settings → wallet) and fund it with **~2.5 SOL** on mainnet (deploy rent for a ~200 KB program is ~1.5–2 SOL; keep a margin).
5. Switch cluster to **mainnet-beta** (bottom bar) and **Deploy**. Copy the program id.
6. Replace `declare_id!` in `lib.rs` **and** the id in `programs/Anchor.toml` with the deployed id, rebuild + redeploy once so the IDL matches (Playground → "IDL" tab → upload/init IDL is optional; the app builds instructions manually).
7. Download the IDL (Playground exports `idl.json`) into `src/data/fair_fill_guard.idl.json`; the client uses the discriminators from it.
8. Record the program id in `.env` as `NEXT_PUBLIC_GUARD_PROGRAM_ID` and in README.

## Client composition (Monday/Tuesday, `src/lib/guard.ts`)

```
tx = [
  computeBudget (from Jupiter swap-instructions),
  createATA(out_token) if missing,
  fair_fill_guard.snapshot(owner, in_token=USDC ATA, out_token=stock ATA),
  ...jupiter setupInstructions, swapInstruction, cleanupInstruction,
  fair_fill_guard.verify(owner, in_token, out_token, in_mint, out_mint, price_update=<sponsored Pyth account>, receipt PDA, args),
]  + Jupiter's address lookup tables
```

- `price_update` = `fair.onchainAccount` from `/api/v1/quote` (Pyth push-oracle PDA, shard 1 for the 16 sponsored majors).
- `feed_id` = `underlying.pyth.us` (hex → 32 bytes).
- `max_age_sec`: 120 during the regular session, 900 otherwise. `max_conf_bps`: 50. `max_dev_bps`: user slider (default 50).
- Ondo tokens route through JupiterZ RFQ (market-maker co-signed transaction) and **cannot** be composed with the guard — the UI shows "client-side guard" for those and for the non-sponsored names (e.g. SPCX).

## Hard cut

If the program is not deployed to mainnet by **Tuesday 2026-09-15 night**, ship with the client-side guard (quote-time check + slippage) and say so plainly in the README. The rest of the product does not depend on it.
