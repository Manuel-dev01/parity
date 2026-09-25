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
import { STABLES, USDC_MINT } from "./universe";
import { getFairValue, jupiterPrices, type JupPrice } from "./fairvalue";
import { rpc } from "./pyth-onchain";
import { JupiterError, swapInstructions, swapQuote, ultraOrder } from "./jupiter";
import { quoteVenue } from "./venues";
import {
  GUARD_DEFAULTS,
  TOKEN_PROGRAM,
  buildSnapshotIx,
  buildVerifyIx,
  deriveAta,
  deriveReceiptPda,
  deriveSnapshotPda,
  feedIdFromHex,
  guardDeployment,
  mainnetGuardProgram,
  newNonce,
} from "./guard";

export type SwapMode = "guarded" | "plain" | "ultra";

/** The widest guard the UI can express. Keep in step with OrderSlip's slider. */
export const GUARD_MAX_BPS = 150;

export interface SwapBuild {
  mode: SwapMode;
  /** base64 transaction: unsigned v0 (guarded/plain) or Ultra's ready-to-sign tx */
  tx: string;
  requestId?: string;
  guard?: { programId: string; priceUpdate: string; nonce: string; receipt: string; maxDevBps: number; maxConfBps: number; maxAgeSec: number };
  /** why this mode was chosen, shown verbatim in the UI */
  reason: string;
  /** what the other issuers were quoting at the same size, captured at build time */
  routes: RouteSnapshot[];
  quote: {
    symbol: string;
    issuer: IssuerId;
    mint: string;
    /** amount of the input stablecoin spent, and what that was worth in USD */
    usd: number;
    payToken: string;
    payMint: string;
    payPriceUsd: number;
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

/** Every issuer's executable price for this share, at this size, at this moment. */
export interface RouteSnapshot {
  token: string;
  issuer: IssuerId;
  mint: string;
  effPx: number;
  devBps: number;
}

export class SwapRejected extends Error {
  constructor(
    msg: string,
    public status = 409,
    public refusal?: SwapRefusal,
  ) {
    super(msg);
  }
}

/** One concrete thing the buyer can do instead. Every figure here is a real quote. */
export interface RefusalOption {
  kind: "issuer" | "size" | "guard";
  title: string;
  detail: string;
  mint?: string;
  token?: string;
  usd?: number;
  maxDevBps?: number;
}

export interface SwapRefusal {
  symbol: string;
  token: string;
  issuer: IssuerId;
  usd: number;
  payToken: string;
  devBps: number;
  maxDevBps: number;
  fairPx: number;
  fillPx: number;
  /** distance from fair in dollars at this size */
  awayUsd: number;
  options: RefusalOption[];
}

/**
 * Builds the alternatives shown when the guard holds a trade: a sibling issuer that passes,
 * the largest size that still fits, and what widening the guard would actually cost. Each is
 * quoted for real — nothing here is derived from a formula standing in for liquidity.
 */
async function refusal(p: {
  u: Underlying;
  token: UniverseToken;
  usd: number;
  maxDevBps: number;
  fair: FairValue;
  devBps: number;
  fillPx: number;
  payToken: string;
}): Promise<SwapRefusal> {
  const { u, token, usd, maxDevBps, fair, devBps, fillPx, payToken } = p;
  const options: RefusalOption[] = [];
  const awayUsd = Math.abs((usd * devBps) / 1e4);
  const jp = await jupiterPrices(u.tokens.map((t) => t.mint)).catch(() => ({}) as Record<string, JupPrice>);

  // 1. another issuer's token for the same share, at the same size
  const siblings = u.tokens.filter((t) => t.mint !== token.mint);
  const quoted = await Promise.all(
    siblings.map(async (t) => {
      const v = await quoteVenue(t, [usd], usd, fair, jp[t.mint]).catch(() => null);
      const eff = v?.effPx[String(usd)];
      return v && eff != null && v.devBps != null ? { t, eff, devBps: v.devBps } : null;
    }),
  );
  const passing = quoted.filter((q): q is NonNullable<typeof q> => !!q && Math.abs(q.devBps) <= maxDevBps).sort((a, b) => a.eff - b.eff);
  if (passing.length) {
    const best = passing[0];
    const saved = Math.max(0, usd / best.eff - usd / fillPx) * fair.price;
    options.push({
      kind: "issuer",
      title: `Buy ${best.t.symbol} instead`,
      detail: `${best.devBps > 0 ? "+" : ""}${best.devBps} bps from fair${saved >= 1 ? ` · $${Math.round(saved)} more stock` : ""}`,
      mint: best.t.mint,
      token: best.t.symbol,
    });
  }

  // 2. the largest size that still fits, probed against real liquidity
  const ladder = [...new Set([0.5, 0.25, 0.1].map((f) => Math.max(100, Math.floor((usd * f) / 100) * 100)))].filter((s) => s < usd).sort((a, b) => b - a);
  if (ladder.length) {
    const v = await quoteVenue(token, ladder, ladder[0], fair, jp[token.mint]).catch(() => null);
    const fits = ladder.find((s) => {
      const eff = v?.effPx[String(s)];
      return eff != null && Math.abs(Math.round(((eff - fair.price) / fair.price) * 1e4)) <= maxDevBps;
    });
    if (fits) {
      const eff = v!.effPx[String(fits)]!;
      const d = Math.round(((eff - fair.price) / fair.price) * 1e4);
      options.push({
        kind: "size",
        title: `Buy $${fits.toLocaleString("en-US")} of ${token.symbol}`,
        detail: `Fits your guard at ${d > 0 ? "+" : ""}${d} bps`,
        usd: fits,
        mint: token.mint,
        token: token.symbol,
      });
    }
  }

  // 3. widen the guard, with the cost stated in dollars
  // Capped at the slider's own maximum: offering ±485 would pin the thumb at 150 and the
  // next drag would silently snap the guard back.
  const widened = Math.min(GUARD_MAX_BPS, Math.ceil(Math.abs(devBps) / 5) * 5 + 5);
  if (widened > maxDevBps) options.push({
    kind: "guard",
    title: `Widen guard to ±${widened} bps`,
    detail: `You would pay $${Math.round(awayUsd)} ${devBps > 0 ? "above" : "below"} fair`,
    maxDevBps: widened,
  });

  return { symbol: u.symbol, token: token.symbol, issuer: token.issuer, usd, payToken, devBps, maxDevBps, fairPx: fair.price, fillPx, awayUsd, options };
}

const bps = (px: number, fair: number) => Math.round(((px - fair) / fair) * 1e4);

/** null means "could not read", which is not the same as "holds nothing". */
async function stableBalance(owner: PublicKey, mint: string): Promise<number | null> {
  const ata = deriveAta(owner, new PublicKey(mint), TOKEN_PROGRAM);
  try {
    const r = await rpc().getTokenAccountBalance(ata);
    return Number(r.value.amount);
  } catch (e) {
    // An absent account genuinely is a zero balance; anything else is an RPC failure and
    // must not be reported to the user as an empty wallet.
    return /could not find account|not found/i.test(String(e)) ? 0 : null;
  }
}

export async function buildSwap(p: {
  underlying: Underlying;
  token: UniverseToken;
  usd: number;
  owner: string;
  maxDevBps: number;
  inputMint?: string;
}): Promise<SwapBuild> {
  const { underlying: u, token, usd, maxDevBps } = p;
  const payMint = p.inputMint ?? USDC_MINT;
  const pay = STABLES[payMint];
  if (!pay) throw new SwapRejected(`${payMint} is not an accepted input stablecoin`, 400);
  const owner = new PublicKey(p.owner);
  const fair = await getFairValue(u);
  if (fair.stale) throw new SwapRejected(`reference price for ${u.symbol} is stale (${fair.ageSec}s old); refusing to quote`);
  const amount = Math.round(usd * 10 ** pay.decimals);

  // A stablecoin is not exactly a dollar. Price the input leg too, or a depegged USDT would
  // silently shift every deviation we report and guard against.
  const payPriceUsd = (await jupiterPrices([payMint]).catch(() => ({}) as Record<string, JupPrice>))[payMint]?.usdPrice ?? 1;
  const usdValue = usd * payPriceUsd;

  // A refusal is the product working, so it carries what to do next rather than just a message.
  const check = async (outAmount: string) => {
    const shares = Number(outAmount) / 10 ** token.decimals;
    if (!(shares > 0)) throw new SwapRejected("route returned zero output");
    const fillPx = usdValue / shares;
    const devBps = bps(fillPx, fair.price);
    if (Math.abs(devBps) > maxDevBps) {
      throw new SwapRejected(
        `fill would be ${devBps > 0 ? "+" : ""}${devBps} bps from fair value (${fair.price.toFixed(2)}); your guard is ±${maxDevBps} bps`,
        409,
        await refusal({ u, token, usd, maxDevBps, fair, devBps, fillPx, payToken: pay.symbol }).catch(() => undefined),
      );
    }
    // Funding is checked only once the price is acceptable: a bad quote is the more useful
    // thing to report, and it is true whether or not the wallet happens to be funded.
    const held = await stableBalance(owner, payMint);
    if (held != null && held < amount) {
      throw new SwapRejected(`wallet holds ${(held / 10 ** pay.decimals).toFixed(2)} ${pay.symbol}, needs ${usd.toFixed(2)}`, 400);
    }
    return { shares, fillPx, devBps };
  };
  /** Quoted once per build so a receipt can say where the fill ranked, rather than guess later. */
  const routeSnapshot = async (chosenEff: number): Promise<RouteSnapshot[]> => {
    const jp = await jupiterPrices(u.tokens.map((t) => t.mint)).catch(() => ({}) as Record<string, JupPrice>);
    const rows = await Promise.all(
      u.tokens.map(async (t) => {
        if (t.mint === token.mint) return { token: t.symbol, issuer: t.issuer, mint: t.mint, effPx: chosenEff, devBps: bps(chosenEff, fair.price) };
        const v = await quoteVenue(t, [usd], usd, fair, jp[t.mint]).catch(() => null);
        const eff = v?.effPx[String(usd)];
        return eff != null ? { token: t.symbol, issuer: t.issuer, mint: t.mint, effPx: eff, devBps: bps(eff, fair.price) } : null;
      }),
    );
    return rows.filter((r): r is RouteSnapshot => !!r).sort((a, b) => a.effPx - b.effPx);
  };

  const quoteBase = {
    symbol: u.symbol,
    issuer: token.issuer,
    mint: token.mint,
    usd,
    payToken: pay.symbol,
    payMint,
    payPriceUsd,
    fairPx: fair.price,
    fairSource: fair.source,
    marketState: fair.marketState,
  };
  const labels = (plan: { swapInfo?: { label?: string } }[]) => [...new Set(plan.map((r) => r.swapInfo?.label).filter(Boolean) as string[])];

  const program = mainnetGuardProgram();
  const deployment = guardDeployment();
  const composable = token.issuer !== "ondo";
  let reason: string;
  if (!composable) reason = "This issuer's token only quotes through JupiterZ RFQ (market-maker signed), which cannot be composed with the on-chain guard.";
  else if (!fair.onchainAccount) reason = `No sponsored Pyth on-chain feed for ${u.symbol}; the on-chain guard has nothing to verify against.`;
  else if (!program)
    reason = deployment
      ? "fair_fill_guard is unaudited, so it runs on devnet only — this mainnet fill routes through Jupiter's audited programs and is checked against fair value before you sign."
      : "fair_fill_guard is not deployed yet; the fill is checked against fair value before you sign.";
  else reason = "Verified on-chain against Pyth in the same transaction.";

  if (composable) {
    let quote;
    try {
      quote = await swapQuote({ inputMint: payMint, outputMint: token.mint, amount, slippageBps: Math.min(maxDevBps, 100) });
    } catch (e) {
      if (!(e instanceof JupiterError && /NO_ROUTES/i.test(e.code))) throw e;
      reason = "No pool route for this size; falling back to Jupiter Ultra (client-side guard).";
    }
    if (quote) {
      const q = await check(quote.outAmount);
      const ixs = await swapInstructions({ quoteResponse: quote, userPublicKey: p.owner });
      const guarded = !!program && !!fair.onchainAccount;
      const instructions: TransactionInstruction[] = [...ixs.computeBudget, ...ixs.setup];
      let guard: SwapBuild["guard"];
      if (guarded && program && fair.onchainAccount) {
        const inMint = new PublicKey(payMint);
        const outMint = new PublicKey(token.mint);
        const inAta = deriveAta(owner, inMint, TOKEN_PROGRAM);
        const outAta = deriveAta(owner, outMint, new PublicKey(token.tokenProgram));
        const nonce = newNonce();
        const snapshotPda = deriveSnapshotPda(program, owner, outAta);
        const receiptPda = deriveReceiptPda(program, owner, outAta, nonce);
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
        routes: await routeSnapshot(q.fillPx).catch(() => []),
        quote: { ...quoteBase, ...q, priceImpactPct: Number(quote.priceImpactPct) || null, route: labels(quote.routePlan) },
      };
    }
  }

  const order = await ultraOrder({ inputMint: payMint, outputMint: token.mint, amount, taker: p.owner });
  if (!order.transaction) throw new SwapRejected("Jupiter Ultra returned no transaction for this order", 502);
  const q = await check(order.outAmount);
  return {
    mode: "ultra",
    tx: order.transaction,
    requestId: order.requestId,
    reason,
    routes: await routeSnapshot(q.fillPx).catch(() => []),
    quote: { ...quoteBase, ...q, priceImpactPct: order.priceImpactPct != null ? Number(order.priceImpactPct) : null, route: order.swapType === "rfq" ? ["JupiterZ RFQ"] : labels(order.routePlan ?? []) },
  };
}
