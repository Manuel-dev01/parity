// Sell the demo wallet's stock tokens to SOL and close the emptied accounts.
//
//   node scripts/liquidate.mjs           dry run: quote + simulate, send nothing
//   node scripts/liquidate.mjs --go      actually sign and send
//   node scripts/liquidate.mjs --go --keep=USDC,USDT
//
// Refuses to touch anything in --keep (default USDC). Never closes an account that still
// holds a balance. Prints every signature.
import { Connection, Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync } from "node:fs";

const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const SOL_MINT = "So11111111111111111111111111111111111111112";
const SLIPPAGE_BPS = Number(process.argv.find((a) => a.startsWith("--slippage="))?.split("=")[1] ?? 100);

const go = process.argv.includes("--go");
const keepNames = (process.argv.find((a) => a.startsWith("--keep="))?.split("=")[1] ?? "USDC")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const kp = Keypair.fromSecretKey(bs58.decode(env.DEMO_WALLET_SECRET_KEY));
const owner = kp.publicKey;
const conn = new Connection(env.SOLANA_RPC || "https://api.mainnet-beta.solana.com", "confirmed");

const JUP = env.JUPITER_API_KEY;
const JUP_BASE = JUP ? "https://api.jup.ag" : "https://lite-api.jup.ag";
const jupHeaders = JUP ? { "x-api-key": JUP } : {};

const universe = JSON.parse(readFileSync("src/data/universe.json", "utf8"));
const byMint = new Map();
for (const u of universe.underlyings) for (const t of u.tokens) byMint.set(t.mint, { ...t, underlying: u.symbol });
const STABLE = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
};

const label = (mint) => {
  const k = byMint.get(mint);
  return k ? `${k.symbol} (${k.underlying}/${k.issuer})` : STABLE[mint] || `unknown ${mint.slice(0, 8)}…`;
};
const isKept = (mint) => keepNames.includes((STABLE[mint] || "").toUpperCase());

// ── survey ────────────────────────────────────────────────────────────────
const accounts = [];
for (const programId of [TOKEN, TOKEN_2022]) {
  const res = await conn.getParsedTokenAccountsByOwner(owner, { programId });
  for (const { pubkey, account } of res.value) {
    const i = account.data.parsed.info;
    accounts.push({
      ata: pubkey,
      programId,
      mint: i.mint,
      raw: i.tokenAmount.amount,
      ui: Number(i.tokenAmount.uiAmount || 0),
      rent: account.lamports,
    });
  }
}

const startSol = await conn.getBalance(owner);
console.log(`wallet ${owner.toBase58()}`);
console.log(`SOL    ${(startSol / 1e9).toFixed(6)}`);
console.log(`keep   ${keepNames.join(", ") || "(nothing)"}`);
console.log(`mode   ${go ? "LIVE — will sign and send" : "dry run — nothing will be sent"}\n`);

const toSell = accounts.filter((a) => a.ui > 0 && !isKept(a.mint));
const kept = accounts.filter((a) => a.ui > 0 && isKept(a.mint));

for (const a of kept) console.log(`keeping  ${label(a.mint).padEnd(26)} ${a.ui}`);
if (kept.length) console.log();

// ── sell ──────────────────────────────────────────────────────────────────
const sigs = [];
for (const a of toSell) {
  const qUrl = `${JUP_BASE}/swap/v1/quote?inputMint=${a.mint}&outputMint=${SOL_MINT}&amount=${a.raw}&slippageBps=${SLIPPAGE_BPS}&restrictIntermediateTokens=true`;
  const quote = await fetch(qUrl, { headers: jupHeaders }).then((r) => r.json());
  if (!quote?.outAmount) {
    console.log(`! ${label(a.mint)}: no route — ${JSON.stringify(quote).slice(0, 160)}`);
    continue;
  }
  const out = Number(quote.outAmount) / 1e9;
  const min = Number(quote.otherAmountThreshold) / 1e9;
  console.log(`sell  ${label(a.mint).padEnd(26)} ${String(a.ui).padStart(12)}  →  ${out.toFixed(6)} SOL (min ${min.toFixed(6)}, impact ${(Number(quote.priceImpactPct) * 100).toFixed(3)}%)`);

  const swap = await fetch(`${JUP_BASE}/swap/v1/swap`, {
    method: "POST",
    headers: { "content-type": "application/json", ...jupHeaders },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: owner.toBase58(),
      wrapAndUnwrapSol: true, // proceeds land as native SOL, not wSOL
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 200_000, priorityLevel: "medium" } },
    }),
  }).then((r) => r.json());
  if (!swap?.swapTransaction) {
    console.log(`! ${label(a.mint)}: swap build failed — ${JSON.stringify(swap).slice(0, 200)}`);
    continue;
  }

  const tx = VersionedTransaction.deserialize(Buffer.from(swap.swapTransaction, "base64"));
  tx.sign([kp]);

  if (!go) {
    const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
    console.log(`      simulate: ${sim.value.err ? `FAILED ${JSON.stringify(sim.value.err)}` : `ok, ${sim.value.unitsConsumed} CU`}`);
    if (sim.value.err) console.log((sim.value.logs || []).slice(-6).map((l) => "        " + l).join("\n"));
    continue;
  }

  const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
  const conf = await conn.confirmTransaction({ signature: sig, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: swap.lastValidBlockHeight }, "confirmed");
  console.log(`      ${conf.value.err ? `FAILED ${JSON.stringify(conf.value.err)}` : "confirmed"}  https://solscan.io/tx/${sig}`);
  sigs.push(sig);
}

// ── close emptied accounts ────────────────────────────────────────────────
// Re-read: an account we just sold out of is only closable once it really is empty.
const after = [];
for (const programId of [TOKEN, TOKEN_2022]) {
  const res = await conn.getParsedTokenAccountsByOwner(owner, { programId });
  for (const { pubkey, account } of res.value) {
    const i = account.data.parsed.info;
    after.push({ ata: pubkey, programId, mint: i.mint, ui: Number(i.tokenAmount.uiAmount || 0), rent: account.lamports });
  }
}
const closable = after.filter((a) => a.ui === 0 && !isKept(a.mint));
const reclaim = closable.reduce((s, a) => s + a.rent, 0);

console.log(`\nclosable accounts: ${closable.length}  (reclaims ${(reclaim / 1e9).toFixed(6)} SOL)`);
for (const a of closable) console.log(`  ${label(a.mint).padEnd(26)} ${a.ata.toBase58()}`);

if (closable.length) {
  // CloseAccount is instruction 9 in both the Token and Token-2022 programs.
  const ixs = closable.map(
    (a) =>
      new TransactionInstruction({
        programId: a.programId,
        keys: [
          { pubkey: a.ata, isSigner: false, isWritable: true },
          { pubkey: owner, isSigner: false, isWritable: true },
          { pubkey: owner, isSigner: true, isWritable: false },
        ],
        data: Buffer.from([9]),
      }),
  );
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({ payerKey: owner, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([kp]);

  if (!go) {
    const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
    console.log(`  simulate close: ${sim.value.err ? `FAILED ${JSON.stringify(sim.value.err)}` : `ok, ${sim.value.unitsConsumed} CU`}`);
    if (sim.value.err) console.log((sim.value.logs || []).slice(-6).map((l) => "    " + l).join("\n"));
  } else {
    const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
    const conf = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    console.log(`  ${conf.value.err ? `FAILED ${JSON.stringify(conf.value.err)}` : "closed"}  https://solscan.io/tx/${sig}`);
    sigs.push(sig);
  }
}

const endSol = await conn.getBalance(owner);
console.log(`\nSOL ${(startSol / 1e9).toFixed(6)} → ${(endSol / 1e9).toFixed(6)}  (${endSol >= startSol ? "+" : ""}${((endSol - startSol) / 1e9).toFixed(6)})`);
if (sigs.length) console.log(`${sigs.length} transaction(s) sent`);
if (!go) console.log("\ndry run — nothing was sent. re-run with --go to execute.");
