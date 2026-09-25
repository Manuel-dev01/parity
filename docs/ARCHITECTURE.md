# Architecture

How Parity turns three disagreeing token prices into one answer, and what it refuses to do along
the way.

- [The shape of it](#the-shape-of-it)
- [Fair value](#fair-value)
- [Executable price](#executable-price)
- [Execution, and the three modes](#execution-and-the-three-modes)
- [The guard program](#the-guard-program)
- [Refusals](#refusals)
- [Receipts and rank](#receipts-and-rank)
- [Data and caching](#data-and-caching)
- [Failure handling](#failure-handling)
- [Module map](#module-map)

---

## The shape of it

```
                    ┌──────────────────────────────────────────────┐
  Pyth on-chain ───▶│  fairvalue.ts   one fair price per share      │
  (PriceUpdateV2)   │                 + which source, + how old      │
                    └───────────────┬──────────────────────────────┘
                                    │
  Jupiter Price  ──▶┌───────────────▼──────────────┐
  Jupiter Swap   ──▶│  venues.ts / board.ts        │  what each issuer's token
  Jupiter Ultra  ──▶│  executable price per issuer │  actually costs at your size
                    └───────────────┬──────────────┘
                                    │
                    ┌───────────────▼──────────────┐
                    │  execute.ts                  │  choose the mode, build ONE
                    │  build · check · refuse      │  unsigned transaction
                    └───────┬──────────────┬───────┘
                            │              │
                    wallet signs      refusal + real alternatives
                            │
                    ┌───────▼──────────────────────┐
                    │  fills (Neon) + Receipt PDA  │  public, permanent
                    └──────────────────────────────┘
```

Everything above the wallet is read-only and keyless-capable. Nothing is stored about a user: the
wallet address is a query parameter, never a session.

---

## Fair value

`src/lib/fairvalue.ts`

The reference price for one underlying share. Read directly from **Pyth's sponsored on-chain
`PriceUpdateV2` accounts** on mainnet — the same accounts a Solana program can verify — parsed by
byte offset in `src/lib/pyth-onchain.ts`. No Hermes dependency, no API key.

Sources are tried in order, and **the one actually used is always named in the interface**:

| Order | Source | Used when |
|---|---|---|
| 1 | `pyth-onchain` | account is fresh (90s in session, 900s outside) |
| 2 | `pyth-us` | regular session, Hermes key present and fresh |
| 3 | `pyth-24/7` | index feed fresh within 180s |
| 4 | `jupiter-stock` | Jupiter's stock reference within 120s |
| 5 | `backpack-perp` | a live perpetual mark, which never goes stale |

Staleness is **per source** (`STALE_AFTER`). This matters more than it sounds: a single global
threshold meant a five-minute-old stock reference was selected *and then* marked stale, which
blocked quoting entirely for every share without a sponsored Pyth account.

## Executable price

`src/lib/venues.ts`

The number that matters is not the last trade — it is what *you* would pay for *your* size. Each
issuer's token is quoted through Jupiter for the exact amount entered, so price impact and fees
are inside the figure. This is why the ranking reorders when you change the size, and why the
ticker re-quotes rather than interpolating.

Deviation is always `(executable − fair) ÷ fair`, in basis points. The **input stablecoin is
priced too** — USDT quoted $0.9996 during testing, and assuming a dollar would have shifted every
reading by about 4 bps.

### Why the board and the ticker measure differently

`src/lib/board.ts` powers Markets and the landing, and compares **last prints** across issuers —
cheap enough to do for sixty names at once. But a last print is only meaningful if a pool stands
behind it. Ondo trades by RFQ and carries almost no AMM liquidity, so its printed price drifts
freely; comparing it produced spreads of several hundred basis points that nobody could have
traded. Prints below `POOL_FLOOR` are marked `comparable: false` and excluded from spreads, on the
board *and* in the sampled history. RFQ names are priced properly on the ticker, where each is
quoted at size.

## Execution, and the three modes

`src/lib/execute.ts` → `POST /api/v1/swap`

One request returns exactly one unsigned transaction, in the strongest mode available:

| Mode | Chosen when | What protects the fill |
|---|---|---|
| `guarded` | composable venue + sponsored Pyth feed + guard deployed **on this cluster** | the transaction reverts on-chain if the fill lands off fair |
| `plain` | composable venue, guard not on this cluster | pre-signature check; the swap is Jupiter's audited program |
| `ultra` | Ondo (RFQ, market-maker co-signed) or no sponsored feed | pre-signature check; RFQ transactions cannot be composed |

`guarded` assembles: Jupiter's compute-budget and setup instructions → `snapshot` → the swap →
`verify`, compiled to a v0 message with Jupiter's address lookup tables. Setup instructions run
*before* `snapshot` so the token account exists to be measured.

Every mode refuses to return a transaction whose quoted fill exceeds the caller's tolerance. Price
is checked **before** funding, because a bad quote is true regardless of what the wallet holds.

## The guard program

`programs/fair_fill_guard/` — Anchor, `anchor-lang` only, ~300 lines.

```
snapshot(nonce)   record stablecoin + stock balances before the swap
<swap>            any router's instructions
verify(args)      measure the deltas → effective price per share
                  read Pyth in the same transaction
                  revert the whole trade if |fill − fair| > max_dev_bps
                  otherwise write a permanent Receipt PDA
```

Router-agnostic by construction: it only reads the trader's balance deltas, so it works behind any
swap, for any issuer.

**Two design decisions worth knowing:**

- **No dependencies beyond `anchor-lang`.** Solana Playground — the only toolchain available on
  this machine — builds against a fixed crate list with no `pyth-solana-receiver-sdk`. The program
  parses `PriceUpdateV2` and the SPL/Token-2022 layouts itself, with explicit owner checks and a
  fully-verified requirement standing in for the typed wrappers.
- **The Receipt PDA is seeded by a client nonce, not the slot.** The original design seeded it with
  `snapshot.slot`, which is only known once the transaction lands — a client can never supply the
  correct address up front, so the `init` constraint could never match. See
  [PROGRAM_PATCH.md](PROGRAM_PATCH.md).

**Deployed to devnet only**, deliberately: it is unaudited. `guardDeployment()` returns the cluster
and `mainnetGuardProgram()` returns `null` unless `NEXT_PUBLIC_GUARD_CLUSTER=mainnet`, so a devnet
program id can never be composed into a mainnet transaction. Promotion after an audit is one
environment variable.

## Refusals

A held trade is the product working, so it carries what to do next rather than an error string.
When the check fails, `execute.ts` quotes the siblings and a ladder of smaller sizes before
returning:

- **another issuer** that passes at this size,
- **the largest size** that still fits at this venue, probed against real liquidity,
- **widening the guard**, with the cost stated in dollars — capped at `GUARD_MAX_BPS` so the offer
  is always one the slider can express.

Each option only appears if a real quote supports it. An empty list means the whole market is
outside your tolerance, which is itself the answer.

## Receipts and rank

A receipt cannot honestly claim a fill was the best available without knowing what the others were
quoting at that moment — so the swap build captures **every issuer's executable price at the chosen
size** and stores it with the fill (`fills.routes`). Rank is derived from that snapshot, never
inferred later. Fills recorded before this existed say their rank is unknown.

The **settled** amount is read back from the confirmed transaction's balance delta, not the quote.
Jupiter is given up to the guard in slippage, so publishing the quote would mean publishing a
number the chain disagrees with — on a page that tells readers to divide what left the wallet by
what arrived.

## Data and caching

- **`src/data/universe.json`** — 1,069 underlyings, built by `npm run universe` from Jupiter's
  verified token list plus Pyth feed ids. Regenerated, not hand-edited.
- **Neon Postgres** — `snapshots` (the divergence tape) and `fills` (receipts). Accessed over
  Neon's SQL-over-HTTP endpoint, no driver.
- **Sampling** — `ops/sampler` runs on a Railway per-minute cron. Vercel's Hobby plan caps its own
  cron at one run per day, which cannot produce a readable tape.
- **The board is cached 60s** in Next's shared data cache. An in-process map was not enough:
  requests land on different instances, so page loads swung between 3s and 25s.
- **Jupiter** — one host decision in `src/lib/jupiter.ts`; `JUPITER_API_KEY` switches every call
  from the rate-limited keyless endpoint to `api.jup.ag`.

## Failure handling

The governing rule is that **"we could not read this" and "there is nothing here" are different
claims**, and the interface must never substitute one for the other.

- Every outbound fetch is bounded by an `AbortSignal` timeout. Nothing upstream can hang a render.
- A failed database read renders *"the record could not be read"*, not an empty ledger.
- A failed balance read does not report an empty wallet.
- A lost quote race renders *"quoting…"* or *"quotes could not be read"*, never *"nothing is
  quoting"* — that would be a claim about the market caused by our own timeout.
- A single failed status poll does not discard a transaction that may have landed.

## Module map

| Path | Responsibility |
|---|---|
| `src/lib/pyth-onchain.ts` | read and parse Pyth `PriceUpdateV2` accounts |
| `src/lib/fairvalue.ts` | pick a reference price by session, with per-source staleness |
| `src/lib/venues.ts` | executable price per issuer at a given size |
| `src/lib/board.ts` | the multi-name board; pool-backed comparability |
| `src/lib/execute.ts` | mode selection, transaction assembly, refusals, route snapshot |
| `src/lib/guard.ts` | `snapshot`/`verify` encoders — Anchor discriminators, no IDL needed |
| `src/lib/jupiter.ts` | one Jupiter client: host, key, timeouts |
| `src/lib/universe.ts` | symbol/mint lookup, accepted stablecoins |
| `src/lib/db.ts` | Neon over HTTP; degrades to empty when unconfigured |
| `src/components/broadsheet/` | shared chrome: dateline, masthead, footer, formatters |
| `src/components/ticker/` | the main screen: number line, route cards, order slip, popovers |
| `programs/fair_fill_guard/` | the on-chain guard |
| `ops/sampler/` | the per-minute tape sampler (Railway) |
| `ops/sweep.mjs` | Playwright sweep: console errors, overflow, dead controls, screenshots |
