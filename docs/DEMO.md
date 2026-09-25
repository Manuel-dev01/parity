# Parity — demo checklist

Live: https://parity-manuel-dev01s-projects.vercel.app · Repo: https://github.com/Manuel-dev01/parity

Everything below is real. No step asks you to show simulated data. If something is unavailable at
demo time, the fallback is written next to it — say the fallback out loud rather than working
around it, because "we show you when we don't know" is the product's argument.

---

## A. Pre-flight (do this 30 minutes before)

| # | Check | How | Good |
|---|---|---|---|
| A1 | US market session | `/markets` dateline, or any ticker's dateline | "Regular session" is ideal — Ondo only quotes during market hours. Pre/post works; closed means Ondo will refuse |
| A2 | Demo wallet funded | `/holdings` after connecting | Shows NVDAx position + USDT/USDC buying power |
| A3 | Wallet has SOL for fees | Phantom balance | ≥ 0.01 SOL |
| A4 | Fair value is live | Any ticker → fair value block | Source reads `pyth-onchain` and age is seconds, not minutes |
| A5 | Receipts render | `/receipts` | At least one row, links to `/r/<sig>` |
| A6 | Sampler alive | `/markets?view=history` | Sample count in the Fig. 2 caption is increasing between loads |
| A7 | Spread worth showing | `/markets` | Top row's spread ≥ ~30 bps. If everything is tight, pick the widest name and say so |

**Wallet**: connect Phantom or Backpack to the demo wallet
`4N6FeA9CzNSZVE3qTd6PevishNUtWDjwry3Nv66BWdvA`. Browser extension, not the mobile app.

---

## B. The demo, in order

### 1. The problem (landing, ~20s)
1. Open `/`.
2. Point at the hero: **three issuer inks printed out of register**, each offset by that token's
   real distance from fair value right now.
3. **Hover the wordmark** — they snap into register. Say: *"that's what Parity does."*
4. Read the live caption: "N bps between the prints".
5. Scroll to **Fig. 1** — each token's distance from fair, sampled live during this visit.

> Say: *"Every US stock now exists two or three times on Solana. The prices disagree, and nobody
> tells you which one is fair."*

**Fallback**: if the hero shows two inks not three, that is correct — Backpack lists only 44
symbols. Say so; it is a fact about the market, not a gap in the product.

### 2. Which is mispriced (markets, ~20s)
1. Click **Markets**.
2. Top row is the widest spread on Solana right now. Point at the **dispersion axis**: the centre
   rule is fair value, each dot is an issuer.
3. Note the footnote: only tokens with a real pool are compared. Ondo trades by RFQ, so its last
   price cannot be compared this way.
4. Click **History** → real sampled spreads, with the sample count stated in the caption.

### 3. What to buy at your size (ticker, ~40s) — **the core**
1. Open a three-issuer name: **`/s/SPCX`** (or MSTR / HOOD).
2. Read the headline: *"At $1,000, buy X."* That is the answer.
3. **Change the size to $25,000** using a preset chip. Watch the ranking reorder.
   > Say: *"The cheapest token at a thousand dollars is often not the cheapest at twenty-five."*
4. **Tap the fair value** (dotted underline) → source popover: the oracle, its age, the confidence
   band in dollars and bps, and a link to verify the account on-chain.
5. **Tap a card price** → what that token would actually cost at your size, including impact.
6. Point at **Fig. 1**: each token against fair, with your guard band drawn behind.

### 4. The guard holding a trade (~25s) — **the strongest moment**
1. Drag the **price guard slider down to ~10 bps**.
2. Press **Review and sign**.
3. The slip is replaced by **"The guard held this trade"**, with the real distance from fair and
   *"Nothing was signed and nothing was spent."*
4. Read the offered options aloud — they are computed from live quotes: another issuer that
   passes, a smaller size that fits, or what widening the guard would actually cost in dollars.

> Say: *"This is the product working. It refuses rather than filling you badly."*

### 5. A real fill (~30s)
1. Set the guard back to **±50 bps** and the size to **$2**.
2. Press **Review and sign** → approve in the wallet.
3. On the success panel: fill price, fair value, deviation, transaction link.
4. Open the **Solscan link** — a real mainnet transaction.

**Fallback**: if it refuses, the market is genuinely outside your guard. Widen and retry, and say
that out loud — a refusal on camera is a feature, not a failure.

### 6. Proof (~20s)
1. Click **View receipt** → `/r/<sig>`: permanent, public, shareable.
2. Point at the **protection tier**, the market around the fill, and **"Check it yourself"** —
   numbered steps to verify against the chain *without trusting Parity*.
3. Click **Receipts** for the public ledger, filterable by tier.

### 7. Holdings + honesty (~20s)
1. Click **Holdings** → the position you just added, grouped by share not by token.
2. Point at **"If you sold today"** — a live sell-side quote for the whole position.
3. Finish on **Methodology → "What Parity does not know"**.

> Say: *"The guard program is deployed on devnet, not mainnet, because it is unaudited. Mainnet
> trades run through Jupiter's audited programs with a pre-sign check. One environment variable
> promotes it after an audit — we would rather say that than imply protection we can't deliver."*

---

## C. Things to say when asked

- **"Is the guard real?"** Yes — deployed on devnet at `ADcP7kHjLkyMmdsRNWvsrb62ivFg54BdGDenvM3eSCpS`,
  and proven with two transactions: one writing a Receipt PDA, one reverting with
  `FillOffFairValue`. Both linked in the README. It is off mainnet deliberately.
- **"Where does fair value come from?"** Pyth's sponsored on-chain accounts, read directly. Not an
  average of our own quotes. Fallbacks are named on screen whenever one is in use.
- **"Why only two issuers on this stock?"** Backpack lists 44 symbols; xStocks and Ondo list far
  more. Parity shows whoever actually issues that share.
- **"What's not real?"** The README has a what's-real table. The honest gaps: history only goes
  back to when our sampler started, and we can only show what you paid for fills we routed.

---

## D. After the demo

- [ ] Note the new signature and add it to the README's transaction table
- [ ] Confirm the fill appears on `/receipts` and in `/holdings`
- [ ] Check the wallet still has USDC/USDT for a second run
