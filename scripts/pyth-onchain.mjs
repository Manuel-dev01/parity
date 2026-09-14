// Finds Pyth's sponsored on-chain PriceUpdateV2 accounts (push oracle PDAs) for every
// underlying in universe.json and records the freshest one. No API key involved.
import { readFileSync, writeFileSync } from "node:fs";
import { Connection, PublicKey } from "@solana/web3.js";

const PUSH = new PublicKey("pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT");
const SHARDS = [0, 1, 2, 3];
const conn = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.mainnet-beta.solana.com", "confirmed");

const file = "src/data/universe.json";
const data = JSON.parse(readFileSync(file, "utf8"));

const pdaOf = (hex, shard) => {
  const b = Buffer.alloc(2); b.writeUInt16LE(shard);
  return PublicKey.findProgramAddressSync([b, Buffer.from(hex, "hex")], PUSH)[0];
};
export function parsePriceUpdate(d) {
  let o = 8 + 32;
  const vl = d[o]; o += 1; if (vl === 0) o += 1;
  const feedId = d.subarray(o, o + 32).toString("hex"); o += 32;
  const price = d.readBigInt64LE(o); o += 8;
  const conf = d.readBigUInt64LE(o); o += 8;
  const expo = d.readInt32LE(o); o += 4;
  const publishTime = Number(d.readBigInt64LE(o)); o += 8;
  return { feedId, price: Number(price) * 10 ** expo, conf: Number(conf) * 10 ** expo, expo, publishTime, full: vl === 1 };
}

const wants = [];
for (const u of data.underlyings) {
  if (!u.pyth) continue;
  for (const kind of ["us", "index"]) {
    const id = u.pyth[kind]; if (!id) continue;
    for (const shard of SHARDS) wants.push({ u, kind, shard, pda: pdaOf(id, shard) });
  }
}
console.log("checking", wants.length, "candidate accounts");
const now = Date.now() / 1000;
for (let i = 0; i < wants.length; i += 100) {
  const batch = wants.slice(i, i + 100);
  const infos = await conn.getMultipleAccountsInfo(batch.map((w) => w.pda));
  infos.forEach((info, k) => {
    const w = batch[k];
    if (!info) return;
    const p = parsePriceUpdate(info.data);
    w.u.pythOnchain ??= {};
    const cur = w.u.pythOnchain[w.kind];
    const age = now - p.publishTime;
    if (!cur || age < cur.ageSec) w.u.pythOnchain[w.kind] = { address: w.pda.toBase58(), shard: w.shard, ageSec: Math.round(age), price: p.price };
  });
  process.stdout.write(".");
}
console.log();
const covered = data.underlyings.filter((u) => u.pythOnchain?.us);
const fresh = covered.filter((u) => u.pythOnchain.us.ageSec < 3600);
console.log(`on-chain Pyth: ${covered.length} underlyings, ${fresh.length} updated within the hour`);
console.log("multi-issuer covered:", data.underlyings.filter((u) => u.issuers.length >= 2 && u.pythOnchain?.us).length, "/", data.underlyings.filter((u) => u.issuers.length >= 2).length);
console.log("missing among top multi-issuer:", data.underlyings.filter((u) => u.issuers.length >= 2 && !u.pythOnchain?.us).slice(0, 25).map((u) => u.symbol).join(" "));
data.pythOnchainCheckedAt = new Date().toISOString();
writeFileSync(file, JSON.stringify(data, null, 1));
