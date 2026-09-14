# Stocklana ($100K, Solana tokenized stocks) — Strategy & Execution Plan

## Context

Stocklana is Solana's one-week tokenized-stocks hackathon. **Submissions close Friday 18 Sept 2026, 4:00pm ET** — today is **Sunday 13 Sept**, so this is a **~5.5-day** build, not 7. Solo, near full-time, non-US, mainnet with small real funds, thin Anchor program allowed. Lantern (Tripothon, due Oct 5) pauses until Sept 18.

Goal: win outright. The judging bar is explicitly *"Could this be a real app that people will actually use?"* scored on (1) a real user + problem, (2) a working end-to-end demo, (3) a reason it belongs on Solana, (4) execution quality. Single $100K pool, no sub-tracks. Suggested build areas: Trading, Investing, Credit/yield, Infrastructure, Consumer. Submission = at least one of GitHub / live demo / video (do all three).

---

## Track A — What makes judges say "this is real"

Evidence from this rubric + the sister xStocks hackathon (EthCC '26 winners: **xPrime** prime brokerage, **Stretch** structured payoffs, **xStream** automation) + visible Stocklana entries:

| Signal | Why it matters here | Implication |
|---|---|---|
| **Mainnet, real tokens, real fills** | Rubric says "working end-to-end demo". Two of three visible competitors are devnet/mocks (bozBasket, stocklana-baskets). | Live mainnet execution is the single biggest separator. Show a real tx signature on screen. |
| **A problem the judges already feel** | Judges are ecosystem people (Solana Foundation + likely issuer folks). They know the pain points. | Pick a problem that is *new in 2026* and *only exists on Solana*. |
| **"Beyond price trackers"** | The xStocks hackathon write-up's thesis: winners moved past passive dashboards to execution/financing/automation. | A dashboard alone loses. Every screen must end in a signed transaction. |
| **Neutral, ecosystem-wide** | Solana Foundation runs this. Products that lift the *whole* tokenized-stock ecosystem (all issuers) read as strategic. | Don't build for one issuer. Build the layer above all of them. |
| **Visual polish + a 90-second story** | "Quality of execution" is 1 of 4 criteria. | Ship one flawless flow, not five rough ones. Record the video during a live market session. |
| **Honesty about what's real** | after-hours/bozBasket both got credit for labeling real vs simulated. | README "What's real / what's mocked" table. |

**Crowded lanes (avoid):** index baskets (2 entries), recurring buys/DCA (bozBasket), "trade after hours" venue (after-hours, live and polished), prime brokerage (xPrime already won the sponsor's own hackathon).

---

## Track B — Frontier stack (verified 13 Sept 2026)

| Layer | Pick | Notes |
|---|---|---|
| **Universe / mints** | xStocks `GET https://api.backed.fi/api/v2/public/assets` (no auth, 100+ assets, Solana mints, plain SPL) · Ondo GM (250+ tokens, `*on` suffix, e.g. `NVDAon`) · Backpack Securities via Sunrise (`SPCX`, `MSTR`, `MU`, `INTC` + 20 more) · Jupiter Tokens API v2 search to resolve symbol→mint per issuer | 3 issuers × same underlying = the whole opportunity |
| **Fair value / reference** | Pyth Hermes `Equity.US.<TICKER>/USD` (`/v2/updates/price/latest`, price + confidence + publish time) · Backpack `GET /api/v1/ticker?symbol=AAPL.US_USDC_RFQ&source=External` (public, external market quote) · xStocks `/v2/public/oracles` | Pyth also verifiable **on-chain** via `pyth-solana-receiver-sdk` → this is what the Anchor guard reads |
| **Market state** | Backpack `/api/v1/market-sessions`, `/api/v1/market-holidays` · xStocks `/v2/public/system` | Drives "market open / off-hours" mode and confidence widening |
| **Venue price @ size** | Jupiter Ultra `GET /ultra/v1/order` quoted at $100 / $1k / $10k per issuer token → effective price incl. impact · Jupiter Price v3 for last print · Meteora DLMM datapi `https://dlmm.datapi.meteora.ag/pools` for TVL | Effective price at size is what nobody shows |
| **Execution** | Jupiter Swap API v2 `/swap-instructions` (composable → we append our guard ix in the same tx) · Ultra `/order`+`/execute` as fallback for RFQ-only names (JupiterZ, gasless, MEV-protected) | Ondo GM routes via Manifest/Meteora DLMM/Raydium CLMM; set `maxAccounts=33` |
| **On-chain guard** | Anchor program `fair_fill_guard`: `snapshot` + `verify` instructions bracketing the swap; reads Pyth pull oracle; asserts effective fill within N bps of fair value; writes a `Receipt` PDA (symbol, issuer, fair px, fill px, bps saved vs worst venue) | Thin, ~150 lines Rust, ~1 day incl. mainnet deploy (~1.5–2.5 SOL rent) |
| **Distribution** | Solana Actions/Blinks (Dialect registry still active, Phantom/Backpack/Solflare render) — `GET/POST /api/actions/buy?symbol=NVDA&usd=100` | Stretch: shareable "buy at best price" links |
| **App** | Next.js 16 + TS on Vercel (your existing stack), Neon Postgres for 60s snapshots (divergence history), Vercel Cron for the snapshotter, wallet-adapter (Phantom/Backpack) | Reuse Lantern's Next.js scaffolding patterns |
| **Optional tape** | Bitquery Trading Cube (MEV-filtered xStocks prints, needs key) | Only if time; not on critical path |

Reference repos to borrow from (don't rebuild): `webclinic017/xstocks-fun` (full xStocks trading flow), `nftechie/stonkfly` (guarded executor pattern), `mkzung/solana-xstocks-wash-analysis` (pool-health checks), `yusizer/solana-position-manager-skill`. Backpack Securities has **no public mint/redeem REST endpoint** — stocks trade via authenticated RFQ (`POST /api/v1/rfq`); only market-data endpoints are public. Treat the "single API call mint/redeem" claim as unverified; don't depend on it.

---

## Track C — Five concepts

1. **PARITY — Best-execution + price-truth layer across every tokenized-stock issuer on Solana.** Type `NVDA` → see Backed `NVDAx`, Ondo `NVDAon`, Backpack `NVDA` side by side: fair value (Pyth/NBBO), premium/discount in bps, effective price at your size, depth, rights (redeemable? dividends? jurisdiction). One click buys the cheapest with an on-chain oracle guard; receipt shows "$ saved vs worst venue". Public divergence tape + `/v1/quote` API for agents. *Lanes: Trading + Infrastructure + Consumer.*
2. **SHIELD — Principal-protected stock notes.** Deposit 1,000 USDC for a term → ~95% goes to Jupiter Lend/Kamino to accrete back to 1,000, ~5% buys the stock token (optionally levered via Kamino). Retail "can't-lose NVDA exposure". *Lane: Credit & yield (structured products).*
3. **STOCKLINK — Gift any stock via link.** Send "$20 of TSLA" as a claim link / Blink; recipient claims into an embedded wallet with zero crypto knowledge. Stockpile-on-Solana. *Lane: Consumer.*
4. **PORTFOLIO PAY — Spend from your stocks without selling.** Deposit stock tokens as Kamino collateral, borrow USDC, pay any Solana Pay QR; auto-repay from dividends/multiplier. *Lane: Credit + Consumer ("spending from a portfolio").*
5. **CORPACT — Corporate-actions & dividend truth engine.** Unified feed of splits, multipliers, dividends, ticker changes across xStocks/Ondo/Backpack, plus "what you actually own / are owed" per wallet, cost basis, exportable. *Lane: Infrastructure.*

---

## Track D — Stress test (5.5 days, solo)

| # | Idea | Real user & pain | Solana-only? | E2E on mainnet in 5 days | Wow / novelty | Key risks | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | Parity | **High** — same SPCX share traded **$122–$176** across issuers in June; nobody shows fair value or effective price across issuers | **Yes** — all issuers live here; 97% of tokenized-equity volume is Solana | **High** — reads are public APIs; execution is Jupiter; guard is a thin Anchor program | **High** — live divergence chart is inherently dramatic; on-chain oracle guard is a real primitive | Off-hours Pyth staleness (handled by mode switch); issuer sensitivity (stay neutral); mint-list curation | **CHAMPION** |
| 2 | Shield | Medium-high (retail loves capital protection) | Partly (Kamino/Jupiter Lend) | **Medium-low** — needs vault program + Kamino CPI + term accounting; hard to demo a 12-month payoff in 90s | High | Anchor + Kamino CPI in 5 days solo; "principal protected" regulatory optics; Stretch already won this lane at xStocks | Runner-up; too much on-chain risk |
| 3 | Stocklink | Medium (gifting is real, but niche) | Weak (any chain) | High | Low-medium | Thin; easy for judges to call "a feature" | Cut |
| 4 | Portfolio Pay | Medium | Medium | Medium — Kamino SDK + Solana Pay is doable but two integrations | Medium | Kamino integration depth; borrowing UX is scary in a 90s demo; liquidation edge cases | Cut (fold "rights" data into #1) |
| 5 | Corpact | Medium (infra) | Medium | High | Low — no transaction, reads as a dashboard | Fails "beyond price trackers" | Cut (fold multiplier/rights columns into #1) |

---

## The champion: PARITY

**One-liner:** *Every US stock now exists three times on Solana. Parity finds the fair price, shows you which one is mispriced, and buys the right one — atomically guarded by the oracle.*

**Why it wins on this rubric**
- *Real user + problem:* documented 40%+ price divergence for the same share across Backed/Ondo/Backpack; retail can't tell which token is fair, liquid, or redeemable.
- *Belongs on Solana:* the fragmentation only exists here. Fix is an oracle-checked atomic transaction — impossible in TradFi and pointless on chains with one issuer.
- *End-to-end:* live mainnet quotes → real signed tx → on-chain receipt PDA → shareable proof.
- *Ecosystem-strategic:* it's the "Kayak" above all issuers — neutral, lifts everyone, exactly what a Foundation-run hackathon wants to showcase.

**Positioning rule:** never "issuer X is overpriced" — always "the market is inefficient, here's the fair price and the cheapest legitimate route." The rights table (redeemable via ACATS / dividend handling / jurisdiction) is *educational*, not a ranking.

### Product surface (what ships)
1. **Ticker page** `/s/NVDA` — fair value hero (Pyth price ± conf, source, market-open/off-hours badge); issuer cards (`NVDAx`, `NVDAon`, `NVDA`) with: last print, premium/discount bps, effective price at $100/$1k/$10k, depth/TVL, rights facts. Best route highlighted.
2. **Trade panel** — amount in USDC → "Buy best" → wallet signs one tx: `snapshot` → Jupiter swap → `verify` (guard). Success screen: fill px, fair px, bps vs fair, "$ saved vs worst issuer", explorer link to the Receipt PDA.
3. **Divergence tape** `/tape` — live + 24h/7d history of premium/discount per issuer per stock (Neon snapshots every 60s). Sortable "most mispriced right now".
4. **Public API** `GET /api/v1/quote?symbol=NVDA&usd=1000` → JSON best route + per-issuer breakdown (documented in README; agents/builders can consume it).
5. **Stretch:** Blink `/api/actions/buy` so a "buy NVDA at fair price" link renders in Phantom on X.

### Anchor program `fair_fill_guard` (thin)
- `snapshot(user_token_acct)` → stores pre-swap balance + slot in a temp PDA.
- `verify(pyth_price_update, max_dev_bps, usdc_spent, symbol, issuer)` → reads post-swap balance delta, computes effective px = usdc_spent / tokens_received, loads Pyth price (check staleness ≤ N sec; if market closed, accept `last close` mode with wider bps set by client), asserts `|eff − fair| / fair ≤ max_dev_bps`, writes `Receipt` PDA `{symbol, issuer_mint, fair_px, fill_px, dev_bps, ts}`, emits event.
- Deploy to mainnet once (Wed at latest). Program is intentionally small so an unaudited mainnet deploy is defensible; document that.

---

## Roadmap (Sun 13 → Fri 18, 4pm ET)

Cut lines are explicit: **P0** must ship, **P1** if on schedule, **P2** stretch.

### Sun 13 — Foundations + data truth (P0)
- Scaffold Next.js 16 + TS + wallet-adapter + Neon; deploy skeleton to Vercel same day.
- Curate `universe.json`: 12–15 marquee stocks × issuer mints (SPCX, NVDA, TSLA, AAPL, MSFT, GOOGL, AMZN, META, SPY, QQQ, MSTR, COIN, HOOD, INTC, MU). Resolve via backed.fi assets API + Jupiter token search; verify each mint manually on Solscan (decimals, token program, issuer).
- `lib/fairvalue.ts`: Pyth Hermes + Backpack external ticker + xStocks oracle → `{price, conf, source, asOf, marketOpen}`.
- `lib/venues.ts`: Jupiter Ultra quotes at 3 sizes per issuer token + Price v3 + Meteora TVL → `{issuer, mint, lastPx, effPx[3], devBps, tvl}`.
- **Done when:** `GET /api/v1/quote?symbol=NVDA&usd=1000` returns correct JSON for all 15 names during market hours *and* off-hours.

### Mon 14 — Execution path on mainnet (P0)
- Fund demo wallet (~$60 USDC + ~3 SOL: deploy rent + fees).
- Trade panel with Jupiter Swap API v2 `/swap-instructions`; execute a real buy of each issuer's NVDA at $5 each; confirm signatures.
- Ultra fallback for RFQ-only names.
- Snapshotter: Vercel Cron → Neon every 60s for all universe tokens.
- **Done when:** three real mainnet fills exist, one per issuer, visible in app history.

### Tue 15 — `fair_fill_guard` Anchor program (P0)
- Write `snapshot`/`verify`, unit tests with mocked Pyth account, localnet test composing with a mock swap ix.
- Deploy to **mainnet** by end of day; integrate into trade tx (snapshot → swap → verify); test a passing fill and a deliberately failing one (max_dev_bps=1) → tx reverts.
- **Done when:** Receipt PDA visible on Solscan for a real fill. If the program slips past Tue night → **cut it**, keep an off-chain guard (client refuses to sign if quote deviates), and say so in README.

### Wed 16 — Product polish + tape (P0/P1)
- Ticker page UI to demo quality (design pass: hero fair value, issuer cards, best-route highlight, rights table).
- `/tape` with live table + 24h sparkline per issuer (from Neon snapshots).
- Empty/loading/error states; off-hours mode messaging; mobile width.
- P1: Blink endpoint + Dialect registry submission.

### Thu 17 — Demo, story, docs (P0)
- README: problem (cite the $122–$176 SPCX spread), architecture diagram, "what's real vs simulated" table, API docs, program address, how to run.
- Record 2–3 min video **during US market hours (9:30–16:00 ET)** so divergence is live; script below. Record a second off-hours clip if divergence is wider then.
- Submit a first version on the hackathon page (edits allowed until deadline). Post launch thread on X tagging @solana, @xStocksFi, @Backpack, @OndoFinance, @JupiterExchange.

### Fri 18 (until 4pm ET) — Buffer
- Fix whatever broke overnight; re-verify live demo URL; final submission edit by **3:00pm ET**. Do not add features.

### 90-second demo script
1. (0–15s) "SpaceX listed on Nasdaq in June. Within ten days the same share traded at $122 on one Solana issuer and $176 on another. Every US stock now exists three times on Solana, and nobody tells you which one is fair."
2. (15–45s) Type NVDA. Fair value from Pyth. Three issuer cards, premiums in bps, effective price at $1k. Best route glows.
3. (45–70s) Click Buy $50. Phantom pops. One transaction: snapshot → swap → oracle verify. Receipt: fill vs fair, "saved $X vs worst issuer", Solscan link.
4. (70–90s) Tape page: "here's every mispricing on Solana right now" + the public API call for agents. "Parity — every stock on Solana, one fair price."

---

## Verification
- **Data:** for 5 names, hand-check fair value against a brokerage quote and each issuer's DEX price on Jupiter UI; premium bps must match within rounding.
- **Execution:** ≥1 real mainnet fill per issuer with tx signatures listed in README; one intentionally failed guard tx (revert reason visible).
- **Guard:** `anchor test` passes locally; mainnet Receipt PDA decodes correctly in-app.
- **Off-hours:** app on a weekend/after-close shows "market closed" mode with widened confidence and still quotes/executes.
- **API:** `curl https://<app>/api/v1/quote?symbol=SPCX&usd=1000` returns in <2s.
- **Demo:** live URL loads cold in <3s on phone width; video plays; repo public; submission page shows all three links.

## Risks & mitigations
- **Pyth stale off-hours** → mode switch to last-close reference + Backpack external quote; guard takes a client-set wider `max_dev_bps` in closed mode.
- **A mint list is wrong** → every mint hand-verified Sunday; universe frozen after Monday.
- **Anchor slips** → hard cut Tue night; off-chain guard fallback (documented).
- **Ultra tx not composable with guard** → use Swap API v2 `/swap-instructions` for pool-routed names; Ultra (no on-chain guard, client-side check) only for RFQ-only names — say so in UI.
- **Issuer sensitivity among judges** → neutral language, rights table cites issuers' own docs, no "scam" framing.
- **Solo burnout / Lantern collision** → Lantern frozen until Sept 18; Fri is buffer, not build.

## Key sources
- Hackathon page: https://hackathons.solana.com/hackathons/stocklana
- xStocks public API: https://api.backed.fi/api/v2/public/assets · docs https://docs.xstocks.fi/developers
- Backpack API (securities, market-sessions, ticker source=External): https://docs.backpack.exchange
- Jupiter dev docs (Ultra, Swap v2, Trigger v2, Price v3, Tokens v2): https://dev.jup.ag
- Pyth Hermes / Solana pull oracle: https://docs.pyth.network/price-feeds/core/fetch-price-updates
- Meteora DLMM datapi: https://dlmm.datapi.meteora.ag/pools
- SPCX divergence evidence: https://coinmarketcap.com/events/tokenized-stocks-cex-vs-onchain/ · https://thedefiant.io/converge/defi/backpack-s-tokenized-spacex-token-on-solana-crosses-10-000-holders-nearly-double-xstocks-spcxx
- xStocks hackathon winners (what sponsors reward): https://crypto.news/xstocks-hackathon-shows-how-on-chain-equities-grow-beyond-price-trackers/
- Competing entries: https://github.com/elaris-xyz/bozBasket · https://github.com/martymedia/after-hours · https://github.com/MallorcaBCDays/stocklana-baskets
