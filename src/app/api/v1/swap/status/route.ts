import { NextResponse } from "next/server";
import { rpc } from "@/lib/pyth-onchain";

export const dynamic = "force-dynamic";

/** GET /api/v1/swap/status?sig=… — confirmation state of a submitted transaction. */
export async function GET(req: Request) {
  const sig = new URL(req.url).searchParams.get("sig");
  if (!sig) return NextResponse.json({ error: "sig required" }, { status: 400 });
  try {
    const { value } = await rpc().getSignatureStatuses([sig], { searchTransactionHistory: true });
    const s = value[0];
    if (!s) return NextResponse.json({ status: "pending" });
    if (s.err) return NextResponse.json({ status: "failed", err: JSON.stringify(s.err) });
    const level = s.confirmationStatus ?? "processed";
    return NextResponse.json({ status: level === "processed" ? "pending" : "confirmed", level, slot: s.slot });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
