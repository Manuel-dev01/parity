import { NextResponse } from "next/server";
import { JupiterError, ultraExecute } from "@/lib/jupiter";

export const dynamic = "force-dynamic";

/** POST /api/v1/swap/execute { requestId, signedTx } — submits a signed Ultra order through Jupiter. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { requestId?: string; signedTx?: string };
  if (!body.requestId || !body.signedTx) return NextResponse.json({ error: "requestId and signedTx required" }, { status: 400 });
  try {
    const r = await ultraExecute({ requestId: body.requestId, signedTransaction: body.signedTx });
    if (r.status !== "Success") return NextResponse.json({ error: r.error || `Ultra execute failed (${r.code})`, signature: r.signature ?? null }, { status: 502 });
    return NextResponse.json({ signature: r.signature, inAmount: r.inputAmountResult ?? null, outAmount: r.outputAmountResult ?? null });
  } catch (e) {
    if (e instanceof JupiterError) return NextResponse.json({ error: `Jupiter: ${e.message}`, code: e.code }, { status: 502 });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
