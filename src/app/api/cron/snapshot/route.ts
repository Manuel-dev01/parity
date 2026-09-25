import { NextResponse } from "next/server";
import { liveBoard } from "@/lib/board";
import { dbConfigured, migrate, sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron target (see vercel.json). Records one row per issuer token for the top
 * multi-issuer names so the tape can show how premiums move through the session.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!dbConfigured) return NextResponse.json({ ok: false, reason: "DATABASE_URL not set" });

  await migrate();
  const rows = await liveBoard(60);
  const ts = new Date().toISOString();
  const values: unknown[] = [];
  const tuples: string[] = [];
  for (const r of rows) {
    for (const p of r.prints) {
      if (p.px == null) continue;
      const i = values.length;
      tuples.push(`($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6}, $${i + 7}, $${i + 8}, $${i + 9})`);
      values.push(ts, r.symbol, p.issuer, p.mint, p.px, r.ref, p.bps, p.liquidity, p.comparable);
    }
  }
  if (tuples.length) {
    await sql(`insert into snapshots (ts, symbol, issuer, mint, px, ref, bps, liquidity, comparable) values ${tuples.join(",")} on conflict do nothing`, values);
  }
  return NextResponse.json({ ok: true, ts, rows: tuples.length });
}
