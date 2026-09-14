import Link from "next/link";
import { liveBoard } from "@/lib/board";
import { dbConfigured, sql } from "@/lib/db";
import { ISSUERS, ISSUER_ORDER } from "@/lib/issuers";
import { IssuerChip } from "@/components/IssuerChip";
import { Bps, usd } from "@/components/Bps";
import type { IssuerId } from "@/lib/types";

export const revalidate = 30;

type Point = { symbol: string; issuer: IssuerId; ts: string; bps: number | null };

export default async function Tape() {
  const rows = await liveBoard(80);
  const top = rows.filter((r) => r.spreadBps != null).slice(0, 12);
  let history: Point[] = [];
  let stats: { symbol: string; issuer: IssuerId; max_bps: number; min_bps: number; n: number }[] = [];
  if (dbConfigured && top.length) {
    const syms = top.map((r) => r.symbol);
    history = await sql<Point>(
      `select symbol, issuer, ts, bps from snapshots where ts > now() - interval '24 hours' and symbol = any($1) order by ts`,
      [syms],
    ).catch(() => []);
    stats = await sql<(typeof stats)[number]>(
      `select symbol, issuer, max(bps) as max_bps, min(bps) as min_bps, count(*)::int as n from snapshots where ts > now() - interval '24 hours' and symbol = any($1) group by 1,2`,
      [syms],
    ).catch(() => []);
  }

  return (
    <div className="pt-10 sm:pt-14">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-accent mb-2">Divergence tape</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Where the same share disagrees with itself</h1>
          <p className="mt-3 text-muted max-w-2xl">
            Premium or discount of each issuer&apos;s token to the underlying reference, sampled every minute. Off-hours spreads are the
            widest, because the underlying is closed and arbitrage has to wait for the open.
          </p>
        </div>
        <span className="text-xs text-dim">{dbConfigured ? "24h history" : "live only — history starts when the snapshotter is connected"}</span>
      </div>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {top.map((r) => {
          const series = ISSUER_ORDER.filter((i) => r.prints.some((p) => p.issuer === i && p.px != null)).map((i) => ({
            issuer: i,
            points: history.filter((h) => h.symbol === r.symbol && h.issuer === i && h.bps != null).map((h) => h.bps as number),
            now: r.prints.filter((p) => p.issuer === i).sort((a, b) => b.liquidity - a.liquidity)[0]?.bps ?? null,
            st: stats.find((s) => s.symbol === r.symbol && s.issuer === i),
          }));
          return (
            <div key={r.symbol} className="card p-5">
              <div className="flex items-start justify-between">
                <Link href={`/s/${r.symbol}`} className="flex flex-col">
                  <span className="num text-xl font-semibold">{r.symbol}</span>
                  <span className="text-xs text-muted">{r.name}</span>
                </Link>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-dim">spread now</div>
                  <Bps v={r.spreadBps} className="text-lg font-semibold" />
                </div>
              </div>
              <Spark series={series} />
              <div className="mt-3 space-y-1.5">
                {series.map((s) => (
                  <div key={s.issuer} className="flex items-center justify-between text-xs">
                    <IssuerChip id={s.issuer} />
                    <span className="flex items-center gap-4">
                      {s.st && (
                        <span className="text-dim num hidden sm:inline">
                          24h {s.st.min_bps > 0 ? "+" : ""}
                          {s.st.min_bps} … {s.st.max_bps > 0 ? "+" : ""}
                          {s.st.max_bps} bps
                        </span>
                      )}
                      <Bps v={s.now} />
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[11px] text-dim">reference {usd(r.ref)}</div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Spark({ series }: { series: { issuer: IssuerId; points: number[]; now: number | null }[] }) {
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) {
    return <div className="mt-4 h-16 rounded-lg bg-surface-2/50 flex items-center justify-center text-[11px] text-dim">collecting history…</div>;
  }
  const W = 320, H = 64, pad = 4;
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo || 1)) * (H - pad * 2);
  const zero = y(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full h-16" preserveAspectRatio="none">
      <line x1={0} x2={W} y1={zero} y2={zero} stroke="currentColor" className="text-border-2" strokeDasharray="2 3" />
      {series.map((s) => {
        if (s.points.length < 2) return null;
        const step = W / (s.points.length - 1);
        const d = s.points.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
        return <path key={s.issuer} d={d} fill="none" stroke={ISSUERS[s.issuer].color} strokeWidth={1.5} strokeLinejoin="round" />;
      })}
    </svg>
  );
}
