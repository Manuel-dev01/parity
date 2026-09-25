# Parity

**Every stock on Solana. One fair price.**

Live → **https://parity-manuel-dev01s-projects.vercel.app** · Built for
[Stocklana](https://hackathons.solana.com/hackathons/stocklana)

The same US share now trades under three issuers on Solana — xStocks (`NVDAx`), Ondo Global
Markets (`NVDAon`) and Backpack Securities (`NVDA`) — and the prices disagree. Within ten days of
the SpaceX listing the same share was priced from **$122 to $176** depending on which token you
bought. During testing for this submission, `NVDA` quoted **−479 bps on one issuer and +34 on
another within the same minute**.

Nobody tells a buyer which of them is fair, liquid, or redeemable. Parity is the layer above the
issuers: it reads the oracle price, quotes every issuer at *your* size, buys the closest one, and
refuses the trade outright if nothing is close enough.

---

## Contents

- [Try it in two minutes](#try-it-in-two-minutes)
- [What it does](#what-it-does)
- [What is real, and what is not](#what-is-real-and-what-is-not)
- [Proof on-chain](#proof-on-chain)
- [The guard, and why it is on devnet](#the-guard-and-why-it-is-on-devnet)
- [Run it locally](#run-it-locally)
- [API](#api)
- [Repository map](#repository-map)
- [Documentation](#documentation)
- [Known limitations](#known-limitations)

---

## Try it in two minutes

No wallet needed for the first three.

1. **[Open the landing page](https://parity-manuel-dev01s-projects.vercel.app)** and hover the big
   wordmark. Three issuer inks, printed out of register by how far each token actually is from
   fair value, snapping together when you hover.
2. **[Markets](https://parity-manuel-dev01s-projects.vercel.app/markets)** — every share ranked by
   the gap between its cheapest and costliest token, right now.
3. **[A ticker](https://parity-manuel-dev01s-projects.vercel.app/s/SPCX)** — the headline names
   the token to buy at your size. Change the size; the answer can change with it. Tap any dotted
   figure to see where the number came from.
4. **Drag the price guard down to ~10 bps and press Review and sign.** Parity refuses to build the
   trade and offers what *would* work instead. *This is the product.*
5. **[Receipts](https://parity-manuel-dev01s-projects.vercel.app/receipts)** — what was paid, fair
   value at that moment, and steps to verify it against the chain without trusting us.

## What it does

| | |
|---|---|
| **Fair value** | Pyth's sponsored on-chain accounts, read directly from mainnet. Parity does not set the price and does not average it with its own quotes. The source in use is always named on screen. |
| **Executable price** | What each issuer's token costs at *your* size, including impact — not the last trade. The cheapest at $1,000 is often not the cheapest at $100,000. |
| **One transaction** | Buy the closest token to fair through Jupiter, in a single signature. |
| **A guard you set** | If nothing fills within your tolerance, Parity does not build the trade. Nothing is signed, nothing is spent, and it shows what it would have cost. |
| **Public receipts** | Every fill publishes price, fair value, protection tier, and the other issuers' prices at that moment. |
| **An open API** | `GET /api/v1/quote?symbol=NVDA&usd=1000` — keyless, documented below. |

Coverage: **1,069** tokenized US shares, **234** issued by two or more issuers, **41** with a
sponsored Pyth on-chain feed.

## What is real, and what is not

Everything here can be checked on-chain. The one deliberate limitation is in the next section.

| Piece | Status |
|---|---|
| Universe | **Real.** Built from Jupiter's verified token list + issuer tags + Pyth feed ids (`npm run universe`) |
| Fair value | **Real.** Pyth `PriceUpdateV2` accounts read straight off mainnet — no API key, no Hermes |
| Quotes at size | **Real.** Jupiter Swap + Ultra, mainnet, including price impact |
| Mainnet execution | **Real.** Signatures below |
| Pre-signature guard | **Real.** Refuses to return a transaction outside your tolerance — including a live refusal recorded during testing |
| `fair_fill_guard` on-chain guard | **Deployed and proven on devnet, deliberately not on mainnet.** See below |
| Divergence tape | **Real.** Neon Postgres, sampled every minute by a Railway cron (`ops/sampler`) |
| Holdings | **Real.** Token accounts read from both token programs; "if you sold today" is a live sell-side quote |
| Receipts | **Real.** `/receipts` and `/r/[sig]` render recorded fills, each linking to its transaction |
| "Best of N" on a fill | **Real going forward.** Every issuer's price at that size is captured at build time and stored with the fill; rank is derived from it. Older fills say their rank is unknown |

**What Parity does not know**, stated in the interface as well as here: trades made anywhere else
(so Holdings shows balances from the chain but can only show what you paid for fills it routed),
and any price history from before its sampler first ran.

## Proof on-chain

| What | Signature |
|---|---|
| Buy 2 USDT → 0.0088995 `NVDAx` — quoted 18 bps over fair, **settled 38 bps** | [`5Tdxx…nddf`](https://solscan.io/tx/5TdxxW3X5seDNtMBEDeGFaZpPHt23EwDTEHXwxaLrPhVMZAYFNoZMRQBKDSwmdbhaKabAfuGMnQxSu82kJPKnddf) |
| USDT → USDC (Ondo pairs only with USDC) | [`4qnsh…45TY`](https://solscan.io/tx/4qnsh9W2s44wqj5EUCDWvVoh5rhzQ5CjF9gyn6aVG4PSHgjqSHaqymcRsyUQ7ydp3pVdgqiyrqsgfWVZ8Noh45TY) |

A third fill was **refused, correctly**: Ondo's `NVDAon` quoted +98 bps against a ±50 bps
tolerance, and the API returned

```
fill would be +98 bps from fair value (223.92); your guard is ±50 bps
```

rather than a signable transaction. That refusal is the product working, and it is why there is no
Ondo signature in the table.

## The guard, and why it is on devnet

`programs/fair_fill_guard` brackets a swap with two instructions in one transaction:

```
snapshot(nonce)   record stablecoin + stock balances before the swap
<swap>            any Jupiter / AMM instructions
verify(args)      measure the deltas, compute effective price per share,
                  read Pyth, revert the whole transaction if the fill is
                  off fair value, else write a permanent Receipt PDA
```

It is issuer-agnostic and router-agnostic: it only reads the trader's balance deltas.

**Deployed to devnet:**
[`ADcP7kHjLkyMmdsRNWvsrb62ivFg54BdGDenvM3eSCpS`](https://solscan.io/account/ADcP7kHjLkyMmdsRNWvsrb62ivFg54BdGDenvM3eSCpS?cluster=devnet)

Proven there by `node scripts/guard-proof.mjs`, against a **live Pyth account** — the same account
type and instruction order a mainnet fill would use:

| Case | Result |
|---|---|
| Fill at fair value, ±50 bps | Receipt PDA written at +0 bps — [tx](https://solscan.io/tx/5yjDCZtX83Lmukn2EGJ7xQRFFfJamY4WAZexhxMxNd9Zmi3wC8mxfz4pBhMY2uCTgxaKjRcKVqo98Vdacn41a16U?cluster=devnet) · [receipt](https://solscan.io/account/AHAXowoexeNwe5sa3ML4HbxLUc9oADzzM8FVicuvZ3uY?cluster=devnet) |
| Fill 300 bps above fair, ±50 bps | Whole transaction reverts, `FillOffFairValue` (6012) — [tx](https://solscan.io/tx/5nYbUA9ZvpMHkjUZipGCmuHU9bKNDnWC5MGDMxRdpPxVzcnLhdE2C5UpVJ1MSKSd7XnPPBaiWqRW37tzg9dvdwio?cluster=devnet) |

**It is not on mainnet on purpose.** It is unaudited, and unaudited code has no business in the
path of real funds on an immutable ledger. Mainnet buys route through Jupiter's audited programs
with the pre-signature check instead, and `NEXT_PUBLIC_GUARD_CLUSTER=devnet` enforces that in
code — `mainnetGuardProgram()` returns `null` unless the cluster is explicitly `mainnet`, so a
devnet program id can never be composed into a mainnet transaction. After an audit, setting that
one variable promotes every eligible buy from `plain` to `guarded`.

## Run it locally

```bash
git clone https://github.com/Manuel-dev01/parity && cd parity
npm install
cp .env.example .env     # every key is optional; it runs keyless
npm run dev              # http://localhost:3000
```

It works with an empty `.env` — fair value, quotes and the whole read path are keyless. Add keys
to lift the limits:

| Variable | Effect if unset |
|---|---|
| `SOLANA_RPC` | falls back to the public mainnet RPC (rate-limited). **Server-only — never `NEXT_PUBLIC_`, the URL carries a key** |
| `JUPITER_API_KEY` | uses the keyless endpoint; noticeably slower under load |
| `DATABASE_URL` | no tape history and no receipts; every page still renders and says so |
| `NEXT_PUBLIC_GUARD_PROGRAM_ID` + `NEXT_PUBLIC_GUARD_CLUSTER` | guard shown as not deployed; buys use the pre-signature check |
| `PYTH_API_KEY` | Pyth on-chain accounts are used regardless; this only adds the Hermes fallback |

Useful scripts:

```bash
npm run universe                                               # rebuild src/data/universe.json
node scripts/guard-proof.mjs                                   # devnet pass + deliberate revert
node scripts/test-swap.mjs NVDA <mint> 2 50 --pay=USDT --dry   # build + simulate, no send
node ops/sweep.mjs                                             # Playwright sweep → ops/shots/
```

## API

Keyless and public. Meant for agents and other builders as much as for the UI.

**`GET /api/v1/quote?symbol=NVDA&usd=1000`** — fair value plus every issuer's executable price.
Add `&sizes=100,10000` for a size ladder.

```json
{
  "symbol": "SPCX", "usd": 1000,
  "fair": { "price": 149.20, "source": "pyth-onchain", "onchainAccount": "…", "ageSec": 3, "marketState": "regular" },
  "venues": [{ "token": { "symbol": "SPCXx", "issuer": "xstocks" }, "effPx": { "1000": 149.47 }, "devBps": 18, "swapType": "aggregator" }],
  "best": "<mint>", "worst": "<mint>", "spreadBps": 1, "savedUsd": 0.07
}
```

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/universe?q=NV&minIssuers=3` | search the universe |
| `POST /api/v1/swap` | `{symbol, mint, usd, owner, maxDevBps, pay}` → one unsigned transaction, or a refusal carrying real alternatives |
| `POST /api/v1/swap/execute` | `{requestId, signedTx}` — Ultra/RFQ orders only |
| `GET /api/v1/swap/status?sig=…&mint=…&owner=…` | confirmation state and the settled amount |
| `GET /api/v1/holdings?owner=…` | positions grouped by share, with live exit quotes |
| `GET /api/v1/fills` · `POST /api/v1/fills` | the public receipt ledger |

## Repository map

```
src/app/          routes: / · /markets · /s/[symbol] · /holdings · /receipts · /r/[sig] · /methodology
src/lib/          fair value, venues, board, execution, guard encoders, Jupiter client, db
src/components/   broadsheet (shared chrome) · ticker · landing · markets · holdings · wallet
src/data/         universe.json — generated, not hand-edited
programs/         fair_fill_guard — the Anchor guard
scripts/          universe build, guard proof, swap tests, demo wallet
ops/              sampler (Railway cron) · sweep.mjs (Playwright audit)
docs/             architecture, demo, program build notes
design/           the approved Broadsheet artboards
```

## Documentation

| Doc | What it covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How a price becomes an answer: fair value, executable price, the three execution modes, refusals, receipts, caching, failure handling |
| [docs/DEMO.md](docs/DEMO.md) | Demo checklist — pre-flight, click path, fallbacks |
| [docs/DEMO-SCRIPT.md](docs/DEMO-SCRIPT.md) | Shot-by-shot video script with voiceover |
| [docs/PROGRAM.md](docs/PROGRAM.md) | Building and deploying the guard in Solana Playground |
| [docs/PROGRAM_PATCH.md](docs/PROGRAM_PATCH.md) | Why the Receipt PDA is seeded by a client nonce and not the slot |
| [docs/STRATEGY.md](docs/STRATEGY.md) | Original build plan and rubric analysis (working notes, partly stale) |
| [CLAUDE.md](CLAUDE.md) · [AGENTS.md](AGENTS.md) | Working notes for AI assistants — internal, not part of the product |

## Known limitations

- The guard is devnet-only until audited (above).
- The divergence tape begins when the sampler first ran. There is no back-history, and the charts
  state their own sample count rather than implying more.
- Holdings can only show what you paid for fills Parity recorded; a wallet that bought elsewhere
  shows balances with no purchase history, and says so.
- The success screen reports the settled fill; older receipts recorded before that change carry
  the quoted price instead.
- Ondo tokens pair only with USDC on Jupiter, so a USDT buyer needs one conversion first.
- Backpack lists 44 symbols, so many shares exist on only one or two issuers.
- Ondo quotes only during US market hours.
