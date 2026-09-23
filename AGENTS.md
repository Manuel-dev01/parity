# Parity — working notes for Codex

Stocklana hackathon entry. **Deadline extended: Fri 2026-09-25, 4:00pm ET** (was 09-18). Submit a first version by Wed 09-23; Thu/Fri are buffer. Strategy, rubric analysis and the day-by-day roadmap are in `docs/STRATEGY.md` — read it before any scope decision. Program build/deploy steps are in `docs/PROGRAM.md`.

## What this is
Every US stock exists 2–3 times on Solana (xStocks `NVDAx`, Ondo `NVDAon`, Backpack `NVDA`) and the prices disagree. Parity = fair value + executable price per issuer + one-click best-execution buy, bracketed by the `fair_fill_guard` Anchor program that reverts off-fair fills and writes a Receipt PDA. Plus a divergence tape and a public `/api/v1/quote`.

## Status
- ✅ Universe (`src/data/universe.json`, `npm run universe` + `node scripts/pyth-onchain.mjs`), fair value, cross-issuer quotes, board `/`, ticker `/s/[symbol]`, tape `/tape`, wallet connect, `/api/v1/quote`, `/api/v1/universe`, snapshot cron.
- ✅ Guard program source written (`programs/fair_fill_guard/src/lib.rs`, nonce-seeded Receipt per `docs/PROGRAM_PATCH.md`). **Deploys to devnet only** — unaudited, and mainnet rent is ~1 SOL (~$115). `NEXT_PUBLIC_GUARD_CLUSTER=devnet` makes `mainnetGuardProgram()` return null so a devnet id can never be composed into a mainnet tx.
- ✅ Execution: `POST /api/v1/swap` (`src/lib/execute.ts`) returns one unsigned tx in mode `guarded` (snapshot→swap→verify, when `NEXT_PUBLIC_GUARD_PROGRAM_ID` is set) / `plain` (Jupiter swap, pre-sign fair-value check) / `ultra` (Ondo RFQ, non-sponsored names). `TradePanel` signs, confirms, records to `fills`, shows fill vs fair + Solscan. Encoders in `src/lib/guard.ts` need no IDL.
- ⬜ Devnet guard proof: deploy in Playground (free), then `node scripts/guard-proof.mjs` → one Receipt tx + one `FillOffFairValue` revert, both on devnet Solscan.
- ⬜ First real fills: demo wallet `4N6FeA9CzNSZVE3qTd6PevishNUtWDjwry3Nv66BWdvA` (secret in `.env`). **Budget is $20 total** → fund 0.02 SOL + $10 USDC; ~$0.60 is actually consumed (ATA rent + fees + spread), the rest stays as stock tokens. Run `scripts/test-swap.mjs` at $2 per issuer, list signatures in README.
- ⬜ Program build/deploy via Solana Playground (see `docs/PROGRAM.md`), set `NEXT_PUBLIC_GUARD_PROGRAM_ID`.
- ⬜ Neon `DATABASE_URL` for tape + fill history; Vercel deploy; README "what's real" table; demo video during US market hours (9:30–16:00 ET).

## Hard constraints of this environment
- Bandwidth ~150 KB/s. **Use `npm` (never pnpm); keep dependencies minimal.** New packages take minutes; think before adding.
- No Solana CLI / Anchor / cargo locally → program is built in Solana Playground.
- Pyth Hermes is key-gated and the free key is *not entitled to equities*. Do not depend on Hermes. Fair value reads Pyth's **sponsored on-chain accounts** (`src/lib/pyth-onchain.ts`, shard 1, 16 majors), then Jupiter Price v3 `stockData.price`, then Backpack perp marks.
- All three issuers' tokens are Token-2022. Ondo quotes only via JupiterZ RFQ (MM-signed tx; cannot compose with the guard).
- Jupiter lite-api is keyless but rate-limited; a `JUPITER_API_KEY` from portal.jup.ag switches to api.jup.ag (not yet wired).

## Conventions
- Issuer-neutral copy everywhere: "the market is inefficient", never "issuer X is overpriced". The rights table is educational.
- Every screen should end in a signed transaction; a dashboard alone loses this hackathon.
- Unaudited code does not touch mainnet. The guard is devnet-only and proven there; mainnet fills use Jupiter's audited programs + a pre-sign fair-value check. Say this plainly in the README rather than hiding it.
- Commits: no AI attribution trailers.
- Env lives in `.env` (gitignored). `PYTH_API_KEY` is set but only useful for crypto feeds.
