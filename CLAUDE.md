# Parity — working notes for Claude

Stocklana hackathon entry. **Deadline extended: Fri 2026-09-25, 4:00pm ET** (was 09-18). Submit a first version by Wed 09-23; Thu/Fri are buffer. Strategy, rubric analysis and the day-by-day roadmap are in `docs/STRATEGY.md` — read it before any scope decision. Program build/deploy steps are in `docs/PROGRAM.md`.

## What this is
Every US stock exists 2–3 times on Solana (xStocks `NVDAx`, Ondo `NVDAon`, Backpack `NVDA`) and the prices disagree. Parity = fair value + executable price per issuer + one-click best-execution buy, bracketed by the `fair_fill_guard` Anchor program that reverts off-fair fills and writes a Receipt PDA. Plus a divergence tape and a public `/api/v1/quote`.

## Status
- ✅ Universe (`src/data/universe.json`, `npm run universe` + `node scripts/pyth-onchain.mjs`), fair value, cross-issuer quotes, board `/`, ticker `/s/[symbol]`, tape `/tape`, wallet connect, `/api/v1/quote`, `/api/v1/universe`, snapshot cron.
- ✅ Guard program source written (`programs/fair_fill_guard/src/lib.rs`, nonce-seeded Receipt per `docs/PROGRAM_PATCH.md`). **Deploys to devnet only** — unaudited, and mainnet rent is ~1 SOL (~$115). `NEXT_PUBLIC_GUARD_CLUSTER=devnet` makes `mainnetGuardProgram()` return null so a devnet id can never be composed into a mainnet tx.
- ✅ Execution: `POST /api/v1/swap` (`src/lib/execute.ts`) returns one unsigned tx in mode `guarded` (snapshot→swap→verify, when `NEXT_PUBLIC_GUARD_PROGRAM_ID` is set) / `plain` (Jupiter swap, pre-sign fair-value check) / `ultra` (Ondo RFQ, non-sponsored names). `TradePanel` signs, confirms, records to `fills`, shows fill vs fair + Solscan. Encoders in `src/lib/guard.ts` need no IDL.
- ✅ Guard deployed to **devnet**: `ADcP7kHjLkyMmdsRNWvsrb62ivFg54BdGDenvM3eSCpS` (in `.env`). `scripts/guard-proof.mjs` passes both cases — Receipt PDA written at +0 bps, and a 300 bps fill reverts with `FillOffFairValue` (6012). Links in README.
- ✅ Real mainnet fill: `5Tdxx…nddf` (2 USDT → 0.0088995 NVDAx, 18 bps). Ondo refused at +98 bps by the pre-sign check — kept as evidence, not a failure. Wallet has ~4.8 USDT + 1.0 USDC left.
- ⬜ Remaining: Neon `DATABASE_URL`, Vercel deploy, demo video during US market hours. Record fill price from tx balance deltas rather than the quote (~2 bps off).
- ⬜ Neon `DATABASE_URL` for tape + fill history; Vercel deploy; README "what's real" table; demo video during US market hours (9:30–16:00 ET).

## Hard constraints of this environment
- Bandwidth ~150 KB/s. **Use `npm` (never pnpm); keep dependencies minimal.** New packages take minutes; think before adding.
- No Solana CLI / Anchor / cargo locally → program is built in Solana Playground.
- Pyth Hermes is key-gated and the free key is *not entitled to equities*. Do not depend on Hermes. Fair value reads Pyth's **sponsored on-chain accounts** (`src/lib/pyth-onchain.ts`, shard 1, 16 majors), then Jupiter Price v3 `stockData.price`, then Backpack perp marks.
- All three issuers' tokens are Token-2022. Ondo quotes only via JupiterZ RFQ (MM-signed tx; cannot compose with the guard).
- Input leg is USDC **or USDT** (`STABLES` in `src/lib/universe.ts`); the stablecoin's own USD price is fetched and applied, so a depeg does not distort the deviation we guard against. `/api/v1/swap` refuses up front if the wallet lacks the balance.
- Jupiter lite-api is keyless but rate-limited; a `JUPITER_API_KEY` from portal.jup.ag switches to api.jup.ag (not yet wired).

## Conventions
- Issuer-neutral copy everywhere: "the market is inefficient", never "issuer X is overpriced". The rights table is educational.
- Every screen should end in a signed transaction; a dashboard alone loses this hackathon.
- Unaudited code does not touch mainnet. The guard is devnet-only and proven there; mainnet fills use Jupiter's audited programs + a pre-sign fair-value check. Say this plainly in the README rather than hiding it.
- Commits: no AI attribution trailers.
- Env lives in `.env` (gitignored). `PYTH_API_KEY` is set but only useful for crypto feeds.
