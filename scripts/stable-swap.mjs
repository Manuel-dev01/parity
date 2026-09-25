// Converts between the stablecoins the demo wallet holds, via Jupiter.
//   node scripts/stable-swap.mjs USDT USDC 3 [--dry]
// Needed because Jupiter only pairs Ondo tokens with USDC.
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync } from "node:fs";

const MINTS = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
};
const [fromSym, toSym, amtArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dry = process.argv.includes("--dry");
const from = MINTS[(fromSym || "").toUpperCase()];
const to = MINTS[(toSym || "").toUpperCase()];
if (!from || !to) {
  console.error("usage: node scripts/stable-swap.mjs <USDC|USDT> <USDC|USDT> <amount> [--dry]");
  process.exit(1);
}
const amount = Math.round(Number(amtArg) * 1e6);

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const kp = Keypair.fromSecretKey(bs58.decode(env.DEMO_WALLET_SECRET_KEY));
const conn = new Connection(env.NEXT_PUBLIC_SOLANA_RPC || "https://api.mainnet-beta.solana.com", "confirmed");

async function main() {
  console.log(`wallet ${kp.publicKey.toBase58()}  swapping ${amtArg} ${fromSym} -> ${toSym}${dry ? "  (dry run)" : ""}`);
  const q = await fetch(
    `https://lite-api.jup.ag/swap/v1/quote?inputMint=${from}&outputMint=${to}&amount=${amount}&slippageBps=30`,
  ).then((r) => r.json());
  if (!q.outAmount) {
    console.error("no route:", q);
    return 2;
  }
  const out = Number(q.outAmount) / 1e6;
  console.log(`quote: ${out.toFixed(4)} ${toSym}  (${((out / (amount / 1e6) - 1) * 1e4).toFixed(1)} bps vs 1:1)`);

  const sw = await fetch("https://lite-api.jup.ag/swap/v1/swap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quoteResponse: q, userPublicKey: kp.publicKey.toBase58(), wrapAndUnwrapSol: false, dynamicComputeUnitLimit: true }),
  }).then((r) => r.json());
  if (!sw.swapTransaction) {
    console.error("swap build failed:", sw);
    return 3;
  }
  const tx = VersionedTransaction.deserialize(Buffer.from(sw.swapTransaction, "base64"));
  tx.sign([kp]);

  if (dry) {
    const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
    console.log("simulation:", sim.value.err ? { err: sim.value.err, logs: sim.value.logs?.slice(-10) } : `ok, ${sim.value.unitsConsumed} CU`);
    return sim.value.err ? 4 : 0;
  }
  const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  console.log(`sent ${sig}, confirming...`);
  const bh = await conn.getLatestBlockhash();
  const c = await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
  if (c.value.err) {
    console.error("failed:", c.value.err);
    return 5;
  }
  console.log(`CONFIRMED https://solscan.io/tx/${sig}`);
  return 0;
}
process.exitCode = await main();
