# Parity

**Every stock on Solana. One fair price.**

The same US share now trades under three issuers on Solana — xStocks (`NVDAx`), Ondo Global Markets (`NVDAon`) and Backpack Securities (`NVDA`) — and they disagree, sometimes by whole percent. Within ten days of the SpaceX IPO the same share was priced from $122 to $176 depending on which token you bought.

Parity is the layer above the issuers:

1. **Fair value** — Pyth equity feeds (live and 24/7), Jupiter's stock reference, and Backpack's 24/7 perp marks, picked by market session.
2. **Executable price by issuer** — live Jupiter Ultra quotes at $100 / $1k / $10k per issuer token, so you see effective price including impact, not just the last print.
3. **Buy at parity** — one transaction: swap through the cheapest issuer, then `fair_fill_guard` verifies the fill against the Pyth price on-chain and writes a receipt. If the fill is off fair value, the transaction reverts.
4. **Divergence tape** — every issuer's premium/discount, sampled each minute.
5. **Public API** — `GET /api/v1/quote?symbol=NVDA&usd=1000` for agents and other builders.

Built solo in five days for [Stocklana](https://hackathons.solana.com/hackathons/stocklana).

## Run

```bash
npm install
cp .env.example .env.local   # optional keys, see comments
npm run universe             # rebuild src/data/universe.json from Jupiter + Pyth
npm run dev
```

## What is real and what is not

| Piece | Status |
|---|---|
| Universe (1,069 underlyings, 234 multi-issuer) | Real — built from Jupiter's verified token list, issuer tags, Pyth feed ids |
| Fair value | Real — Pyth (with key), Jupiter stock reference, Backpack perp marks |
| Quotes at size | Real — Jupiter Ultra, mainnet |
| Execution | Real — Jupiter swap on mainnet |
| `fair_fill_guard` | see `programs/` — status tracked here as it ships |
| Tape history | Real once `DATABASE_URL` is set (Neon); live-only otherwise |

## API

`GET /api/v1/quote?symbol=SPCX&usd=1000`

```json
{
  "symbol": "SPCX", "usd": 1000,
  "fair": { "price": 150.28, "source": "jupiter-stock", "marketState": "closed" },
  "venues": [ { "token": { "symbol": "SPCX", "issuer": "backpack" }, "effPx": { "1000": 149.28 }, "devBps": -67, "swapType": "aggregator" }, ... ],
  "best": "<mint>", "worst": "<mint>", "spreadBps": 18, "savedUsd": 1.8
}
```

`GET /api/v1/universe?q=NV` — search; `GET /api/v1/universe?minIssuers=3` — everything issued by all three.
