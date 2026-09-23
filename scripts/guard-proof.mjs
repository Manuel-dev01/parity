// Proves fair_fill_guard on devnet: snapshot -> mock fill -> verify, once passing and once
// deliberately off-fair so the transaction reverts. Free (devnet airdrop), and the guard reads a
// real Pyth PriceUpdateV2 account posted by Pyth's receiver program, exactly as it would on mainnet.
//
//   node scripts/guard-proof.mjs [--feed=sol|nvda]
//
// Jupiter is not executable on devnet, so the "swap" here is a transfer out + a mint in. The guard
// is router-agnostic by design — it only measures the trader's balance deltas — so this exercises
// the same code path a real swap would.
import { Connection, Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, appendFileSync } from "node:fs";

const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROG = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const PUSH = new PublicKey("pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT");
const FEEDS = {
  sol: { hex: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d", maxAge: 300, label: "Pyth SOL/USD (live on devnet)" },
  nvda: { hex: "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593", maxAge: 90 * 86400, label: "Pyth Equity.US.NVDA/USD (present on devnet, not maintained - wide max_age)" },
};
const feed = FEEDS[process.argv.find((a) => a.startsWith("--feed="))?.split("=")[1] ?? "sol"];
if (!feed) throw new Error("--feed must be sol or nvda");

const env = Object.fromEntries(
  (existsSync(".env") ? readFileSync(".env", "utf8") : "")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const PROGRAM_ID = env.NEXT_PUBLIC_GUARD_PROGRAM_ID;
if (!PROGRAM_ID || PROGRAM_ID.startsWith("FFGuard")) throw new Error("set NEXT_PUBLIC_GUARD_PROGRAM_ID in .env to the devnet program id first");
const PROGRAM = new PublicKey(PROGRAM_ID);
const conn = new Connection(env.DEVNET_RPC || "https://api.devnet.solana.com", "confirmed");

let kp;
if (env.DEVNET_SECRET_KEY) kp = Keypair.fromSecretKey(bs58.decode(env.DEVNET_SECRET_KEY));
else {
  kp = Keypair.generate();
  appendFileSync(".env", `\nDEVNET_SECRET_KEY=${bs58.encode(kp.secretKey)}\n`);
  console.log("generated a devnet keypair into .env");
}
console.log(`devnet wallet ${kp.publicKey.toBase58()}`);

const disc = (n) => createHash("sha256").update(`global:${n}`).digest().subarray(0, 8);
const u64 = (n) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};
const ata = (owner, mint) => PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN.toBuffer(), mint.toBuffer()], ATA_PROG)[0];
const key = (pubkey, isSigner = false, isWritable = false) => ({ pubkey, isSigner, isWritable });

const createAta = (payer, owner, mint) =>
  new TransactionInstruction({
    programId: ATA_PROG,
    keys: [key(payer, true, true), key(ata(owner, mint), false, true), key(owner), key(mint), key(SystemProgram.programId), key(TOKEN)],
    data: Buffer.from([1]),
  });
const initMint = (mint, decimals, authority) =>
  new TransactionInstruction({ programId: TOKEN, keys: [key(mint, false, true)], data: Buffer.concat([Buffer.from([20, decimals]), authority.toBuffer(), Buffer.from([0])]) });
const mintTo = (mint, dest, authority, amount) =>
  new TransactionInstruction({ programId: TOKEN, keys: [key(mint, false, true), key(dest, false, true), key(authority, true)], data: Buffer.concat([Buffer.from([7]), u64(amount)]) });
const transfer = (src, dest, authority, amount) =>
  new TransactionInstruction({ programId: TOKEN, keys: [key(src, false, true), key(dest, false, true), key(authority, true)], data: Buffer.concat([Buffer.from([3]), u64(amount)]) });

async function send(ixs, signers, { skipPreflight = false } = {}) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: kp.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message());
  tx.sign(signers);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight, maxRetries: 5 });
  const res = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return { sig, err: res.value.err };
}

async function ensureFunds() {
  let bal = await conn.getBalance(kp.publicKey);
  while (bal < 0.3e9) {
    console.log(`balance ${(bal / 1e9).toFixed(3)} SOL, requesting devnet airdrop...`);
    try {
      const s = await conn.requestAirdrop(kp.publicKey, 1e9);
      await conn.confirmTransaction(s, "confirmed");
    } catch (e) {
      throw new Error(`airdrop failed (${e.message}). Use https://faucet.solana.com for ${kp.publicKey.toBase58()} and re-run.`);
    }
    bal = await conn.getBalance(kp.publicKey);
  }
  console.log(`balance ${(bal / 1e9).toFixed(3)} SOL`);
}

function readPyth(data) {
  let o = 40;
  const vl = data[o];
  o += 1;
  if (vl === 0) o += 1;
  const feedId = data.subarray(o, o + 32);
  o += 32;
  const price = data.readBigInt64LE(o);
  o += 8;
  const conf = data.readBigUInt64LE(o);
  o += 8;
  const expo = data.readInt32LE(o);
  o += 4;
  const publishTime = Number(data.readBigInt64LE(o));
  return { feedId, price: Number(price) * 10 ** expo, conf: Number(conf) * 10 ** expo, publishTime };
}

function decodeReceipt(d) {
  let o = 8;
  const pk = () => {
    const v = new PublicKey(d.subarray(o, o + 32));
    o += 32;
    return v;
  };
  const n64 = () => {
    const v = Number(d.readBigUInt64LE(o));
    o += 8;
    return v;
  };
  const owner = pk();
  const outMint = pk();
  const issuer = d[o++];
  const spent = n64();
  const received = n64();
  const fillPx = n64();
  const fairPx = n64();
  const devBps = d.readUInt16LE(o);
  o += 2;
  const signedDevBps = d.readInt16LE(o);
  o += 2;
  const slot = n64();
  o += 8 + 32;
  const nonce = n64();
  return { owner: owner.toBase58(), outMint: outMint.toBase58(), issuer, spent, received, fillPx: fillPx / 1e8, fairPx: fairPx / 1e8, devBps, signedDevBps, slot, nonce };
}

async function attempt(o) {
  const nonce = randomBytes(8).readBigUInt64LE();
  const snapshotPda = PublicKey.findProgramAddressSync([Buffer.from("snapshot"), kp.publicKey.toBuffer(), o.stockMint.toBuffer()], PROGRAM)[0];
  const receiptPda = PublicKey.findProgramAddressSync([Buffer.from("receipt"), kp.publicKey.toBuffer(), o.stockMint.toBuffer(), u64(nonce)], PROGRAM)[0];
  const args = Buffer.alloc(45);
  o.feedId.copy(args, 0);
  args.writeUInt16LE(o.maxDevBps, 32);
  args.writeUInt16LE(50, 34);
  args.writeBigUInt64LE(BigInt(feed.maxAge), 36);
  args.writeUInt8(0, 44);
  const ixs = [
    new TransactionInstruction({
      programId: PROGRAM,
      keys: [key(kp.publicKey, true, true), key(o.usdcAta), key(o.stockAta), key(snapshotPda, false, true), key(SystemProgram.programId)],
      data: Buffer.concat([disc("snapshot"), u64(nonce)]),
    }),
    transfer(o.usdcAta, o.venueUsdcAta, kp.publicKey, o.spend),
    mintTo(o.stockMint, o.stockAta, kp.publicKey, o.shares),
    new TransactionInstruction({
      programId: PROGRAM,
      keys: [
        key(kp.publicKey, true, true),
        key(o.usdcAta),
        key(o.stockAta),
        key(o.usdcMint),
        key(o.stockMint),
        key(snapshotPda, false, true),
        key(o.priceUpdate),
        key(receiptPda, false, true),
        key(SystemProgram.programId),
      ],
      data: Buffer.concat([disc("verify"), args]),
    }),
  ];
  console.log(`\n--- ${o.label}`);
  let sig, err;
  try {
    ({ sig, err } = await send(ixs, [kp], { skipPreflight: o.expectFail }));
  } catch (e) {
    const logs = (e.logs ?? e.transactionLogs ?? []).filter((l) => /Error|fair/i.test(l));
    console.log(`rejected before landing: ${logs.join(" | ") || e.message}`);
    return o.expectFail ? 0 : 1;
  }
  const url = `https://solscan.io/tx/${sig}?cluster=devnet`;
  if (err) {
    const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
    const guardLog = (tx?.meta?.logMessages ?? []).find((l) => l.includes("Error Message"));
    console.log(`reverted on-chain: ${guardLog?.trim() ?? JSON.stringify(err)}`);
    console.log(url);
    return o.expectFail ? 0 : 1;
  }
  const info = await conn.getAccountInfo(receiptPda);
  const r = decodeReceipt(info.data);
  console.log(`filled ${r.received} units for ${r.spent} - fill $${r.fillPx.toFixed(4)} vs fair $${r.fairPx.toFixed(4)}, ${r.signedDevBps >= 0 ? "+" : ""}${r.signedDevBps} bps`);
  console.log(`Receipt ${receiptPda.toBase58()}`);
  console.log(url);
  return o.expectFail ? 1 : 0;
}

async function main() {
  const acc = await conn.getAccountInfo(PROGRAM);
  if (!acc?.executable) throw new Error(`${PROGRAM_ID} is not an executable program on devnet - deploy it in Solana Playground first`);
  await ensureFunds();

  const priceUpdate = PublicKey.findProgramAddressSync([Buffer.alloc(2), Buffer.from(feed.hex, "hex")], PUSH)[0];
  const pInfo = await conn.getAccountInfo(priceUpdate);
  if (!pInfo) throw new Error(`no Pyth account on devnet at ${priceUpdate.toBase58()}`);
  const px = readPyth(pInfo.data);
  console.log(`reference: ${feed.label}`);
  console.log(`  ${priceUpdate.toBase58()} = $${px.price.toFixed(4)} +/-${px.conf.toFixed(4)}, ${Math.round(Date.now() / 1000 - px.publishTime)}s old`);

  const usdcMint = Keypair.generate();
  const stockMint = Keypair.generate();
  const rent = await conn.getMinimumBalanceForRentExemption(82);
  const venue = Keypair.fromSeed(Buffer.alloc(32, 7)).publicKey;
  const usdcAta = ata(kp.publicKey, usdcMint.publicKey);
  const stockAta = ata(kp.publicKey, stockMint.publicKey);
  const venueUsdcAta = ata(venue, usdcMint.publicKey);
  const setup = [
    SystemProgram.createAccount({ fromPubkey: kp.publicKey, newAccountPubkey: usdcMint.publicKey, lamports: rent, space: 82, programId: TOKEN }),
    initMint(usdcMint.publicKey, 6, kp.publicKey),
    SystemProgram.createAccount({ fromPubkey: kp.publicKey, newAccountPubkey: stockMint.publicKey, lamports: rent, space: 82, programId: TOKEN }),
    initMint(stockMint.publicKey, 8, kp.publicKey),
    createAta(kp.publicKey, kp.publicKey, usdcMint.publicKey),
    createAta(kp.publicKey, kp.publicKey, stockMint.publicKey),
    createAta(kp.publicKey, venue, usdcMint.publicKey),
    mintTo(usdcMint.publicKey, usdcAta, kp.publicKey, 1_000_000_000),
  ];
  const { sig: setupSig, err: setupErr } = await send(setup, [kp, usdcMint, stockMint]);
  if (setupErr) throw new Error(`setup failed: ${JSON.stringify(setupErr)}`);
  console.log(`mock market ready (${setupSig.slice(0, 8)}...): USDC ${usdcMint.publicKey.toBase58().slice(0, 8)}... stock ${stockMint.publicKey.toBase58().slice(0, 8)}...`);

  const spend = 100_000_000;
  const atFair = Math.round((100 / px.price) * 1e8);
  const common = {
    stockMint: stockMint.publicKey,
    usdcMint: usdcMint.publicKey,
    usdcAta,
    stockAta,
    venueUsdcAta,
    spend,
    maxDevBps: 50,
    priceUpdate,
    feedId: px.feedId,
  };

  let bad = 0;
  bad += await attempt({ ...common, label: "fill at fair value, guard +/-50 bps -> expect a Receipt", shares: atFair, expectFail: false });
  bad += await attempt({ ...common, label: "fill 300 bps above fair, guard +/-50 bps -> expect a revert", shares: Math.round(atFair / 1.03), expectFail: true });
  console.log(bad === 0 ? "\nboth cases behaved as expected" : `\n${bad} case(s) did NOT behave as expected`);
  return bad === 0 ? 0 : 1;
}

process.exitCode = await main();
