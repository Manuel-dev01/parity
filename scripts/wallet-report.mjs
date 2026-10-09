// Read-only: what does the demo wallet actually hold right now, and what is it worth?
//   node scripts/wallet-report.mjs
// Signs nothing and sends nothing.
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync } from "node:fs";

const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const kp = Keypair.fromSecretKey(bs58.decode(env.DEMO_WALLET_SECRET_KEY));
const owner = kp.publicKey;
const conn = new Connection(env.SOLANA_RPC || "https://api.mainnet-beta.solana.com", "confirmed");

const universe = JSON.parse(readFileSync("src/data/universe.json", "utf8"));
const byMint = new Map();
for (const u of universe.underlyings) {
  for (const t of u.tokens) byMint.set(t.mint, { ...t, underlying: u.symbol, name: u.name });
}
const STABLE = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
};

const sol = await conn.getBalance(owner);
console.log(`wallet   ${owner.toBase58()}`);
console.log(`SOL      ${(sol / 1e9).toFixed(6)}  (${sol} lamports)\n`);

const rows = [];
for (const programId of [TOKEN, TOKEN_2022]) {
  const res = await conn.getParsedTokenAccountsByOwner(owner, { programId });
  for (const { pubkey, account } of res.value) {
    const info = account.data.parsed.info;
    const amount = Number(info.tokenAmount.uiAmount || 0);
    const raw = info.tokenAmount.amount;
    const known = byMint.get(info.mint);
    rows.push({
      mint: info.mint,
      ata: pubkey.toBase58(),
      program: programId.equals(TOKEN_2022) ? "token-2022" : "spl-token",
      amount,
      raw,
      decimals: info.tokenAmount.decimals,
      label: known ? `${known.symbol} (${known.underlying}, ${known.issuer})` : STABLE[info.mint] || "unknown",
      isStock: !!known,
      isStable: !!STABLE[info.mint],
      rentLamports: account.lamports,
    });
  }
}

// price the stock positions the same way the app would: a real sell quote
const JUP = process.env.JUPITER_API_KEY || env.JUPITER_API_KEY;
const JUP_BASE = JUP ? "https://api.jup.ag" : "https://lite-api.jup.ag";
const SOL_MINT = "So11111111111111111111111111111111111111112";

async function sellQuote(mint, rawAmount) {
  const url = `${JUP_BASE}/swap/v1/quote?inputMint=${mint}&outputMint=${SOL_MINT}&amount=${rawAmount}&slippageBps=100&restrictIntermediateTokens=true`;
  const r = await fetch(url, { headers: JUP ? { "x-api-key": JUP } : {} });
  if (!r.ok) return { error: `${r.status} ${(await r.text()).slice(0, 140)}` };
  const q = await r.json();
  return { outLamports: Number(q.outAmount), impactPct: Number(q.priceImpactPct || 0), route: q.routePlan?.length ?? 0 };
}

console.log("token accounts:");
let sellableLamports = 0;
const sellable = [];
const empties = [];
for (const r of rows.sort((a, b) => Number(b.isStock) - Number(a.isStock))) {
  let extra = "";
  if (r.amount === 0) {
    empties.push(r);
    extra = "  — empty, closing it reclaims rent";
  } else if (r.isStock || r.isStable) {
    const q = await sellQuote(r.mint, r.raw);
    if (q.error) extra = `  — no sell quote (${q.error})`;
    else {
      extra = `  → ${(q.outLamports / 1e9).toFixed(6)} SOL  (impact ${(q.impactPct * 100).toFixed(2)}%, ${q.route} hop)`;
      sellableLamports += q.outLamports;
      sellable.push({ ...r, outLamports: q.outLamports });
    }
  }
  console.log(
    `  ${r.label.padEnd(30)} ${String(r.amount).padStart(14)}  ${r.program.padEnd(11)} rent ${(r.rentLamports / 1e9).toFixed(6)}${extra}`,
  );
}

const rentBack = rows.reduce((a, r) => a + r.rentLamports, 0);
console.log(`\nif everything is sold and every account closed:`);
console.log(`  from sales     ${(sellableLamports / 1e9).toFixed(6)} SOL`);
console.log(`  rent reclaimed ${(rentBack / 1e9).toFixed(6)} SOL  (${rows.length} accounts)`);
console.log(`  already held   ${(sol / 1e9).toFixed(6)} SOL`);
console.log(`  ------------------------------`);
console.log(`  total          ${((sellableLamports + rentBack + sol) / 1e9).toFixed(6)} SOL  before network fees`);
console.log(`\n  ${sellable.length} swap(s) to sign, ~0.000005 SOL fee each; empty accounts to close: ${empties.length}`);
