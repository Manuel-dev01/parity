import { NextResponse } from "next/server";
import { multiIssuer, searchUnderlyings, universeBuiltAt } from "@/lib/universe";

/** GET /api/v1/universe?q=NV  — every tokenized US stock on Solana, grouped by underlying. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const list = q != null ? searchUnderlyings(q, Number(searchParams.get("limit") || 12)) : multiIssuer(Number(searchParams.get("minIssuers") || 2));
  return NextResponse.json({ builtAt: universeBuiltAt, count: list.length, underlyings: list });
}
