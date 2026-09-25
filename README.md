# Parity

**Every stock on Solana. One fair price.**

The same US share now trades under three issuers on Solana — xStocks (`NVDAx`), Ondo Global Markets (`NVDAon`) and Backpack Securities (`NVDA`) — and they disagree, sometimes by whole percent. Within ten days of the SpaceX IPO the same share was priced from $122 to $176 depending on which token you bought. During testing for this submission, `NVDA` was quoted at **−479 bps on xStocks and +34 bps on Ondo within the same minute**, and Ondo moved from +34 to +98 bps in the minutes after that.

Nobody tells a buyer which of the three is fair, liquid, or redeemable. Parity is the layer above the issuers:

1. **Fair value** — Pyth's sponsored on-chain equity accounts read directly from mainnet, with Jupiter's stock reference and Backpack's 24/7 perp marks as fallbacks, picked by market session.
2. **Executable price by issuer** — live Jupiter quotes at $100 / $1k / $10k per issuer token, so you see effective price including impact, not just the last print.
3. **Buy at parity** — one transaction through the cheapest issuer, with the fill checked against the oracle. **The buy is refused before you are asked to sign if it is off fair value.**
4. **Divergence tape** — every issuer's premium/discount, sampled each minute.
5. **Public API** — `GET /api/v1/quote?symbol=NVDA&usd=1000` for agents and other builders.

Built solo for [Stocklana](https://hackathons.solana.com/hackathons/stocklana).

## What is real, and what is not

Everything below can be checked on-chain. Read the Guard section for the one deliberate limitation.

| Piece | Status |
|---|---|
| Universe — 1,069 underlyings, 234 multi-issuer, 41 with sponsored Pyth feeds | **Real.** Built from Jupiter's verified token list + issuer tags + Pyth feed ids (`npm run universe`) |
| Fair value | **Real.** Pyth `PriceUpdateV2` accounts read straight off mainnet — no API key, no Hermes dependency |
| Quotes at size | **Real.** Jupiter Ultra + Swap API, mainnet |
| Mainnet execution | **Real.** Signature below |
| Pre-sign fair-value check | **Real.** Refuses to return a transaction outside your bps tolerance — including a live refusal recorded during testing |
| `fair_fill_guard` on-chain guard | **Deployed and proven on devnet, deliberately not on mainnet.** See below |
| Tape history | Real once `DATABASE_URL` is set (Neon); live-only otherwise |
| Fill history (`fills` table) | Code complete; unpopulated without `DATABASE_URL` |

### Real mainnet transactions

| What | Signature |
|---|---|
| Buy 2 USDT → 0.0088995 `NVDAx`, 18 bps over fair | [`5Tdxx…nddf`](https://solscan.io/tx/5TdxxW3X5seDNtMBEDeGFaZpPHt23EwDTEHXwxaLrPhVMZAYFNoZMRQBKDSwmdbhaKabAfuGMnQxSu82kJPKnddf) |
| USDT → USDC (Ondo only pairs with USDC) | [`4qnsh…45TY`](https://solscan.io/tx/4qnsh9W2s44wqj5EUCDWvVoh5rhzQ5CjF9gyn6aVG4PSHgjqSHaqymcRsyUQ7ydp3pVdgqiyrqsgfWVZ8Noh45TY) |

A third fill was **refused, correctly**: Ondo's `NVDAon` quoted +98 bps against a ±50 bps tolerance, and the API returned

```
fill would be +98 bps from fair value (223.92); your guard is ±50 bps
```

rather than a signable transaction. That refusal is the product working, and it is why there is no Ondo signature in the table.

## The guard, and why it is on devnet

`programs/fair_fill_guard` brackets a swap with two instructions in the same transaction:

```
snapshot(nonce)   record stablecoin + stock balances before the swap
<swap>            any Jupiter / AMM instructions
verify(args)      measure the deltas, compute effective price per share,
                  read the Pyth account, revert if |fill − fair| > max_dev_bps,
                  else write a permanent Receipt PDA
```

It is issuer-agnostic and router-agnostic: it only reads the trader's balance deltas, so it works identically for xStocks, Ondo and Backpack, and behind any router.

**Deployed to devnet:** [`ADcP7kHjLkyMmdsRNWvsrb62ivFg54BdGDenvM3eSCpS`](https://solscan.io/account/ADcP7kHjLkyMmdsRNWvsrb62ivFg54BdGDenvM3eSCpS?cluster=devnet)

Proven there by `node scripts/guard-proof.mjs`, which runs it against a **live Pyth `PriceUpdateV2` account** — the same account type and code path a mainnet fill would use:

| Case | Result |
|---|---|
| Fill at fair value, ±50 bps | Receipt PDA written at +0 bps — [tx](https://solscan.io/tx/5yjDCZtX83Lmukn2EGJ7xQRFFfJamY4WAZexhxMxNd9Zmi3wC8mxfz4pBhMY2uCTgxaKjRcKVqo98Vdacn41a16U?cluster=devnet), [receipt](https://solscan.io/account/AHAXowoexeNwe5sa3ML4HbxLUc9oADzzM8FVicuvZ3uY?cluster=devnet) |
| Fill 300 bps above fair, ±50 bps | Whole transaction reverts, `FillOffFairValue` (6012) — [tx](https://solscan.io/tx/5nYbUA9ZvpMHkjUZipGCmuHU9bKNDnWC5MGDMxRdpPxVzcnLhdE2C5UpVJ1MSKSd7XnPPBaiWqRW37tzg9dvdwio?cluster=devnet) |

**It is not on mainnet on purpose.** It is unaudited, and unaudited code has no business sitting in the path of real funds on an immutable ledger. Mainnet buys instead route through Jupiter's audited programs with the pre-sign fair-value check, and `NEXT_PUBLIC_GUARD_CLUSTER=devnet` enforces this in code — `mainnetGuardProgram()` returns `null` unless the cluster is explicitly `mainnet`, so a devnet program id can never be composed into a mainnet transaction. After an audit, setting that one variable promotes every eligible buy from `plain` to `guarded` with no other change.

## Execution modes

`POST /api/v1/swap` returns exactly one unsigned transaction, in the strongest mode available:

| Mode | When | Protection |
|---|---|---|
| `guarded` | Composable venue, sponsored Pyth feed, guard deployed on the target cluster | On-chain: the transaction reverts if the fill is off fair value |
| `plain` | Composable venue, guard not on that cluster | Pre-sign check; the swap itself is Jupiter's audited program |
| `ultra` | Ondo (JupiterZ RFQ, market-maker co-signed) or no sponsored Pyth feed | Pre-sign check; RFQ transactions cannot be composed with a guard |

Every mode refuses to return a transaction whose quoted fill exceeds your tolerance, and refuses up front if the wallet cannot fund it. The input leg accepts **USDC or USDT**, and the stablecoin's own USD price is applied rather than assumed — USDT was quoted at $0.9996 during testing, which would otherwise have shifted every deviation by ~4 bps.

## Run

```bash
npm install
cp .env.example .env         # all keys optional; see comments
npm run universe             # rebuild src/data/universe.json from Jupiter + Pyth
npm run dev
```

Scripts:

```bash
node scripts/generate-demo-wallet.mjs                       # throwaway mainnet keypair
node scripts/test-swap.mjs NVDA <mint> 2 50 --pay=USDT --dry  # build + simulate, no send
node scripts/guard-proof.mjs                                # devnet pass/revert proof
```

## API

`GET /api/v1/quote?symbol=SPCX&usd=1000`

```json
{
  "symbol": "SPCX", "usd": 1000,
  "fair": { "price": 150.28, "source": "pyth-onchain", "onchainAccount": "<pyth account>", "marketState": "regular" },
  "venues": [ { "token": { "symbol": "SPCX", "issuer": "backpack" }, "effPx": { "1000": 149.28 }, "devBps": -67, "swapType": "aggregator" } ],
  "best": "<mint>", "worst": "<mint>", "spreadBps": 18, "savedUsd": 1.8
}
```

`POST /api/v1/swap` — `{ symbol, mint, usd, owner, maxDevBps, pay }` → `{ mode, tx, quote, reason }`
`POST /api/v1/swap/execute` — `{ requestId, signedTx }`, Ultra mode only
`GET /api/v1/fills` · `POST /api/v1/fills` — fill history
`GET /api/v1/universe?q=NV` — search; `&minIssuers=3` — issued by all three

## Architecture

```
src/lib/pyth-onchain.ts   read Pyth PriceUpdateV2 accounts straight from mainnet
src/lib/fairvalue.ts      pick a reference by market session, with fallbacks
src/lib/venues.ts         per-issuer effective price at size
src/lib/execute.ts        choose mode, build one transaction, refuse bad fills
src/lib/guard.ts          snapshot/verify encoders — Anchor discriminators, no IDL
programs/fair_fill_guard  the on-chain guard (anchor-lang only)
```

## Known limitations

- The guard is devnet-only until audited (above).
- `fills` rows need `DATABASE_URL`; the tape falls back to live-only without it.
- Recorded fill price is the quoted price, not the settled price — they differed by ~2 bps in the mainnet fill above. Deriving it from the transaction's balance deltas is the next correctness fix.
- Ondo tokens only pair with USDC on Jupiter, so a USDT buyer needs one conversion first.
- Backpack coverage is thin (44 tokens); many names exist on only one or two issuers.
