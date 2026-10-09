import { PublicKey } from "@solana/web3.js";
import { rpc } from "./pyth-onchain";
import { STABLES, findByMint } from "./universe";

/**
 * What a transaction actually did, read from the chain.
 *
 * The receipts ledger is the product's central claim — "every fill writes a public receipt
 * you can check against the chain". That claim is only worth anything if the ledger itself
 * cannot be written by someone who never traded. So a recorded fill is not what the caller
 * says happened; it is what the chain says happened, and a signature that does not back the
 * claim is refused rather than stored.
 *
 * Everything here is derived from the transaction: the buyer is its fee payer, the token is
 * whichever non-stable mint that buyer's balance went *up* by, the size is the stablecoin
 * they paid, and the fill price is one divided by the other.
 */
export interface VerifiedFill {
  sig: string;
  wallet: string;
  mint: string;
  symbol: string;
  issuer: string;
  /** tokens actually received, from the balance delta */
  shares: number;
  /** stablecoin actually paid, from the balance delta */
  usd: number;
  payToken: string | null;
  /** usd / shares — what the fill really cost, not what it was quoted at */
  fillPx: number;
  slot: number;
  blockTime: number | null;
}

export class FillNotVerified extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

type Bal = {
  mint: string;
  owner?: string;
  uiTokenAmount: { uiAmount: number | null };
};

const delta = (pre: Bal[] | null | undefined, post: Bal[] | null | undefined, mint: string, owner: string) => {
  const at = (rows: Bal[] | null | undefined) =>
    rows?.filter((b) => b.mint === mint && b.owner === owner).reduce((s, b) => s + (b.uiTokenAmount.uiAmount ?? 0), 0) ?? 0;
  return at(post) - at(pre);
};

/**
 * Read a confirmed buy off the chain. Throws `FillNotVerified` when the signature does not
 * exist, did not succeed, or does not describe someone buying a token in Parity's universe.
 */
export async function verifyFill(sig: string): Promise<VerifiedFill> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,96}$/.test(sig)) throw new FillNotVerified("not a transaction signature");

  const conn = rpc();
  let tx = null;
  let lastErr: unknown = null;
  // The client records as soon as the transaction confirms, but `getTransaction` reads at
  // finalized by default and the ledger takes a moment to catch up — so ask at confirmed,
  // and give a just-landed transaction a few seconds to show up rather than calling a real
  // fill fake.
  for (let i = 0; i < 4 && !tx; i++) {
    if (i) await new Promise((r) => setTimeout(r, 1500));
    try {
      tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    } catch (e) {
      lastErr = e;
    }
  }
  if (!tx && lastErr) throw new FillNotVerified(`could not read ${sig} from the chain: ${String(lastErr)}`, 502);
  if (!tx) throw new FillNotVerified("no such transaction on this cluster", 404);
  if (tx.meta?.err) throw new FillNotVerified("that transaction failed on-chain", 409);

  // The fee payer is the first account key and is always a signer.
  const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses });
  const payer = keys.get(0);
  if (!payer) throw new FillNotVerified("transaction has no fee payer");
  const wallet = payer.toBase58();

  const pre = tx.meta?.preTokenBalances as Bal[] | undefined;
  const post = tx.meta?.postTokenBalances as Bal[] | undefined;

  // Which token did this wallet end up with more of?
  const touched = new Set<string>([...(pre ?? []), ...(post ?? [])].filter((b) => b.owner === wallet).map((b) => b.mint));
  let mint: string | null = null;
  let shares = 0;
  for (const m of touched) {
    if (STABLES[m]) continue;
    const d = delta(pre, post, m, wallet);
    if (d > shares) {
      shares = d;
      mint = m;
    }
  }
  if (!mint || shares <= 0) throw new FillNotVerified("that transaction did not increase any token balance for its signer", 409);

  const known = findByMint(mint);
  if (!known) throw new FillNotVerified("the token bought is not in Parity's universe", 409);

  // What they paid: whichever stablecoin went down.
  let usd = 0;
  let payToken: string | null = null;
  for (const m of Object.keys(STABLES)) {
    const d = -delta(pre, post, m, wallet);
    if (d > usd) {
      usd = d;
      payToken = STABLES[m].symbol;
    }
  }
  if (usd <= 0) throw new FillNotVerified("that transaction did not spend a stablecoin Parity recognises", 409);

  return {
    sig,
    wallet,
    mint,
    symbol: known.u.symbol,
    issuer: known.t.issuer,
    shares,
    usd,
    payToken,
    fillPx: usd / shares,
    slot: tx.slot,
    blockTime: tx.blockTime ?? null,
  };
}

export const isPubkey = (s: string) => {
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
};
