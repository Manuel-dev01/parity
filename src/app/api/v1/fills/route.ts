import { NextResponse } from "next/server";
import { dbConfigured, sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export interface FillRow {
  sig: string;
  ts: string;
  wallet: string;
  symbol: string;
  issuer: string;
  mint: string;
  usd: number;
  shares: number;
  fill_px: number;
  fair_px: number;
  dev_bps: number;
  saved_usd: number | null;
  guarded: boolean;
  receipt: string | null;
  /** every issuer's executable price at the moment of the fill */
  routes: { token: string; issuer: string; mint: string; effPx: number; devBps: number }[] | null;
}

/** Where the bought token ranked among the share's tokens, by executable price. */
export function rankOf(row: Pick<FillRow, "mint" | "routes">): { rank: number; of: number } | null {
  if (!row.routes?.length) return null;
  const sorted = [...row.routes].sort((a, b) => a.effPx - b.effPx);
  const i = sorted.findIndex((r) => r.mint === row.mint);
  return i < 0 ? null : { rank: i + 1, of: sorted.length };
}

export const rankLabel = (r: { rank: number; of: number }) =>
  `${r.rank === 1 ? "Best" : r.rank === 2 ? "2nd" : r.rank === 3 ? "3rd" : `${r.rank}th`} of ${r.of}`;

/** GET /api/v1/fills?symbol=&limit= — recent fills executed through Parity. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol")?.toUpperCase();
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 50), 1), 200);
  const rows = symbol
    ? await sql<FillRow>(`select * from fills where symbol = $1 order by ts desc limit $2`, [symbol, limit])
    : await sql<FillRow>(`select * from fills order by ts desc limit $1`, [limit]);
  return NextResponse.json({ configured: dbConfigured, fills: rows });
}

/** POST /api/v1/fills — record a confirmed fill. No-op (200, recorded:false) when no DATABASE_URL. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Partial<Record<keyof FillRow | "fillPx" | "fairPx" | "devBps" | "savedUsd", unknown>> | null;
  if (!b || typeof b.sig !== "string" || typeof b.wallet !== "string" || typeof b.symbol !== "string" || typeof b.mint !== "string") {
    return NextResponse.json({ error: "sig, wallet, symbol, mint required" }, { status: 400 });
  }
  if (!dbConfigured) return NextResponse.json({ recorded: false });
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  try {
    await sql(
      `insert into fills (sig, wallet, symbol, issuer, mint, usd, shares, fill_px, fair_px, dev_bps, saved_usd, guarded, receipt, routes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict (sig) do nothing`,
      [
        b.sig,
        b.wallet,
        b.symbol,
        String(b.issuer ?? ""),
        b.mint,
        num(b.usd) ?? 0,
        num(b.shares) ?? 0,
        num(b.fillPx) ?? 0,
        num(b.fairPx) ?? 0,
        Math.round(num(b.devBps) ?? 0),
        num(b.savedUsd),
        b.guarded === true,
        typeof b.receipt === "string" ? b.receipt : null,
        Array.isArray(b.routes) ? JSON.stringify(b.routes) : null,
      ],
    );
    return NextResponse.json({ recorded: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
