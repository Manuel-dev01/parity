// Does the 40-row window actually contain the widest spreads?
//
//   node scripts/coverage-check.mjs [windowSize=40]
//
// The board slices multiIssuer() — which is sorted by LIQUIDITY — before it prices anything,
// then sorts the survivors by spread and the page calls the top one "the most mispriced stock
// on Solana this minute". This prices every multi-issuer name and reports what that window
// misses, plus what a full scan costs.
import { readFileSync } from "node:fs";

const WINDOW = Number(process.argv[2] || 40);
const POOL_FLOOR = 25_000;

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const KEY = env.JUPITER_API_KEY;
const BASE = KEY ? "https://api.jup.ag" : "https://lite-api.jup.ag";

const universe = JSON.parse(readFileSync("src/data/universe.json", "utf8"));
const multi = universe.underlyings
  .filter((u) => u.tokens.length >= 2)
  .sort((a, b) => b.liquidity - a.liquidity);

const mints = multi.flatMap((u) => u.tokens.map((t) => t.mint));
console.log(`${multi.length} multi-issuer stocks, ${mints.length} tokens`);
console.log(`current window: first ${WINDOW} by liquidity\n`);

const prices = {};
const t0 = Date.now();
let calls = 0;
for (let i = 0; i < mints.length; i += 50) {
  const batch = mints.slice(i, i + 50);
  const r = await fetch(`${BASE}/price/v3?ids=${batch.join(",")}`, { headers: KEY ? { "x-api-key": KEY } : {} });
  calls++;
  if (!r.ok) {
    console.log(`  batch ${calls}: ${r.status} ${(await r.text()).slice(0, 100)}`);
    continue;
  }
  Object.assign(prices, await r.json());
}
const elapsed = (Date.now() - t0) / 1000;
console.log(`priced everything in ${elapsed.toFixed(1)}s across ${calls} calls\n`);

const rows = multi.map((u, idx) => {
  const stock = u.tokens.map((t) => prices[t.mint]?.stockData).find(Boolean) ?? null;
  const ref = stock?.price ?? null;
  const prints = u.tokens.map((t) => {
    const p = prices[t.mint];
    const liq = p?.liquidity ?? t.liquidity ?? 0;
    return { issuer: t.issuer, symbol: t.symbol, px: p?.usdPrice ?? null, liq, comparable: liq > POOL_FLOOR };
  });
  const priced = prints.filter((p) => p.px != null && p.comparable);
  const lo = priced.length ? priced.reduce((a, b) => (b.px < a.px ? b : a)) : null;
  const hi = priced.length ? priced.reduce((a, b) => (b.px > a.px ? b : a)) : null;
  return {
    rank: idx,
    symbol: u.symbol,
    ref,
    spreadBps: lo && hi && lo !== hi ? Math.round(((hi.px - lo.px) / lo.px) * 1e4) : null,
    cheapest: lo?.symbol,
    richest: hi?.symbol,
    inWindow: idx < WINDOW,
    comparablePrints: priced.length,
  };
});

const withSpread = rows.filter((r) => r.spreadBps != null).sort((a, b) => b.spreadBps - a.spreadBps);
console.log(`${withSpread.length} of ${multi.length} have a comparable spread (2+ prints over $${POOL_FLOOR.toLocaleString()} of pool)\n`);

console.log("widest spreads in the WHOLE universe:");
for (const r of withSpread.slice(0, 20)) {
  const mark = r.inWindow ? "   " : " ← MISSED";
  console.log(
    `  ${String(r.spreadBps).padStart(5)} bps  ${r.symbol.padEnd(8)} liq-rank ${String(r.rank + 1).padStart(4)}  ${r.cheapest} → ${r.richest}${mark}`,
  );
}

const inWin = withSpread.filter((r) => r.inWindow);
const missed = withSpread.filter((r) => !r.inWindow);
console.log(`\nwhat the page shows as "most mispriced": ${inWin[0]?.symbol} at ${inWin[0]?.spreadBps} bps`);
console.log(`what is actually widest:                ${withSpread[0]?.symbol} at ${withSpread[0]?.spreadBps} bps`);
console.log(`\nnames with a real spread inside the window:  ${inWin.length}`);
console.log(`names with a real spread outside it:        ${missed.length}`);
const top20Missed = withSpread.slice(0, 20).filter((r) => !r.inWindow).length;
console.log(`of the 20 widest spreads, ${top20Missed} are outside the current window`);

// ── why so few? the pool floor, not the window ────────────────────────────
console.log("\n── why the comparable set is so small ──");
const dist = { 0: 0, 1: 0, 2: 0, 3: 0 };
const issuerHasPool = {};
let bothIssuersPricedButThin = 0;
for (const u of multi) {
  let n = 0;
  for (const t of u.tokens) {
    const p = prices[t.mint];
    const liq = p?.liquidity ?? t.liquidity ?? 0;
    if (p?.usdPrice != null && liq > POOL_FLOOR) n++;
    if (p?.usdPrice != null && liq > POOL_FLOOR) issuerHasPool[t.issuer] = (issuerHasPool[t.issuer] || 0) + 1;
  }
  dist[Math.min(n, 3)]++;
  if (n === 1) bothIssuersPricedButThin++;
}
console.log("comparable prints per stock:", JSON.stringify(dist));
console.log("tokens clearing the floor, by issuer:", JSON.stringify(issuerHasPool));
console.log(`stocks with exactly one tradable print (no pair to compare): ${bothIssuersPricedButThin}`);

for (const floor of [25000, 10000, 5000, 1000, 100, 0]) {
  let pairs = 0;
  for (const u of multi) {
    const n = u.tokens.filter((t) => {
      const p = prices[t.mint];
      return p?.usdPrice != null && (p?.liquidity ?? t.liquidity ?? 0) > floor;
    }).length;
    if (n >= 2) pairs++;
  }
  console.log(`  pool floor $${String(floor).padStart(6)} → ${String(pairs).padStart(3)} comparable stocks`);
}
