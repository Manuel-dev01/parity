// Builds src/data/universe.json: every tokenized US stock on Solana grouped by
// underlying ticker, across issuers, plus Pyth feed ids. Run: node scripts/build-universe.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const JUP = "https://lite-api.jup.ag/tokens/v2/tag?query=verified";
const PYTH_FEEDS = "https://hermes.pyth.network/v2/price_feeds?asset_type=equity";

// Issuers that tokenize *public* US equities 1:1. Pre-IPO forwards (tessera,
// prestocks) and leveraged wrappers (shift) are kept out of parity comparisons.
const ISSUERS = {
  xstocks: { underlying: (s) => s.replace(/x$/, "") },
  ondo: { underlying: (s) => s.replace(/on$/, "") },
  backpack: { underlying: (s) => s },
};

const jup = await (await fetch(JUP)).json();
const feeds = await (await fetch(PYTH_FEEDS)).json();

const pyth = {};
for (const f of feeds) {
  const m = /^Equity\.(US|Index)\.([A-Z0-9.]+)\/USD$/.exec(f.attributes.symbol);
  if (!m) continue;
  const [, kind, sym] = m;
  pyth[sym] ??= {};
  pyth[sym][kind === "US" ? "us" : "index"] = f.id;
  if (kind === "US") pyth[sym].name = f.attributes.description;
}

const underlyings = {};
for (const t of jup) {
  const issuer = Object.keys(ISSUERS).find((i) => (t.tags || []).includes(i));
  if (!issuer) continue;
  const underlying = ISSUERS[issuer].underlying(t.symbol);
  if (!/^[A-Z0-9.]{1,6}$/.test(underlying)) continue;
  const u = (underlyings[underlying] ??= { symbol: underlying, tokens: [] });
  u.tokens.push({
    mint: t.id,
    symbol: t.symbol,
    name: t.name,
    issuer,
    decimals: t.decimals,
    tokenProgram: t.tokenProgram,
    liquidity: Math.round(t.liquidity || 0),
    holders: t.holderCount || 0,
    vol24h: Math.round((t.stats24h?.buyVolume || 0) + (t.stats24h?.sellVolume || 0)),
    usdPrice: t.usdPrice ?? null,
    icon: t.icon || null,
  });
}

for (const u of Object.values(underlyings)) {
  u.tokens.sort((a, b) => b.liquidity - a.liquidity);
  u.issuers = [...new Set(u.tokens.map((t) => t.issuer))];
  u.name = pyth[u.symbol]?.name?.replace(/ \/ US DOLLAR$/, "") || u.tokens[0].name;
  u.pyth = pyth[u.symbol] ? { us: pyth[u.symbol].us, index: pyth[u.symbol].index || null } : null;
  u.liquidity = u.tokens.reduce((s, t) => s + t.liquidity, 0);
}

const list = Object.values(underlyings).sort((a, b) => b.issuers.length - a.issuers.length || b.liquidity - a.liquidity);
const multi = list.filter((u) => u.issuers.length >= 2);
console.log(`underlyings=${list.length} multi-issuer=${multi.length} with-pyth=${list.filter((u) => u.pyth).length}`);
console.log("top multi-issuer:", multi.slice(0, 20).map((u) => `${u.symbol}(${u.issuers.map((i) => i[0]).join("")})`).join(" "));

mkdirSync("src/data", { recursive: true });
writeFileSync("src/data/universe.json", JSON.stringify({ builtAt: new Date().toISOString(), underlyings: list }, null, 1));
