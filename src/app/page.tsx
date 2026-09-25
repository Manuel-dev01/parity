import Link from "next/link";
import { Bleed, Sheet } from "@/components/broadsheet/Sheet";
import { Clock } from "@/components/broadsheet/Clock";
import { Figure, bp, spreadOf, usd } from "@/components/broadsheet/fmt";
import { Hero, type HeroToken } from "@/components/landing/Hero";
import { Marquee } from "@/components/landing/Marquee";
import { Fig1 } from "@/components/landing/Fig1";
import { liveBoard } from "@/lib/board";
import { ISSUERS } from "@/lib/issuers";
import { dbConfigured, sql } from "@/lib/db";
import type { FillRow } from "@/app/api/v1/fills/route";

export const dynamic = "force-dynamic";

const STEPS: [string, string, string][] = [
  ["01", "Fair value", "The price of the underlying share, from an on-chain oracle. The black outline in the print above."],
  [
    "02",
    "Your real price",
    "What each token costs at your size, including impact. The cheapest at $1,000 is often not the cheapest at $50,000.",
  ],
  ["03", "A guard you set", "If no token fills close enough to fair, Parity doesn't build the trade, and shows you what it would have cost."],
  ["04", "A public receipt", "Every fill is published: price, fair value at that moment, and which protection applied."],
];

export default async function Landing() {
  const rows = await liveBoard(40).catch(() => []);
  const ranked = rows.filter((r) => r.spreadBps != null).sort((a, b) => (b.spreadBps ?? 0) - (a.spreadBps ?? 0));
  // Prefer a share whose inks can all be placed honestly: three comparable pool prints if
  // any exist, otherwise the most mispriced comparable name.
  const feature = ranked.find((r) => r.prints.filter((p) => p.comparable).length >= 3) ?? ranked[0] ?? null;
  const heroTokens: HeroToken[] = feature
    ? feature.prints.filter((p) => p.comparable).map((p) => ({ issuer: p.issuer, token: p.symbol, bps: p.bps }))
    : [];
  const fills = dbConfigured ? await sql<FillRow>(`select * from fills order by ts desc limit 5`).catch(() => []) : [];

  return (
    <Sheet dateline="Live price record · tokenized US stocks on Solana" datelineRight={<Clock withDate />}>
      {feature && <Hero symbol={feature.symbol} initial={heroTokens} />}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "24px 56px", alignItems: "flex-end", padding: "clamp(32px,4cqw,56px) 0" }}>
        <h1 className="serif" style={{ flex: "1 1 560px", margin: 0, fontSize: "clamp(52px,7.6cqw,116px)", lineHeight: 0.9, letterSpacing: "-0.025em", textWrap: "balance" }}>
          One share, printed three times.{" "}
          <span style={{ fontStyle: "italic", color: "var(--vermilion)" }}>None of them line up.</span>
        </h1>
        <div style={{ flex: "0 1 380px", display: "flex", flexDirection: "column", gap: 18 }}>
          <p style={{ margin: 0, fontSize: 19, lineHeight: 1.4 }}>
            {feature?.name ?? "These"} tokens on Solana are <Figure>{feature?.spreadBps ?? "—"} bps</Figure> apart right now. Parity measures each against the
            fair price, shows what it really costs at your size, and buys the closest in one transaction.
          </p>
          <Link
            href={feature ? `/s/${feature.symbol}` : "/markets"}
            style={{ display: "flex", border: "1px solid var(--ink)", maxWidth: 380, color: "var(--ink)", textDecoration: "none" }}
          >
            <span className="num" style={{ flex: 1, height: 50, display: "flex", alignItems: "center", padding: "0 14px", fontSize: 14, color: "var(--muted)" }}>
              {feature?.symbol ?? "NVDA"}
            </span>
            <span style={{ display: "flex", alignItems: "center", padding: "0 22px", background: "var(--vermilion)", color: "var(--on-vermilion)" }}>Price it →</span>
          </Link>
        </div>
      </div>

      <Bleed>
        <Marquee items={ranked.slice(0, 18).map((r) => ({ symbol: r.symbol, spreadBps: r.spreadBps as number }))} />
      </Bleed>

      {feature && <Fig1 symbol={feature.symbol} initial={heroTokens} />}

      <div style={{ padding: "clamp(48px,6cqw,96px) 0", display: "flex", flexDirection: "column", gap: "clamp(32px,4cqw,56px)", borderBottom: "3px double var(--ink)" }}>
        <Stat a="−479" b="+34" caption={<>Basis points from fair, NVDA on two issuers, <i>within the same minute.</i></>} />
        <Stat a="$122" b="$176" caption={<>One SpaceX share after listing, <i>depending on which token you bought.</i></>} />
      </div>

      <div style={{ padding: "clamp(48px,6cqw,96px) 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px 24px", flexWrap: "wrap" }}>
          <h2 className="serif" style={{ margin: 0, fontSize: "clamp(30px,3cqw,40px)" }}>
            How Parity lines them up
          </h2>
          <Link href="/methodology" className="num" style={{ fontSize: 12, color: "var(--muted)" }}>
            Methodology →
          </Link>
        </div>
        {STEPS.map(([n, title, body]) => (
          <div
            key={n}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(48px,110px) minmax(0,1fr) minmax(0,1.1fr)",
              gap: "8px 32px",
              padding: "24px 0",
              borderTop: "1px solid var(--ink)",
              alignItems: "baseline",
            }}
          >
            <span className="num" style={{ fontSize: 13, color: "var(--vermilion)" }}>
              {n}
            </span>
            <span className="display-mid" style={{ fontSize: "clamp(24px,2.8cqw,38px)", lineHeight: 1.05, letterSpacing: "-0.03em" }}>
              {title}
            </span>
            <span style={{ fontSize: 18, lineHeight: 1.45 }}>{body}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 40, borderTop: "3px double var(--ink)", padding: "28px 0 48px" }}>
        <div style={{ flex: "2 1 460px", minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, borderBottom: "1px solid var(--ink)", paddingBottom: 6 }}>
            <h2 className="serif" style={{ margin: 0, fontSize: 30 }}>
              Spreads, this minute
            </h2>
            <Link href="/markets" style={{ fontSize: 14 }}>
              All markets
            </Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", columnGap: 32 }}>
            {ranked.slice(0, 8).map((r) => (
              <Link
                key={r.symbol}
                href={`/s/${r.symbol}`}
                className="num"
                style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "8px 0", fontSize: 14, color: "var(--ink)" }}
              >
                <span style={{ fontWeight: 500, minWidth: 56 }}>{r.symbol}</span>
                <span style={{ color: "var(--muted)" }}>{r.prints.length} tokens</span>
                <span style={{ flex: 1, borderBottom: "1px dotted var(--leader)", transform: "translateY(-4px)" }} />
                <span>{r.spreadBps} bps</span>
              </Link>
            ))}
          </div>
        </div>

        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <div style={{ borderBottom: "1px solid var(--ink)", paddingBottom: 6 }}>
            <h2 className="serif" style={{ margin: 0, fontSize: 30 }}>
              Receipts
            </h2>
          </div>
          {fills.length === 0 ? (
            <p style={{ fontSize: 15, fontStyle: "italic", color: "var(--muted)", paddingTop: 10 }}>
              No fills recorded yet. Every fill Parity routes is published here.
            </p>
          ) : (
            fills.map((f) => (
              <div key={f.sig} style={{ padding: "8px 0", borderBottom: "1px solid var(--rule-light)", fontSize: 15, lineHeight: 1.35 }}>
                <span className="num" style={{ fontSize: 12, color: "var(--muted)" }}>
                  {new Date(f.ts).toISOString().slice(11, 19)}
                </span>
                <br />
                {usd(f.usd)} of <span style={{ fontWeight: 500 }}>{f.symbol}{ISSUERS[f.issuer as keyof typeof ISSUERS]?.suffix ?? ""}</span>, filled <span className="num" style={{ fontSize: 13 }}>{bp(f.dev_bps)}</span> from fair.{" "}
                <span style={{ fontStyle: "italic", color: "var(--muted)" }}>{f.guarded ? "Enforced" : "Checked"}</span>.
              </div>
            ))
          )}
          <Link href="/receipts" style={{ fontSize: 14, display: "inline-block", paddingTop: 10 }}>
            All receipts →
          </Link>
        </div>
      </div>
    </Sheet>
  );
}

function Stat({ a, b, caption }: { a: string; b: string; caption: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 36px", alignItems: "baseline" }}>
      <span className="display" style={{ fontSize: "clamp(56px,10cqw,150px)", lineHeight: 0.9, letterSpacing: "-0.05em" }}>
        {a}
      </span>
      <span className="display" style={{ fontSize: "clamp(56px,10cqw,150px)", lineHeight: 0.9, letterSpacing: "-0.05em", color: "var(--ghost)" }}>
        {b}
      </span>
      <span style={{ flex: "1 1 240px", maxWidth: 320, fontSize: 19, lineHeight: 1.35 }}>{caption}</span>
    </div>
  );
}
