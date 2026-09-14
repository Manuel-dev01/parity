import { Connection, PublicKey } from "@solana/web3.js";

// Pyth's push oracle keeps sponsored PriceUpdateV2 accounts on mainnet for the major
// US equities. Reading them costs one RPC call and needs no Hermes key; the same
// accounts are what fair_fill_guard verifies against on-chain.
export const PYTH_PUSH_ORACLE = "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT";
export const PYTH_RECEIVER = "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ";

export const rpc = () => new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.mainnet-beta.solana.com", "confirmed");

export interface OnchainPrice {
  feedId: string;
  price: number;
  conf: number;
  expo: number;
  publishTime: number;
  fullyVerified: boolean;
}

export function parsePriceUpdateV2(d: Buffer): OnchainPrice {
  let o = 8 + 32; // discriminator + write_authority
  const vl = d[o];
  o += 1;
  if (vl === 0) o += 1; // Partial { num_signatures }
  const feedId = d.subarray(o, o + 32).toString("hex");
  o += 32;
  const price = d.readBigInt64LE(o);
  o += 8;
  const conf = d.readBigUInt64LE(o);
  o += 8;
  const expo = d.readInt32LE(o);
  o += 4;
  const publishTime = Number(d.readBigInt64LE(o));
  return { feedId, price: Number(price) * 10 ** expo, conf: Number(conf) * 10 ** expo, expo, publishTime, fullyVerified: vl === 1 };
}

export async function readPythOnchain(address: string): Promise<OnchainPrice | null> {
  const info = await rpc().getAccountInfo(new PublicKey(address));
  if (!info || info.owner.toBase58() !== PYTH_RECEIVER) return null;
  return parsePriceUpdateV2(info.data);
}
