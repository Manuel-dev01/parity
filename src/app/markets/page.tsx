import Link from "next/link";
import type { Metadata } from "next";
import { liveBoard } from "@/lib/board";
import { multiIssuer } from "@/lib/universe";
import { ISSUERS, ISSUER_ORDER } from "@/lib/issuers";
import { dbConfigured, sql } from "@/lib/db";
import { Sheet } from "@/components/broadsheet/Sheet";
import { Clock } from "@/components/broadsheet/Clock";
import { INK, bp, px as fmtPx, usd } from "@/components/broadsheet/fmt";
import { Dispersion, Sparkline } from "@/components/markets/Dispersion";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Markets — Parity" };

type Props = { searchParams: Promise<{ view?: string }> };
type Point = { symbol: string; ts: string; spread: number };

export default async function Markets({ searchParams }: Props) {
  const { view } = await searchParams;
  const isNow = view !== "history";
  const rows = await liveBoard(40).catch(() => []);
  const ranked = rows.filter((r) => r.spreadBps != null).sort((a, b) => (b.spreadBps ?? 0) - (a.spreadBps ?? 0));
  const top = ranked[0] ?? null;
  const tokenCount = rows.reduce((n, r) => n + r.prints.length, 0);

  // History is whatever the sampler has actually recorded. No synthetic series.
  let history: Point[] = [];
  let span: { first: string; last: string; n: number } | null = null;
  if (!isNow && dbConfigured) {
    history = await sql<Point>(
      `select symbol, ts, (max(bps) - min(bps)) as spread from snapshots
       where bps is not null and comparable is not false
       group by symbol, ts having count(*) > 1 order by ts`,
    ).catch(() => []);
    const meta = await sql<{ first: string; last: string; n: number }>(
      `select min(ts) as first, max(ts) as last, count(distinct ts)::int as n from snapshots`,
    ).catch(() => []);
    span = meta[0]?.n ? meta[0] : null;
  }
  const bySymbol = new Map<string, number[]>();
  for (const p of history) {
    if (p.spread == null) continue;
    bySymbol.set(p.symbol, [...(bySymbol.get(p.symbol) ?? []), Number(p.spread)]);
  }
  const series = [...bySymbol.entries()]
    .map(([symbol, values]) => ({ symbol, values, max: Math.max(...values), median: median(values) }))
    .sort((a, b) => b.max - a.max)
    .slice(0, 12);

  return (
    <Sheet dateline={`Markets · ${rows.length} stocks, ${tokenCount} tokens on Solana`} datelineRight={<Clock prefix="Live" />} active="markets">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px 48px", alignItems: "flex-end", padding: "clamp(24px,3.4cqw,44px) 0 24px" }}>
        <div style={{ flex: "1 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 className="serif" style={{ margin: 0, fontSize: "clamp(40px,5.8cqw,84px)", lineHeight: 0.95, letterSpacing: "-0.02em", textWrap: "balance" }}>
            {isNow
              ? top
                ? `${top.symbol} is the most mispriced stock on Solana this minute.`
                : "No stock is quoting across issuers right now."
              : "How the gaps have moved since Parity started watching."}
          </h1>
          <p style={{ margin: 0, fontSize: "clamp(18px,1.7cqw,22px)", lineHeight: 1.4, maxWidth: 640, textWrap: "pretty" }}>
            {isNow ? (
              top ? (
                <>
                  {top.spreadBps} bps between its cheapest and costliest token, about {usd(((top.spreadBps ?? 0) / 1e4) * 10_000)} on every $10,000. Same share,
                  different wrappers.
                </>
              ) : (
                <>Quotes return when at least one issuer&apos;s pool is routable.</>
              )
            ) : (
              <>Every spread Parity has sampled, from its own record. The window is as long as the sampler has been running, and no longer.</>
            )}
          </p>
        </div>
        <div style={{ display: "flex", border: "1px solid var(--ink)" }}>
          {[
            ["Now", "/markets", isNow],
            ["History", "/markets?view=history", !isNow],
          ].map(([label, href, active], i) => (
            <Link
              key={label as string}
              href={href as string}
              style={{
                padding: "10px 20px",
                borderLeft: i ? "1px solid var(--ink)" : undefined,
                background: active ? "var(--ink)" : "transparent",
                color: active ? "var(--paper)" : "var(--ink)",
                textDecoration: "none",
              }}
            >
              {label as string}
            </Link>
          ))}
        </div>
      </div>

      {isNow ? (
        <div style={{ borderTop: "1px solid var(--ink)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "8px 0", borderBottom: "1px solid var(--ink)", flexWrap: "wrap" }}>
            <span className="label">Ranked by spread between tokens</span>
            <span style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {ISSUER_ORDER.map((id) => (
                <span key={id} className="label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="dot" style={{ width: 9, height: 9, background: INK[id] }} />
                  {ISSUERS[id].short}
                </span>
              ))}
            </span>
          </div>

          {ranked.slice(0, 20).map((r) => (
            <Link
              key={r.symbol}
              href={`/s/${r.symbol}`}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "10px 28px",
                padding: "14px 0",
                borderBottom: "1px solid var(--rule)",
                color: "var(--ink)",
                textDecoration: "none",
              }}
            >
              <span style={{ flex: "0 0 150px" }}>
                <span className="display-mid" style={{ fontSize: 24, display: "block" }}>
                  {r.symbol}
                </span>
                <span style={{ fontSize: 14, fontStyle: "italic", color: "var(--muted)" }}>
                  {r.name} · <span className="num" style={{ fontStyle: "normal", fontSize: 12 }}>{fmtPx(r.ref)}</span>
                </span>
              </span>
              <Dispersion prints={r.prints.filter((p) => p.comparable).map((p) => ({ issuer: p.issuer, bps: p.bps }))} />
              <span style={{ flex: "0 0 auto", display: "flex", gap: 28, alignItems: "baseline" }}>
                <span style={{ minWidth: 92, textAlign: "right" }}>
                  <span className="serif" style={{ fontSize: 30, display: "block" }}>
                    {r.spreadBps} bps
                  </span>
                  <span style={{ fontSize: 13, fontStyle: "italic", color: "var(--muted)" }}>{usd(((r.spreadBps ?? 0) / 1e4) * 10_000)} per $10k</span>
                </span>
                <span style={{ minWidth: 110 }}>
                  <span className="label">Lowest quote</span>
                  <span style={{ display: "block", fontWeight: 500 }}>
                    {r.prints.find((p) => p.issuer === r.cheapest)?.symbol ?? "—"}
                  </span>
                </span>
                <span style={{ color: "var(--vermilion)" }}>→</span>
              </span>
            </Link>
          ))}

          <p style={{ fontSize: 14, fontStyle: "italic", color: "var(--muted)", padding: "10px 0 40px" }}>
            Last prints measured from the underlying reference price (the vertical rule), and only for tokens with a real pool behind them. Ondo quotes by RFQ
            and carries almost no pool, so its last price cannot be compared this way — open a stock to quote every issuer at your size. The best token at your
            size can differ once impact is included.
          </p>
        </div>
      ) : (
        <div style={{ borderTop: "1px solid var(--ink)", paddingBottom: 40 }}>
          {series.length === 0 ? (
            <p style={{ fontSize: 18, lineHeight: 1.45, padding: "28px 0", maxWidth: 640 }}>
              Nothing sampled yet. The record starts when the snapshot job first runs, and this page will only ever show what it actually recorded.
            </p>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", columnGap: 32 }}>
                {series.map((s) => (
                  <div key={s.symbol} style={{ padding: "16px 0", borderBottom: "1px solid var(--rule)", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                      <Link href={`/s/${s.symbol}`} className="display-mid" style={{ fontSize: 22, color: "var(--ink)" }}>
                        {s.symbol}
                      </Link>
                      <span className="num" style={{ fontSize: 12, color: "var(--muted)" }}>
                        median {Math.round(s.median)} bps · max {Math.round(s.max)} bps
                      </span>
                    </div>
                    {s.values.length > 1 ? (
                      <Sparkline values={s.values} />
                    ) : (
                      <p style={{ margin: 0, fontSize: 14, fontStyle: "italic", color: "var(--muted)" }}>
                        One sample so far — a line needs at least two.
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 14, fontStyle: "italic", color: "var(--muted)", paddingTop: 16 }}>
                <span style={{ fontStyle: "normal", fontWeight: 500 }}>Fig. 2</span> Spread between each stock&apos;s cheapest and costliest token, one point per
                sample. Shaded: under 50 bps.{" "}
                {span && (
                  <>
                    {span.n} sample{span.n === 1 ? "" : "s"} between {new Date(span.first).toISOString().slice(0, 16).replace("T", " ")} and{" "}
                    {new Date(span.last).toISOString().slice(0, 16).replace("T", " ")} UTC.
                  </>
                )}
              </p>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
