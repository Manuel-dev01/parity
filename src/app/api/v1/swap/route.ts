import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getUnderlying } from "@/lib/universe";
import { buildSwap, SwapRejected } from "@/lib/execute";
import { JupiterError } from "@/lib/jupiter";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/swap  { symbol, mint, usd, owner, maxDevBps }
 * Builds one buy transaction for `owner` and returns it unsigned, with the mode
 * (guarded | plain | ultra), the quoted fill vs fair value, and why that mode was chosen.
 */
export async function POST(req: Request) {
  let body: { symbol?: string; mint?: string; usd?: number; owner?: string; maxDevBps?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const symbol = (body.symbol || "").toUpperCase();
  const u = getUnderlying(symbol);
  if (!u) return NextResponse.json({ error: `unknown symbol ${symbol}` }, { status: 404 });
  const token = u.tokens.find((t) => t.mint === body.mint);
  if (!token) return NextResponse.json({ error: `mint is not an issuer token for ${symbol}` }, { status: 400 });
  const usd = Number(body.usd);
  if (!(usd >= 1 && usd <= 100_000)) return NextResponse.json({ error: "usd must be between 1 and 100000" }, { status: 400 });
  const maxDevBps = Math.round(Number(body.maxDevBps ?? 50));
  if (!(maxDevBps >= 5 && maxDevBps <= 1000)) return NextResponse.json({ error: "maxDevBps must be between 5 and 1000" }, { status: 400 });
  let owner: string;
  try {
    owner = new PublicKey(body.owner || "").toBase58();
  } catch {
    return NextResponse.json({ error: "owner must be a valid public key" }, { status: 400 });
  }

  try {
    const built = await buildSwap({ underlying: u, token, usd, owner, maxDevBps });
    return NextResponse.json(built);
  } catch (e) {
    if (e instanceof SwapRejected) return NextResponse.json({ error: e.message, rejected: true }, { status: e.status });
    if (e instanceof JupiterError) return NextResponse.json({ error: `Jupiter: ${e.message}`, code: e.code }, { status: 502 });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
