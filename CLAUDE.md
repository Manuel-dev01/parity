# Parity — working notes for Claude

Originally a Stocklana entry (not submitted). **Now targeting Colosseum Crypto World's Fair + the Superteam Nigeria side track — submissions close ~2026-10-13.** Judged on product functionality, potential impact, novelty, UX, **open-source**, and **business plan**; the Nigeria track also requires registering on Colosseum marked "Nigeria", submitting to the Solana ecosystem track *and* the Superteam Earn listing, and attending 3+ pitch reviews plus demo day. Strategy notes in `docs/STRATEGY.md` are from the Stocklana run and partly stale. Program build/deploy steps are in `docs/PROGRAM.md`.

## What this is
Every US stock exists 2–3 times on Solana (xStocks `NVDAx`, Ondo `NVDAon`, Backpack `NVDA`) and the prices disagree. Parity = fair value + executable price per issuer + one-click best-execution buy, bracketed by the `fair_fill_guard` Anchor program that reverts off-fair fills and writes a Receipt PDA. Plus a divergence tape and a public `/api/v1/quote`.

## Status
- ✅ Universe (`src/data/universe.json`, `npm run universe` + `node scripts/pyth-onchain.mjs`), fair value, cross-issuer quotes, board `/`, ticker `/s/[symbol]`, tape `/tape`, wallet connect, `/api/v1/quote`, `/api/v1/universe`, snapshot cron.
- ✅ Guard program source written (`programs/fair_fill_guard/src/lib.rs`, nonce-seeded Receipt per `docs/PROGRAM_PATCH.md`). **Deploys to devnet only** — unaudited, and mainnet rent is ~1 SOL (~$115). `NEXT_PUBLIC_GUARD_CLUSTER=devnet` makes `mainnetGuardProgram()` return null so a devnet id can never be composed into a mainnet tx.
- ✅ Execution: `POST /api/v1/swap` (`src/lib/execute.ts`) returns one unsigned tx in mode `guarded` (snapshot→swap→verify, when `NEXT_PUBLIC_GUARD_PROGRAM_ID` is set) / `plain` (Jupiter swap, pre-sign fair-value check) / `ultra` (Ondo RFQ, non-sponsored names). `TradePanel` signs, confirms, records to `fills`, shows fill vs fair + Solscan. Encoders in `src/lib/guard.ts` need no IDL.
- ✅ Guard deployed to **devnet**: `ADcP7kHjLkyMmdsRNWvsrb62ivFg54BdGDenvM3eSCpS` (in `.env`). `scripts/guard-proof.mjs` passes both cases — Receipt PDA written at +0 bps, and a 300 bps fill reverts with `FillOffFairValue` (6012). Links in README.
- ✅ Real mainnet fill: `5Tdxx…nddf` (2 USDT → 0.0088995 NVDAx, 18 bps). Ondo refused at +98 bps by the pre-sign check — kept as evidence, not a failure. Wallet has ~4.8 USDT + 1.0 USDC left.
- ✅ Deployed and wired: `parity-manuel-dev01s-projects.vercel.app`, Neon `DATABASE_URL` live
  (`/api/v1/fills` reports `configured: true`), two real mainnet fills in the ledger.
- ✅ Demo film: a rendered 5:00 MP4 (1920×1080, 60fps) plus the whole pipeline in `ops/video/`
  — see `ops/video/README.md`, which states exactly what is real footage and what is
  presentation. Built here because no native ffmpeg will download over this link: frames are
  composited on a canvas and encoded with WebCodecs (H.264 + AAC) inside Chromium. The
  voiceover is Microsoft `en-US-AndrewNeural` over Edge's free Read Aloud endpoint.
  `docs/DEMO-SCRIPT.md` is still the script for recording a *live* demo during market hours.
- ✅ Coverage widened 2026-10-09: the markets page showed **4** stocks, because a row needed two
  pool-backed prints. It now shows every tradable name — **64**, including SPY, NVDA, AAPL, QQQ —
  reporting a spread where one exists and distance from the share where it does not. `boardCandidates()`
  replaced `multiIssuer(2)`: wider *and* cheaper (6 price calls vs 10). Landing still filters to
  comparable names because the hero draws one ink per issuer.
- ✅ `LICENSE` (MIT) and `docs/BUSINESS.md` added — both are explicit judging criteria.
- ⬜ Remaining: record fill price from tx balance deltas rather than the quote (~2 bps off); the
  demo film's Markets footage predates the widening (narration is unaffected and still accurate).

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
