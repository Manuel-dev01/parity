"use client";
import { useEffect, useState } from "react";
import type { ParityQuote, Underlying, VenueQuote } from "@/lib/types";
import { ISSUERS } from "@/lib/issuers";
import { MARKET_LABEL } from "@/lib/market";
import { IssuerChip } from "./IssuerChip";
import { Bps, usd as fmt, compact } from "./Bps";
import { TradePanel } from "./TradePanel";

const SIZES = [100, 1_000, 10_000];

export function Ticker({ underlying, initial, usd: initialUsd }: { underlying: Underlying; initial: ParityQuote | null; usd: number }) {
  const [usd, setUsd] = useState(initialUsd);
  const [q, setQ] = useState<ParityQuote | null>(initial);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(initial ? null : "Could not load quotes");

  useEffect(() => {
    let dead = false;
    const load = async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/v1/quote?symbol=${underlying.symbol}&usd=${usd}`, { cache: "no-store" });
        const j = await r.json();
        if (dead) return;
        if (!r.ok) throw new Error(j.error || r.statusText);
        setQ(j);
        setErr(null);
      } catch (e) {
        if (!dead) setErr(String(e));
      } finally {
        if (!dead) setLoading(false);
      }
    };
    if (!(initial && usd === initialUsd && q === initial)) load();
    const t = setInterval(load, 12_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usd, underlying.symbol]);

  const fair = q?.fair;
  const best = q?.venues.find((v) => v.token.mint === q.best) ?? null;

  return (
    <div className="pt-8 sm:pt-12">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="num text-4xl sm:text-5xl font-semibold tracking-tight">{underlying.symbol}</h1>
            <span className="text-muted text-lg">{underlying.name}</span>
          </div>
          <div className="mt-3 flex gap-1.5 flex-wrap">
            {underlying.issuers.map((i) => (
              <IssuerChip key={i} id={i} size="md" />
            ))}
          </div>
        </div>
        <div className="card px-5 py-4 min-w-[260px]">
          <div className="flex items-center justify-between gap-6">
            <span className="text-xs uppercase tracking-wider text-dim">Fair value</span>
            {fair && (
              <span className="text-[11px] text-muted flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${fair.marketState === "regular" ? "bg-accent pulse" : fair.marketState === "closed" ? "bg-dim" : "bg-warn"}`} />
                {MARKET_LABEL[fair.marketState]}
              </span>
            )}
          </div>
          <div className="num text-3xl font-semibold mt-1">{fmt(fair?.price)}</div>
          {fair && (
            <div className="text-xs text-muted mt-1 flex flex-wrap gap-x-3">
              <span>
                {fair.source}
                {fair.conf > 0 && <span className="num"> ±{fair.conf.toFixed(2)}</span>}
              </span>
              <span className={fair.stale ? "text-warn" : ""}>{age(fair.ageSec)}</span>
            </div>
          )}
        </div>
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Executable price by issuer</h2>
            <p className="text-sm text-muted">Live Jupiter quotes for a market buy of this size, including price impact and routing.</p>
          </div>
          <div className="flex items-center gap-1 card p-1">
            {SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setUsd(s)}
                className={`num text-sm px-3 py-1.5 rounded-lg transition ${usd === s ? "bg-surface-2 text-text" : "text-muted hover:text-text"}`}
              >
                {compact(s)}
              </button>
            ))}
          </div>
        </div>

        {err && !q && <div className="card p-6 text-danger text-sm">{err}</div>}

        <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${loading ? "opacity-70" : ""} transition`}>
          {q?.venues.map((v) => (
            <VenueCard key={v.token.mint} v={v} usd={usd} isBest={v.token.mint === q.best} isWorst={v.token.mint === q.worst && q.venues.length > 1} fair={q.fair.price} />
          ))}
        </div>

        {q && q.spreadBps != null && best && (
          <p className="mt-4 text-sm text-muted">
            Buying {compact(usd)} via <span className="text-text">{best.token.symbol}</span> instead of the most expensive route gets you{" "}
            <span className="num text-accent">{fmt(q.savedUsd)}</span> more stock — a <Bps v={q.spreadBps} /> spread between issuers right now.
          </p>
        )}
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_360px]">
        <IssuerFacts underlying={underlying} />
        <TradePanel underlying={underlying} quote={q} usd={usd} />
      </section>
    </div>
  );
}

function age(sec: number) {
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h ago`;
  return `${(sec / 86400).toFixed(1)}d ago`;
}

function VenueCard({ v, usd, isBest, isWorst, fair }: { v: VenueQuote; usd: number; isBest: boolean; isWorst: boolean; fair: number }) {
  const eff = v.effPx[String(usd)];
  const i = ISSUERS[v.token.issuer];
  return (
    <div className={`card p-5 relative ${isBest ? "glow-best" : ""}`}>
      {isBest && <span className="absolute -top-2.5 left-4 text-[10px] uppercase tracking-wider bg-accent text-black rounded-full px-2 py-0.5 font-semibold">Best route</span>}
      <div className="flex items-center justify-between">
        <IssuerChip id={v.token.issuer} size="md" />
        <span className="num text-xs text-dim">{v.token.symbol}</span>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className={`num text-2xl font-semibold ${isWorst ? "text-danger" : isBest ? "text-accent" : ""}`}>{eff != null ? fmt(eff) : "—"}</span>
        <Bps v={v.devBps} className="text-sm" />
      </div>
      <div className="text-xs text-muted mt-1">
        {eff != null ? `${(usd / eff).toFixed(4)} shares for ${compact(usd)}` : v.error ? `Not routable: ${v.error}` : "No route"}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-xs">
        <dt className="text-dim">Last print</dt>
        <dd className="num text-right">{fmt(v.lastPx)}</dd>
        <dt className="text-dim">vs fair</dt>
        <dd className="text-right">
          <Bps v={v.lastPx != null ? Math.round(((v.lastPx - fair) / fair) * 1e4) : null} />
        </dd>
        <dt className="text-dim">Pool depth</dt>
        <dd className="num text-right">{compact(v.token.liquidity)}</dd>
        <dt className="text-dim">Price impact</dt>
        <dd className="num text-right">{v.priceImpactPct != null ? `${(v.priceImpactPct * 100).toFixed(3)}%` : "—"}</dd>
        <dt className="text-dim">Route</dt>
        <dd className="text-right truncate" title={v.route.join(" → ")}>
          {v.swapType === "rfq" ? "RFQ (market maker)" : v.route.slice(0, 2).join(" → ") || "—"}
          {v.gasless && <span className="ml-1 text-accent">gasless</span>}
        </dd>
        <dt className="text-dim">Holders</dt>
        <dd className="num text-right">{v.token.holders.toLocaleString()}</dd>
      </dl>
      <div className="mt-4 pt-3 border-t border-border text-[11px] text-muted leading-relaxed">
        <span style={{ color: i.color }}>{i.name}</span> · {i.redemption}
      </div>
    </div>
  );
}

function IssuerFacts({ underlying }: { underlying: Underlying }) {
  const rows: [string, (i: (typeof ISSUERS)[keyof typeof ISSUERS]) => string][] = [
    ["Issuer", (i) => i.issuerEntity],
    ["Backing", (i) => i.backing],
    ["Redemption", (i) => i.redemption],
    ["Dividends", (i) => i.dividends],
    ["Liquidity", (i) => i.liquidity],
  ];
  return (
    <div className="card overflow-x-auto">
      <div className="px-5 pt-5">
        <h3 className="font-semibold tracking-tight">What you actually hold</h3>
        <p className="text-sm text-muted mt-1">Same underlying share, different wrapper. Facts from each issuer&apos;s own documentation.</p>
      </div>
      <table className="w-full text-sm mt-4">
        <thead>
          <tr className="text-xs text-dim border-b border-border">
            <th className="text-left font-medium px-5 py-2 w-28"></th>
            {underlying.issuers.map((id) => (
              <th key={id} className="text-left font-medium px-3 py-2">
                <IssuerChip id={id} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, get]) => (
            <tr key={label} className="border-b border-border/60 last:border-0 align-top">
              <td className="px-5 py-2.5 text-dim text-xs uppercase tracking-wider">{label}</td>
              {underlying.issuers.map((id) => (
                <td key={id} className="px-3 py-2.5 text-muted text-xs leading-relaxed">
                  {get(ISSUERS[id])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
