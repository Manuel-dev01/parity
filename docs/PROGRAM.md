# fair_fill_guard — build & deploy

Source: `programs/fair_fill_guard/src/lib.rs`. Thin Anchor program: `snapshot` → (Jupiter swap) → `verify`, reading Pyth's sponsored on-chain `PriceUpdateV2` accounts and writing a `Receipt` PDA.

## Toolchain decision (2026-09-14)

This Windows machine has no Solana CLI / Anchor / cargo, and the link is ~150 KB/s, so a WSL2 + Rust + Solana + Anchor install (several GB) is not viable before Friday. **Build and deploy with [Solana Playground](https://beta.solpg.io)** — it compiles Anchor in the browser and deploys to mainnet from a Playground wallet.

## Steps (Tuesday)

1. Open https://beta.solpg.io → **Create a new project → Anchor (Rust)**, name `fair_fill_guard`.
2. Replace `src/lib.rs` with `programs/fair_fill_guard/src/lib.rs`. **Nothing else to configure** — the program depends on `anchor-lang` only, which Playground's Anchor template already has. Do not try to add a `Cargo.toml`: Playground builds against a fixed crate list and forces uploaded files into `src/` ([issue #349](https://github.com/solana-playground/solana-playground/issues/349)).

   > Playground supports `anchor-lang 0.29.0`, `pyth-sdk-solana 0.8.0` and an `anchor-spl` without the `token_2022` feature. It has **no** `pyth-solana-receiver-sdk`, and `pyth-sdk-solana 0.8` reads the old pythnet format, not the pull-oracle `PriceUpdateV2` accounts Parity uses. The program therefore parses `PriceUpdateV2` and the SPL/Token-2022 account layouts itself, with explicit owner checks (`PYTH_RECEIVER`, `TOKEN_PROGRAM`, `TOKEN_2022_PROGRAM`) replacing the typed wrappers.
3. **Build** (hammer icon). Fix compile errors in the Playground editor; mirror every change back into this repo.
4. Playground wallet: switch cluster to **devnet** (bottom bar) and fund it. `solana airdrop 2` in the Playground terminal usually fails with a 429 (the public faucet is IP-rate-limited and often dry; Playground reports it as `body stream already read`). Use **https://faucet.solana.com** with a GitHub login instead — 2 SOL/day, enough for one deploy.
5. **Deploy** to devnet. Copy the program id.

   > Mainnet deploy is deliberately out of scope: rent is ~0.0051 SOL per KB (a 200 KB build ≈ 1.02 SOL ≈ $115), and shipping an unaudited program that touches real funds is the wrong call regardless of budget. Mainnet buys route through Jupiter's audited programs with a pre-sign fair-value check instead; `NEXT_PUBLIC_GUARD_CLUSTER=devnet` enforces that in code (`mainnetGuardProgram()` returns null).
6. Replace `declare_id!` in `lib.rs` **and** the id in `programs/Anchor.toml` with the deployed id, rebuild + redeploy once so the IDL matches (Playground → "IDL" tab → upload/init IDL is optional; the app builds instructions manually).
7. Download the IDL (Playground exports `idl.json`) into `src/data/fair_fill_guard.idl.json`; the client uses the discriminators from it.
8. Record the program id in `.env` as `NEXT_PUBLIC_GUARD_PROGRAM_ID` (leave `NEXT_PUBLIC_GUARD_CLUSTER=devnet`) and in README.
9. Run `node scripts/guard-proof.mjs` — it mints a mock market on devnet and runs the guard twice against a real Pyth account: one fill at fair value (writes a Receipt) and one 300 bps off (reverts with `FillOffFairValue`). Both print devnet Solscan links for the README and the video.

## Client composition (Monday/Tuesday, `src/lib/guard.ts`)

Implemented in `src/lib/execute.ts` (`buildSwap`) with encoders in `src/lib/guard.ts`:

```
tx = [
  ...jupiter computeBudgetInstructions,
  ...jupiter setupInstructions (creates the stock ATA — must precede snapshot so it can be read),
  fair_fill_guard.snapshot(owner, in_token=USDC ATA, out_token=stock ATA, nonce),
  jupiter swapInstruction, ...otherInstructions, cleanupInstruction?,
  fair_fill_guard.verify(owner, in_token, out_token, in_mint, out_mint, price_update=<sponsored Pyth account>, receipt PDA(nonce), args),
]  + Jupiter's address lookup tables, compiled to a v0 message
```

- `price_update` = `fair.onchainAccount` from `/api/v1/quote` (Pyth push-oracle PDA, shard 1 for the 16 sponsored majors).
- `feed_id` = `underlying.pyth.us` (hex → 32 bytes).
- `max_age_sec`: 120 during the regular session, 900 otherwise. `max_conf_bps`: 50. `max_dev_bps`: user slider (default 50).
- Ondo tokens route through JupiterZ RFQ (market-maker co-signed transaction) and **cannot** be composed with the guard — the UI shows "client-side guard" for those and for the non-sponsored names (e.g. SPCX).

## Hard cut

The guard is a devnet artifact by design, so there is nothing to cut on the mainnet path — real fills already work through Jupiter with the pre-sign check. If the devnet deploy itself is not done by **Wed 2026-09-24**, drop the guard from the demo and keep the two mainnet fills; the rest of the product does not depend on it.
