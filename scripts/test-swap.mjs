// Executes ONE real mainnet buy through the local /api/v1/swap with the demo wallet.
//   node scripts/test-swap.mjs NVDA <mint> 5 [maxDevBps] [--dry]
// --dry builds and simulates but does not send. Requires `npm run dev` on :3000 (or BASE_URL).
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync } from "node:fs";

const [symbol, mint, usdArg, devArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dry = process.argv.includes("--dry");
if (!symbol || !mint) {
  console.error("usage: node scripts/test-swap.mjs <SYMBOL> <mint> [usd=5] [maxDevBps=50] [--dry]");
  process.exit(1);
}
const usd = Number(usdArg || 5);
const maxDevBps = Number(devArg || 50);
const BASE = process.env.BASE_URL || "http://localhost:3000";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.DEMO_WALLET_SECRET_KEY) throw new Error("DEMO_WALLET_SECRET_KEY missing — run scripts/generate-demo-wallet.mjs");
const kp = Keypair.fromSecretKey(bs58.decode(env.DEMO_WALLET_SECRET_KEY));
const conn = new Connection(env.NEXT_PUBLIC_SOLANA_RPC || "https://api.mainnet-beta.solana.com", "confirmed");

const post = (path, body) =>
  fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => [r.ok, await r.json()]);

async function main() {
  console.log(`wallet ${kp.publicKey.toBase58()}  buying $${usd} of ${symbol} via ${mint}  guard ±${maxDevBps} bps${dry ? "  (dry run)" : ""}`);
  const [ok, build] = await post("/api/v1/swap", { symbol, mint, usd, owner: kp.publicKey.toBase58(), maxDevBps });
  if (!ok) {
    console.error("swap build rejected:", build);
    return 2;
  }
  console.log(`mode=${build.mode}  fill=${build.quote.fillPx.toFixed(4)}  fair=${build.quote.fairPx.toFixed(4)}  dev=${build.quote.devBps} bps  shares=${build.quote.shares}`);
  console.log(`reason: ${build.reason}`);
  if (build.guard) console.log(`guard: program=${build.guard.programId} receipt=${build.guard.receipt}`);

  const tx = VersionedTransaction.deserialize(Buffer.from(build.tx, "base64"));
  tx.sign([kp]);

  if (dry) {
    const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
    console.log("simulation:", sim.value.err ? { err: sim.value.err, logs: sim.value.logs?.slice(-12) } : `ok, ${sim.value.unitsConsumed} CU`);
    return sim.value.err ? 3 : 0;
  }

  let sig;
  if (build.mode === "ultra") {
    const [exOk, j] = await post("/api/v1/swap/execute", { requestId: build.requestId, signedTx: Buffer.from(tx.serialize()).toString("base64") });
    if (!exOk) {
      console.error("execute failed:", j);
      return 4;
    }
    sig = j.signature;
  } else {
    sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    console.log(`sent ${sig}, confirming…`);
    const bh = await conn.getLatestBlockhash();
    const c = await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
    if (c.value.err) {
      console.error("failed on-chain:", c.value.err);
      return 5;
    }
  }
  console.log(`CONFIRMED https://solscan.io/tx/${sig}`);

  const [, rec] = await post("/api/v1/fills", {
    sig,
    wallet: kp.publicKey.toBase58(),
    symbol,
    issuer: build.quote.issuer,
    mint,
    usd,
    shares: build.quote.shares,
    fillPx: build.quote.fillPx,
    fairPx: build.quote.fairPx,
    devBps: build.quote.devBps,
    guarded: build.mode === "guarded",
    receipt: build.guard?.receipt ?? null,
  });
  console.log("fill record:", rec);
  return 0;
}

process.exitCode = await main();
