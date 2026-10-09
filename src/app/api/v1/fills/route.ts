import { NextResponse } from "next/server";
import { FillNotVerified, verifyFill, type VerifiedFill } from "@/lib/verify-fill";
import { getUnderlying } from "@/lib/universe";
import { getFairValue } from "@/lib/fairvalue";
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

/**
 * POST /api/v1/fills — record a confirmed fill.
 *
 * The caller supplies a signature and nothing that matters. Everything written to the ledger
 * is read back off the chain by `verifyFill`: who bought, which token, how many, what they
 * paid, and therefore what it really cost. A signature that does not exist, failed, or does
 * not describe a buy in Parity's universe is refused.
 *
 * This is the difference between a public ledger and a public guestbook. Before, any caller
 * could POST a fabricated fill and it would appear on /receipts as evidence.
 *
 * Fair value is the one number not on the chain, so it is fetched here, at record time, from
 * the same oracle path the quote used — seconds after the fill confirms. The caller's own
 * figure is accepted only as a fallback when that lookup fails, and the receipt says which.
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Partial<Record<string, unknown>> | null;
  if (!b || typeof b.sig !== "string") return NextResponse.json({ error: "sig required" }, { status: 400 });
  if (!dbConfigured) return NextResponse.json({ recorded: false });

  let fill: VerifiedFill;
  try {
    fill = await verifyFill(b.sig);
  } catch (e) {
    if (e instanceof FillNotVerified) return NextResponse.json({ error: e.message, recorded: false }, { status: e.status });
    return NextResponse.json({ error: String(e), recorded: false }, { status: 502 });
  }

  // Fair value at record time, from the oracle — not from the caller. This is only a fair
  // stand-in for fair value *at the fill* because fills are recorded seconds after they
  // confirm. For a signature submitted long afterwards it would not be, so we do not pretend.
  const ageSec = fill.blockTime ? Math.max(0, Math.floor(Date.now() / 1000 - fill.blockTime)) : null;
  const fresh = ageSec == null || ageSec < 600;
  let fairPx: number | null = null;
  let fairSource: string | null = null;
  if (fresh) {
    try {
      const u = getUnderlying(fill.symbol);
      if (u) {
        const fv = await getFairValue(u);
        if (fv?.price) {
          fairPx = fv.price;
          fairSource = fv.source;
        }
      }
    } catch {
      // fall through to the caller's figure below
    }
  }
  const clientFair = typeof b.fairPx === "number" && Number.isFinite(b.fairPx) && b.fairPx > 0 ? b.fairPx : null;
  if (fairPx == null && clientFair != null) {
    fairPx = clientFair;
    fairSource = fresh ? "reported-by-client" : "reported-by-client (transaction not recent)";
  }
  const devBps = fairPx ? Math.round(((fill.fillPx - fairPx) / fairPx) * 1e4) : 0;

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  try {
    await sql(
      `insert into fills (sig, wallet, symbol, issuer, mint, usd, shares, fill_px, fair_px, dev_bps, saved_usd, guarded, receipt, routes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict (sig) do nothing`,
      [
        fill.sig,
        fill.wallet,
        fill.symbol,
        fill.issuer,
        fill.mint,
        fill.usd,
        fill.shares,
        fill.fillPx,
        fairPx ?? 0,
        devBps,
        num(b.savedUsd),
        b.guarded === true,
        typeof b.receipt === "string" ? b.receipt : null,
        Array.isArray(b.routes) ? JSON.stringify(b.routes) : null,
      ],
    );
    return NextResponse.json({
      recorded: true,
      verified: { wallet: fill.wallet, symbol: fill.symbol, shares: fill.shares, usd: fill.usd, fillPx: fill.fillPx },
      fairPx,
      fairSource,
      devBps,
      ageSec,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
