import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { rpc } from "@/lib/pyth-onchain";

export const dynamic = "force-dynamic";

/** GET /api/v1/swap/status?sig=… — confirmation state of a submitted transaction. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sig = url.searchParams.get("sig");
  if (!sig) return NextResponse.json({ error: "sig required" }, { status: 400 });
  try {
    const { value } = await rpc().getSignatureStatuses([sig], { searchTransactionHistory: true });
    const s = value[0];
    if (!s) return NextResponse.json({ status: "pending" });
    if (s.err) return NextResponse.json({ status: "failed", err: JSON.stringify(s.err) });
    const level = s.confirmationStatus ?? "processed";
    if (level === "processed") return NextResponse.json({ status: "pending", level, slot: s.slot });
    // Report what actually arrived, so the receipt records the settled fill rather than the quote.
    let received: number | null = null;
    const mint = url.searchParams.get("mint");
    const owner = url.searchParams.get("owner");
    if (mint && owner && isPubkey(mint) && isPubkey(owner)) {
      try {
        const tx = await rpc().getTransaction(sig, { maxSupportedTransactionVersion: 0 });
        type Bal = { mint: string; owner?: string; uiTokenAmount: { uiAmount: number | null } };
        const pick = (rows: Bal[] | null | undefined) => rows?.find((b) => b.mint === mint && b.owner === owner)?.uiTokenAmount.uiAmount ?? 0;
        if (tx?.meta) received = Math.max(0, pick(tx.meta.postTokenBalances) - pick(tx.meta.preTokenBalances));
      } catch {
        received = null; // fall back to the quoted amount rather than blocking the fill
      }
    }
    return NextResponse.json({ status: "confirmed", level, slot: s.slot, received });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

const isPubkey = (s: string) => {
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
};
