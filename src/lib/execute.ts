// Composes one buy transaction for a chosen issuer token.
//
//   guarded  snapshot → Jupiter swap → verify, in one tx (composable venue + program deployed)
//   plain    Jupiter swap only, client-side guard (composable venue, program not yet deployed)
//   ultra    Jupiter Ultra order (RFQ / non-composable); the returned tx is signed as-is
//
// Every mode refuses to hand back a transaction whose quoted fill is further from fair value
// than the caller's max_dev_bps, so the client-side guard applies even where the on-chain one can't.
import { AddressLookupTableAccount, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import type { FairValue, IssuerId, Underlying, UniverseToken } from "./types";
import { USDC_MINT } from "./universe";
import { getFairValue } from "./fairvalue";
import { rpc } from "./pyth-onchain";
import { JupiterError, swapInstructions, swapQuote, ultraOrder } from "./jupiter";
import {
  GUARD_DEFAULTS,
  TOKEN_PROGRAM,
  buildSnapshotIx,
  buildVerifyIx,
  deriveAta,
  deriveReceiptPda,
  deriveSnapshotPda,
  feedIdFromHex,
  guardProgramId,
  newNonce,
} from "./guard";

export type SwapMode = "guarded" | "plain" | "ultra";

export interface SwapBuild {
  mode: SwapMode;
  /** base64 transaction: unsigned v0 (guarded/plain) or Ultra's ready-to-sign tx */
  tx: string;
  requestId?: string;
  guard?: { programId: string; priceUpdate: string; nonce: string; receipt: string; maxDevBps: number; maxConfBps: number; maxAgeSec: number };
  /** why this mode was chosen, shown verbatim in the UI */
  reason: string;
  quote: {
    symbol: string;
    issuer: IssuerId;
    mint: string;
    usd: number;
    shares: number;
    fillPx: number;
    fairPx: number;
    fairSource: FairValue["source"];
    devBps: number;
    priceImpactPct: number | null;
    route: string[];
    marketState: FairValue["marketState"];
  };
}

export class SwapRejected extends Error {
  constructor(msg: string, public status = 409) {
    super(msg);
  }
}

const bps = (px: number, fair: number) => Math.round(((px - fair) / fair) * 1e4);

export async function buildSwap(p: { underlying: Underlying; token: UniverseToken; usd: number; owner: string; maxDevBps: number }): Promise<SwapBuild> {
  const { underlying: u, token, usd, maxDevBps } = p;
  const owner = new PublicKey(p.owner);
  const fair = await getFairValue(u);
  if (fair.stale) throw new SwapRejected(`reference price for ${u.symbol} is stale (${fair.ageSec}s old); refusing to quote`);
  const amount = Math.round(usd * 1e6);

  const check = (outAmount: string) => {
    const shares = Number(outAmount) / 10 ** token.decimals;
    if (!(shares > 0)) throw new SwapRejected("route returned zero output");
    const fillPx = usd / shares;
    const devBps = bps(fillPx, fair.price);
    if (Math.abs(devBps) > maxDevBps) {
      throw new SwapRejected(`fill would be ${devBps > 0 ? "+" : ""}${devBps} bps from fair value (${fair.price.toFixed(2)}); your guard is ±${maxDevBps} bps`);
    }
    return { shares, fillPx, devBps };
  };
  const quoteBase = { symbol: u.symbol, issuer: token.issuer, mint: token.mint, usd, fairPx: fair.price, fairSource: fair.source, marketState: fair.marketState };
  const labels = (plan: { swapInfo?: { label?: string } }[]) => [...new Set(plan.map((r) => r.swapInfo?.label).filter(Boolean) as string[])];

  const program = guardProgramId();
  const composable = token.issuer !== "ondo";
  let reason: string;
  if (!composable) reason = "This issuer's token only quotes through JupiterZ RFQ (market-maker signed), which cannot be composed with the on-chain guard.";
  else if (!fair.onchainAccount) reason = `No sponsored Pyth on-chain feed for ${u.symbol}; the on-chain guard has nothing to verify against.`;
  else if (!program) reason = "fair_fill_guard is not deployed yet; the fill is checked against fair value before you sign.";
  else reason = "Verified on-chain against Pyth in the same transaction.";

  if (composable) {
    let quote;
    try {
      quote = await swapQuote({ inputMint: USDC_MINT, outputMint: token.mint, amount, slippageBps: Math.min(maxDevBps, 100) });
    } catch (e) {
      if (!(e instanceof JupiterError && /NO_ROUTES/i.test(e.code))) throw e;
      reason = "No pool route for this size; falling back to Jupiter Ultra (client-side guard).";
    }
    if (quote) {
      const q = check(quote.outAmount);
      const ixs = await swapInstructions({ quoteResponse: quote, userPublicKey: p.owner });
      const guarded = !!program && !!fair.onchainAccount;
      const instructions: TransactionInstruction[] = [...ixs.computeBudget, ...ixs.setup];
      let guard: SwapBuild["guard"];
      if (guarded && program && fair.onchainAccount) {
        const inMint = new PublicKey(USDC_MINT);
        const outMint = new PublicKey(token.mint);
        const inAta = deriveAta(owner, inMint, TOKEN_PROGRAM);
        const outAta = deriveAta(owner, outMint, new PublicKey(token.tokenProgram));
        const nonce = newNonce();
        const snapshotPda = deriveSnapshotPda(program, owner, outMint);
        const receiptPda = deriveReceiptPda(program, owner, outMint, nonce);
        const priceUpdate = new PublicKey(fair.onchainAccount);
        const maxAgeSec = fair.marketState === "regular" ? GUARD_DEFAULTS.maxAgeSecRegular : GUARD_DEFAULTS.maxAgeSecOffHours;
        instructions.push(buildSnapshotIx({ programId: program, owner, inAta, outAta, snapshotPda, nonce }));
        instructions.push(ixs.swap, ...ixs.other);
        if (ixs.cleanup) instructions.push(ixs.cleanup);
        instructions.push(
          buildVerifyIx({
            programId: program,
            owner,
            inAta,
            outAta,
            inMint,
            outMint,
            snapshotPda,
            priceUpdate,
            receiptPda,
            feedId: feedIdFromHex(u.pyth!.us),
            maxDevBps,
            maxConfBps: GUARD_DEFAULTS.maxConfBps,
            maxAgeSec,
            issuer: token.issuer,
          }),
        );
        guard = {
          programId: program.toBase58(),
          priceUpdate: fair.onchainAccount,
          nonce: nonce.toString(),
          receipt: receiptPda.toBase58(),
          maxDevBps,
          maxConfBps: GUARD_DEFAULTS.maxConfBps,
          maxAgeSec,
        };
      } else {
        instructions.push(ixs.swap, ...ixs.other);
        if (ixs.cleanup) instructions.push(ixs.cleanup);
      }

      const conn = rpc();
      const tables = (await Promise.all(ixs.lookupTables.map((a) => conn.getAddressLookupTable(new PublicKey(a)).then((r) => r.value)))).filter(
        (t): t is AddressLookupTableAccount => !!t,
      );
      const { blockhash } = await conn.getLatestBlockhash("confirmed");
      const msg = new TransactionMessage({ payerKey: owner, recentBlockhash: blockhash, instructions }).compileToV0Message(tables);
      const tx = new VersionedTransaction(msg);
      return {
        mode: guarded ? "guarded" : "plain",
        tx: Buffer.from(tx.serialize()).toString("base64"),
        guard,
        reason,
        quote: { ...quoteBase, ...q, priceImpactPct: Number(quote.priceImpactPct) || null, route: labels(quote.routePlan) },
      };
    }
  }

  const order = await ultraOrder({ inputMint: USDC_MINT, outputMint: token.mint, amount, taker: p.owner });
  if (!order.transaction) throw new SwapRejected("Jupiter Ultra returned no transaction for this order", 502);
  const q = check(order.outAmount);
  return {
    mode: "ultra",
    tx: order.transaction,
    requestId: order.requestId,
    reason,
    quote: { ...quoteBase, ...q, priceImpactPct: order.priceImpactPct != null ? Number(order.priceImpactPct) : null, route: order.swapType === "rfq" ? ["JupiterZ RFQ"] : labels(order.routePlan ?? []) },
  };
}
