// The guard refusal, captured as evidence rather than staged.
//
// The order slip is `disabled={!address}`, so the refusal state cannot be reached in the UI
// without a connected wallet, and this film will not show a fake wallet session. Instead we
// ask the live API the same question the slip would ask — same endpoint, same demo wallet,
// a guard tightened past what the market can fill — and record whatever it answers.
//
// The film presents the result in a panel that says on its face that it is an API response,
// with the request shown next to it. Nothing here is written by hand.
//
//   node ops/video/evidence.mjs [baseUrl]
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = process.argv[2] || "https://parity-manuel-dev01s-projects.vercel.app";
const OWNER = "4N6FeA9CzNSZVE3qTd6PevishNUtWDjwry3Nv66BWdvA"; // the real, funded demo wallet
const OUT = "ops/video/src";
mkdirSync(OUT, { recursive: true });

const say = (...a) => console.log(...a);

// Ask the public quote endpoint which issuers exist for the symbol, then try to buy the one
// furthest from fair value with a guard far tighter than that distance.
const symbol = process.argv[3] || "SPCX";
const q = await fetch(`${BASE}/api/v1/quote?symbol=${symbol}&usd=1000`, { cache: "no-store" }).then((r) => r.json());
if (!q?.venues?.length) {
  say("no venues quoted for", symbol, "— cannot capture a refusal right now");
  process.exitCode = 1;
} else {
  const ranked = [...q.venues].sort((a, b) => Math.abs(b.devBps ?? 0) - Math.abs(a.devBps ?? 0));
  const target = ranked[0];
  const maxDevBps = 10; // tighter than any real venue will fill

  const request = {
    symbol,
    mint: target.token.mint,
    usd: 1000,
    owner: OWNER,
    maxDevBps,
    pay: "USDC",
  };

  say(`asking ${BASE}/api/v1/swap to buy ${target.token.symbol} at ±${maxDevBps} bps`);
  say(`  (it is currently ${target.devBps > 0 ? "+" : ""}${target.devBps} bps from fair value)`);

  const res = await fetch(`${BASE}/api/v1/swap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const body = await res.json();

  const record = {
    capturedAt: new Date().toISOString(),
    base: BASE,
    endpoint: "POST /api/v1/swap",
    request,
    status: res.status,
    response: body,
    // what the film is allowed to claim about this panel
    presentation: {
      label: "Live API response",
      note: "Captured from the deployed app. The order slip requires a connected wallet, so this refusal was requested from the same endpoint the slip calls.",
    },
  };

  writeFileSync(`${OUT}/refusal.json`, JSON.stringify(record, null, 2));
  say(`\nHTTP ${res.status}`);
  say(JSON.stringify(body, null, 2).slice(0, 1600));
  say(`\n→ ${OUT}/refusal.json`);
  if (!body?.refusal) say("\n! no refusal object in the response — the film must not claim one");
}
