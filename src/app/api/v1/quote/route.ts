import { NextResponse } from "next/server";
import { getUnderlying } from "@/lib/universe";
import { parityQuote } from "@/lib/venues";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/quote?symbol=NVDA&usd=1000
 * Best-execution quote for a US stock across every Solana issuer, with fair value.
 * Public, keyless, meant for agents and other builders as much as for the UI.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").toUpperCase();
  const usd = Math.min(Math.max(Number(searchParams.get("usd") || 1000), 1), 1_000_000);
  const u = getUnderlying(symbol);
  if (!u) return NextResponse.json({ error: `unknown symbol ${symbol}` }, { status: 404 });
  try {
    const q = await parityQuote(u, usd);
    return NextResponse.json(q, { headers: { "cache-control": "public, max-age=5, stale-while-revalidate=15" } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
