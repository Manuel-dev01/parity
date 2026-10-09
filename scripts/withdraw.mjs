// Send the demo wallet's balances to an external address.
//
//   node scripts/withdraw.mjs <destination>            dry run
//   node scripts/withdraw.mjs <destination> --go       sign and send
//   node scripts/withdraw.mjs <destination> --go --sol-only
//
// Order matters: USDC goes first (which may have to create the destination's token account
// and is paid for in SOL), then that emptied account is closed to reclaim its rent, and only
// then is the SOL swept — so the final transfer can carry everything that is left.
//
// Leaves exactly the network fee behind. Nothing else.
import {
  Connection, Keypair, PublicKey, SystemProgram,
  TransactionInstruction, TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync } from "node:fs";

const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDC_DECIMALS = 6;

const args = process.argv.slice(2);
const go = args.includes("--go");
const solOnly = args.includes("--sol-only");
const destArg = args.find((a) => !a.startsWith("--"));
if (!destArg) {
  console.error("usage: node scripts/withdraw.mjs <destination> [--go] [--sol-only]");
  process.exit(1);
}
let dest;
try {
  dest = new PublicKey(destArg);
} catch {
  console.error(`"${destArg}" is not a valid Solana address`);
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const kp = Keypair.fromSecretKey(bs58.decode(env.DEMO_WALLET_SECRET_KEY));
const owner = kp.publicKey;
const conn = new Connection(env.SOLANA_RPC || "https://api.mainnet-beta.solana.com", "confirmed");

if (dest.equals(owner)) {
  console.error("destination is the demo wallet itself — nothing to do");
  process.exit(1);
}

const ataFor = (mint, who) =>
  PublicKey.findProgramAddressSync([who.toBuffer(), TOKEN.toBuffer(), mint.toBuffer()], ATA_PROGRAM)[0];

const u64 = (n) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};

console.log(`from   ${owner.toBase58()}`);
console.log(`to     ${dest.toBase58()}`);
console.log(`mode   ${go ? "LIVE — will sign and send" : "dry run — nothing will be sent"}\n`);

// A destination that holds nothing and owns no account is very often a typo. Say so.
const destInfo = await conn.getAccountInfo(dest);
const destSol = await conn.getBalance(dest);
console.log(`destination: ${destInfo ? `exists, owner ${destInfo.owner.toBase58()}` : "no account on chain yet"}, ${(destSol / 1e9).toFixed(6)} SOL`);
if (destInfo && !destInfo.owner.equals(SystemProgram.programId)) {
  console.log("! this is a program-owned account, not a normal wallet — check the address before sending");
}

const sigs = [];

// ── USDC ──────────────────────────────────────────────────────────────────
const srcAta = ataFor(USDC, owner);
const srcBal = await conn.getTokenAccountBalance(srcAta).catch(() => null);
const usdcRaw = srcBal ? Number(srcBal.value.amount) : 0;

if (!solOnly && usdcRaw > 0) {
  const dstAta = ataFor(USDC, dest);
  const dstExists = !!(await conn.getAccountInfo(dstAta));
  console.log(`\nUSDC  ${(usdcRaw / 10 ** USDC_DECIMALS).toFixed(6)}  →  ${dstAta.toBase58()}${dstExists ? "" : "  (creating, ~0.00204 SOL)"}`);

  const ixs = [];
  if (!dstExists) {
    // createIdempotent — safe even if someone creates it between our check and the send
    ixs.push(
      new TransactionInstruction({
        programId: ATA_PROGRAM,
        keys: [
          { pubkey: owner, isSigner: true, isWritable: true },
          { pubkey: dstAta, isSigner: false, isWritable: true },
          { pubkey: dest, isSigner: false, isWritable: false },
          { pubkey: USDC, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN, isSigner: false, isWritable: false },
        ],
        data: Buffer.from([1]),
      }),
    );
  }
  // transferChecked (12): amount u64, decimals u8
  ixs.push(
    new TransactionInstruction({
      programId: TOKEN,
      keys: [
        { pubkey: srcAta, isSigner: false, isWritable: true },
        { pubkey: USDC, isSigner: false, isWritable: false },
        { pubkey: dstAta, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
      ],
      data: Buffer.concat([Buffer.from([12]), u64(usdcRaw), Buffer.from([USDC_DECIMALS])]),
    }),
  );
  // close the emptied source account in the same transaction, reclaiming its rent
  ixs.push(
    new TransactionInstruction({
      programId: TOKEN,
      keys: [
        { pubkey: srcAta, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
      ],
      data: Buffer.from([9]),
    }),
  );

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new VersionedTransaction(
    new TransactionMessage({ payerKey: owner, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(),
  );
  tx.sign([kp]);

  if (!go) {
    const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
    console.log(`      simulate: ${sim.value.err ? `FAILED ${JSON.stringify(sim.value.err)}` : `ok, ${sim.value.unitsConsumed} CU`}`);
    if (sim.value.err) console.log((sim.value.logs || []).slice(-8).map((l) => "        " + l).join("\n"));
  } else {
    const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
    const conf = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    console.log(`      ${conf.value.err ? `FAILED ${JSON.stringify(conf.value.err)}` : "sent"}  https://solscan.io/tx/${sig}`);
    sigs.push(sig);
  }
} else if (!solOnly) {
  console.log("\nno USDC to send");
}

// ── SOL sweep ─────────────────────────────────────────────────────────────
const balance = await conn.getBalance(owner);
const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");

const probe = new VersionedTransaction(
  new TransactionMessage({
    payerKey: owner,
    recentBlockhash: blockhash,
    instructions: [SystemProgram.transfer({ fromPubkey: owner, toPubkey: dest, lamports: 1 })],
  }).compileToV0Message(),
);
const feeRes = await conn.getFeeForMessage(probe.message, "confirmed");
const fee = feeRes?.value ?? 5000;
const send = balance - fee;

console.log(`\nSOL   balance ${(balance / 1e9).toFixed(6)}  fee ${(fee / 1e9).toFixed(6)}  →  sending ${(send / 1e9).toFixed(6)}`);
if (send <= 0) {
  console.log("! nothing left to send after the fee");
} else {
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: owner,
      recentBlockhash: blockhash,
      instructions: [SystemProgram.transfer({ fromPubkey: owner, toPubkey: dest, lamports: send })],
    }).compileToV0Message(),
  );
  tx.sign([kp]);

  if (!go) {
    const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
    console.log(`      simulate: ${sim.value.err ? `FAILED ${JSON.stringify(sim.value.err)}` : "ok"}`);
  } else {
    const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
    const conf = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    console.log(`      ${conf.value.err ? `FAILED ${JSON.stringify(conf.value.err)}` : "sent"}  https://solscan.io/tx/${sig}`);
    sigs.push(sig);
  }
}

if (go) {
  console.log(`\nleft behind: ${((await conn.getBalance(owner)) / 1e9).toFixed(6)} SOL`);
  console.log(`${sigs.length} transaction(s) sent`);
} else {
  console.log("\ndry run — nothing was sent. re-run with --go to execute.");
}
