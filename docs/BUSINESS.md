# Parity — the business case

Every figure below was measured against live Solana markets on 9 October 2026 with
[`scripts/coverage-check.mjs`](../scripts/coverage-check.mjs). Re-run it and the numbers will
have moved; the shape of the problem will not.

---

## 1. The problem

A tokenized US stock is a claim on a share, and it does not trade at the share's price.

Across the 64 tokenized equities on Solana that have a real pool behind them today:

| | |
|---|---|
| Combined pool depth | **$40.5M** |
| Median distance from the share it tracks | **18 bps** — $18 per $10,000 |
| Mean distance | **41 bps** |
| Names more than 50 bps off | **13 (20%)** |
| Names more than 100 bps off | **5 (8%)** |
| Widest right now | DFDV −367 bps, MGM −254, BULL −249 |

None of this is visible at the point of purchase. A wallet shows you the token's price in
dollars. It does not tell you that AAPLx is 40 bps above Apple, or that you are about to pay
a 249 bps premium on BULL. The buyer discovers the gap, if ever, on the way out.

This is not an exotic failure. It is the same premium-to-NAV problem ETF investors have
checked for decades — except that on-chain there is no published NAV line to check against,
and the premium is paid by whoever clicks first.

## 2. Who feels it

**Retail buyers of tokenized equities on Solana.** The direct victims. They are paying a
median 18 bps and sometimes 250 bps for information they cannot get.

**Non-US investors specifically** — and this is where the pain compounds. Someone in Lagos
buying S&P exposure has no practical route to a US brokerage: FX controls, documentation,
minimums. Tokenized equities bought with stablecoins are a genuine route around that, and
it is growing. But that buyer has *already* paid an FX spread converting naira to USDT.
Paying another silent 63 bps on top, because no screen told them SPYx was trading above SPY,
is a real and regressive cost. The people with the least access to price transparency are the
ones using these instruments most.

**Wallets and aggregators.** They route the trade and own the trust relationship. None of
them currently show a fair-value reference for tokenized equities, because none of them have
one.

**The issuers themselves.** xStocks, Ondo and Backpack compete partly on tracking quality. An
independent, public measurement of how tightly each tracks is something they would rather
exist than not — provided it is issuer-neutral, which Parity's copy is by rule.

## 3. What Parity does

Three things, in order of how much they matter:

1. **Prices any tokenized stock against the share it tracks**, from an on-chain oracle, with
   the source, age and confidence shown next to every number. If the oracle is stale and the
   fallback is a perpetual mark, the page says so rather than quietly using it.
2. **Quotes every issuer at your actual size**, after price impact, and ranks them. The
   cheapest token at $1,000 is often not the cheapest at $25,000.
3. **Refuses the trade when nothing fills close enough.** The guard is a tolerance you set in
   basis points. If no route clears it, Parity does not build the transaction, and tells you
   what would have worked — a different issuer, a smaller size, or exactly what widening the
   tolerance would cost.

Every fill writes a public receipt: what you paid, what fair value was at that moment, which
protection applied, and the steps to verify it against the chain.

## 4. Why this is defensible

The hard part is not the interface, it is being *correct and honest at the same time*:

- **Fair value under adverse conditions.** Pyth's sponsored equity accounts cover 16 majors
  and go stale outside US market hours. Parity has a documented fallback chain with per-source
  staleness bounds, and surfaces which one it used. Most teams would print the stale number.
- **Comparability.** Ondo quotes by RFQ and carries almost no pool, so its last print drifts.
  Naively comparing it produced spreads of several hundred bps that nobody could have traded.
  Parity excludes it from pool-based comparison and quotes it properly at size instead. That
  decision cost coverage and bought credibility.
- **The guard.** An Anchor program that reads balance deltas and reverts off-fair fills,
  writing a Receipt PDA. Deployed and proven on devnet — a passing fill and a deliberate
  `FillOffFairValue` revert.

Honesty is the moat here, not the maths. A competitor who shows prettier numbers that are
occasionally wrong loses the only thing this product sells.

## 5. Market, and how it grows

Today's addressable surface is deliberately stated small: **64 tradable names, $40.5M of
pool.** Fee revenue on that is not a business yet.

It grows along three axes that are not speculative:

- **Listings.** The universe already contains 1,069 underlyings across 1,328 issued tokens —
  835 xStocks, 449 Ondo, 44 Backpack. Only 64 have crossed the liquidity threshold. Parity's
  coverage expands automatically as pools deepen; no new code.
- **Issuers.** Each new issuer multiplies the comparison surface. Today only 4 names have two
  pool-backed prints; that number is a direct function of issuer overlap.
- **Asset classes.** Nothing in the pricing or guard logic is equity-specific. The same
  primitive applies to tokenized treasuries, commodities and FX — anything with an off-chain
  reference price and multiple on-chain wrappers.

## 6. How it makes money

Ordered by how soon they are real:

1. **Routing fee on guarded execution.** Jupiter supports a platform fee account; 2–5 bps on
   routed volume, charged only when Parity's route beats the alternative it measured. The
   product already computes the saving, so the fee is justifiable per trade rather than
   asserted.
2. **Fair-value API for wallets and aggregators.** `/api/v1/quote` is already public and
   issuer-neutral. A wallet showing "this token is 63 bps above the share" is showing a trust
   signal it cannot build cheaply. Per-seat or per-call.
3. **Tracking-quality reporting for issuers.** The snapshot sampler already records every
   print. An independent, continuously measured tracking report is a thing issuers pay for in
   traditional ETF markets.

Costs are near zero: Jupiter and Pyth reads, a Neon instance, Vercel. The sampler is the only
always-on component.

## 7. What is real today

Not a prototype of the parts that matter:

- Deployed and public at [parity-kappa.vercel.app](https://parity-kappa.vercel.app).
- **Real mainnet fills** executed and recorded, with public receipts.
- **The guard deployed and proven on devnet** — `ADcP7kHjLkyMmdsRNWvsrb62ivFg54BdGDenvM3eSCpS`
  — both a passing fill and a deliberate revert.
- 64 tokenized stocks priced live against their underlying.
- Public `/api/v1/quote` and `/api/v1/universe`.
- Neon-backed receipt ledger and a snapshot sampler building spread history.

## 8. What we do not know, and the risks

Stated plainly, because the product's whole claim is that it tells you what it does not know:

- **Liquidity is thin.** $40.5M across 64 names means size moves price. Parity measures impact
  rather than hiding it, but it cannot create depth.
- **Fair value outside market hours is a fallback, not a print.** A 200 bps "gap" at 2am may
  be the token pricing ahead of the next session. The methodology page says so; a careless
  reader could still over-interpret a number.
- **The guard is unaudited and therefore devnet-only.** Mainnet fills use Jupiter's audited
  programs plus a pre-sign fair-value check. This is a deliberate choice: immutable state
  should not hold strangers' money on unaudited code. It also means the strongest technical
  claim is not yet the one protecting real trades.
- **Regulatory exposure is the issuers', but it is not zero for us.** Parity never custodies,
  never issues, and routes through existing venues — but tokenized equities sit in a moving
  regulatory picture, particularly for non-US retail.
- **Issuer dependency.** If one issuer dominates, the comparison half of the product thins out
  and only the fair-value half survives. That half is the larger one, which is why coverage
  now leads with it.

## 9. Next

| Horizon | What |
|---|---|
| Immediate | Audit the guard, then enable it on mainnet — this is the one blocking item between the product and its strongest claim. |
| Near | Alerts on tracking breaks; sell-side quotes (the engine is symmetric); widen the sampler so the history tab has months, not days. |
| Later | The fair-value API as a product for wallets; extend beyond equities; a public tracking-quality report per issuer. |

---

*Issuer-neutral by rule: Parity measures the market, it does not argue that any issuer is
overpriced. Where it cannot measure something, it says so.*
