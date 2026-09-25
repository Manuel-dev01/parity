"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ParityQuote, Underlying, VenueQuote } from "@/lib/types";
import { ISSUERS } from "@/lib/issuers";
import { MARKET_LABEL } from "@/lib/market";
import { INK, bp, dep, px as fmtPx, usd } from "../broadsheet/fmt";
import { NumberLine } from "./NumberLine";
import { SourcePopover, type Source } from "./SourcePopover";
import { OrderSlip } from "./OrderSlip";

const SIZES = [1000, 10_000, 25_000, 100_000];
const RANK = ["1st", "2nd", "3rd"];

export function Ticker({
  underlying,
  initial,
  guardCluster,
  size = 1000,
}: {
  underlying: Underlying;
  initial: ParityQuote | null;
  guardCluster: "devnet" | "mainnet" | null;
  size?: number;
}) {
  const [amount, setAmount] = useState(size);
  const [guard, setGuard] = useState(50);
  const [pay, setPay] = useState<"USDC" | "USDT">("USDC");
  const [q, setQ] = useState<ParityQuote | null>(initial);
  const [pickedMint, setPickedMint] = useState<string | null>(null);
  const [src, setSrc] = useState<{ source: Source; x: number; y: number } | null>(null);
  const [load, setLoad] = useState<"ok" | "loading" | "error">(initial ? "ok" : "loading");
  const root = useRef<HTMLDivElement>(null);

  // Re-quote when the size changes: the cheapest token at $1,000 is often not the
  // cheapest at $100,000, which is the entire point of the screen.
  // Debounced: `amount` changes on every keystroke, and each quote costs several calls to a
  // rate-limited upstream.
  useEffect(() => {
    let dead = false;
    let timer: ReturnType<typeof setInterval>;
    const pull = async () => {
      try {
        const r = await fetch(`/api/v1/quote?symbol=${underlying.symbol}&usd=${amount}`, { cache: "no-store" });
        const j = (await r.json()) as ParityQuote;
        if (dead) return;
        if (j.venues) {
          setQ(j);
          setLoad("ok");
        } else setLoad((s) => (s === "ok" ? "ok" : "error"));
      } catch {
        // keep the last good quote, but never let a failure read as "nothing is quoting"
        if (!dead) setLoad((s) => (s === "ok" ? "ok" : "error"));
      }
    };
    const debounce = setTimeout(() => {
      pull();
      timer = setInterval(pull, 12_000);
    }, 450);
    return () => {
      dead = true;
      clearTimeout(debounce);
      clearInterval(timer);
    };
  }, [underlying.symbol, amount]);

  const venues = q?.venues ?? [];
  const routable = venues.filter((v) => v.effPx[String(q?.usd ?? amount)] != null);
  const effOf = (v: VenueQuote) => v.effPx[String(q?.usd ?? amount)] ?? v.effPx[String(amount)] ?? null;
  const passing = routable.filter((v) => v.devBps != null && Math.abs(v.devBps) <= guard);
  const best = passing.length ? passing.reduce((a, b) => ((effOf(b) as number) < (effOf(a) as number) ? b : a)) : null;
  const selected = venues.find((v) => v.token.mint === pickedMint) ?? best ?? routable[0] ?? null;
  const fair = q?.fair;
  // "Closest" means nearest to fair value — `routable` is sorted by price, which is not the same.
  const nearestToFair = routable.length
    ? routable.reduce((a, b) => (Math.abs(b.devBps ?? 1e9) < Math.abs(a.devBps ?? 1e9) ? b : a))
    : null;

  const open = (e: React.MouseEvent, source: Source) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const box = root.current?.getBoundingClientRect();
    if (!box) return;
    setSrc({ source, x: Math.min(Math.max(12, r.left - box.left), box.width - 342), y: r.bottom - box.top + 8 });
  };

  const fairSource: Source | null = fair
    ? {
        title: `Fair value, ${fmtPx(fair.price)}`,
        rows: [
          ["Source", fair.source],
          ["Session", MARKET_LABEL[fair.marketState]],
          ["Published", `${fair.ageSec}s ago`],
          ["Confidence", fair.conf > 0 ? `±$${fair.conf.toFixed(2)} (±${Math.round((fair.conf / fair.price) * 1e4)} bps)` : "not published"],
          ...(fair.onchainAccount ? ([["Account", fair.onchainAccount]] as [string, string][]) : []),
        ],
        note:
          fair.marketState === "regular"
            ? "The oracle price of one share. Parity does not set it. Every token is measured against the same number."
            : "US markets are closed, so fair value comes from the freshest reference Parity can verify. Guards are measured against this number.",
        verify: fair.onchainAccount ? `https://solscan.io/account/${fair.onchainAccount}` : undefined,
      }
    : null;

  return (
    <div ref={root} style={{ position: "relative" }} onClick={() => setSrc(null)}>
      {/* symbol + fair value */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: "16px 40px", padding: "clamp(20px,3cqw,36px) 0 16px" }}>
        <div>
          <div className="display" style={{ fontSize: "clamp(72px,11cqw,150px)", lineHeight: 0.85, letterSpacing: "-0.045em" }}>
            {underlying.symbol}
          </div>
          <div style={{ fontSize: 15, fontStyle: "italic", color: "var(--muted)" }}>
            {underlying.name}, issued as {underlying.tokens.length} token{underlying.tokens.length === 1 ? "" : "s"} on Solana
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
          <span className="label label-loose">Fair value · {fair?.source ?? "oracle"}</span>
          <span className="serif provenance" style={{ fontSize: "clamp(48px,5.4cqw,72px)", lineHeight: 1 }} onClick={(e) => fairSource && open(e, fairSource)}>
            {fmtPx(fair?.price)}
          </span>
          <span className="num" style={{ fontSize: 12, color: "var(--muted)" }}>
            {fair ? `${fair.conf > 0 ? `±$${fair.conf.toFixed(2)} · ` : ""}${MARKET_LABEL[fair.marketState]}${fair.stale ? " · stale" : ""}` : ""}
          </span>
        </div>
      </div>

      {/* the answer */}
      <div style={{ borderTop: "3px double var(--ink)", padding: "clamp(20px,3cqw,36px) 0", display: "flex", flexWrap: "wrap", gap: "24px 48px", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <h1 className="serif" style={{ margin: 0, fontSize: "clamp(40px,5.4cqw,76px)", lineHeight: 0.95, letterSpacing: "-0.02em", textWrap: "balance" }}>
            {best ? (
              <>
                At {usd(amount)}, buy <span style={{ fontStyle: "italic", color: "var(--vermilion)" }}>{best.token.symbol}</span>.
              </>
            ) : routable.length ? (
              <>At {usd(amount)}, no token is within your guard.</>
            ) : load === "loading" ? (
              <>Quoting every {underlying.symbol} token at {usd(amount)}…</>
            ) : load === "error" ? (
              <>Quotes for {underlying.symbol} could not be read.</>
            ) : (
              <>No token for {underlying.symbol} is quoting right now.</>
            )}
          </h1>
          <p style={{ margin: 0, fontSize: "clamp(18px,1.7cqw,22px)", lineHeight: 1.4, maxWidth: 640, textWrap: "pretty" }}>
            {best ? (
              <>
                It fills <span className="num" style={{ fontSize: "0.85em", background: "var(--tint)", padding: "1px 5px" }}>{bp(best.devBps)}</span> from fair
                {q?.savedUsd != null && q.savedUsd > 0 ? <> and costs {usd(q.savedUsd, 2)} less than the costliest token at this size.</> : <> at this size.</>}
              </>
            ) : routable.length ? (
              <>
                The closest is {nearestToFair?.token.symbol} at {bp(nearestToFair?.devBps)} from fair. The order slip lists what you can do instead.
              </>
            ) : load === "loading" ? (
              <>Pricing each issuer against the oracle at this size.</>
            ) : load === "error" ? (
              <>The quote service did not answer. Nothing below is a statement about the market.</>
            ) : (
              <>Every issuer&apos;s route is unavailable at this size. Ondo quotes only during market hours.</>
            )}
          </p>
        </div>

        <div style={{ flex: "0 1 300px", display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="label">Your trade size</span>
          <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--ink)", padding: "0 14px", height: 52, background: "var(--slip)" }}>
            <span className="serif" style={{ fontSize: 28, color: "var(--muted)" }}>
              $
            </span>
            <input
              type="number"
              min={1}
              max={100_000}
              value={amount}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setAmount(Math.max(1, Math.min(100_000, Number(e.target.value) || 1)))}
              className="serif"
              style={{ border: "none", background: "none", font: "inherit", fontSize: 30, width: "100%", outline: "none", color: "var(--ink)" }}
            />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setAmount(s)}
                className="num"
                style={{
                  font: "inherit",
                  fontSize: 12,
                  padding: "5px 9px",
                  border: "1px solid var(--ink)",
                  cursor: "pointer",
                  background: amount === s ? "var(--ink)" : "transparent",
                  color: amount === s ? "var(--paper)" : "var(--ink)",
                }}
              >
                ${s >= 1000 ? `${s / 1000}k` : s}
              </button>
            ))}
          </div>
          <p style={{ margin: 0, fontSize: 14, fontStyle: "italic", color: "var(--muted)" }}>Change it and the ranking changes with it.</p>
        </div>
      </div>

      <NumberLine marks={venues.map((v) => ({ issuer: v.token.issuer, token: v.token.symbol, bps: v.devBps }))} guard={guard} size={usd(amount)} />

      {/* route cards + slip */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "32px 40px", alignItems: "flex-start", padding: "28px 0" }}>
        <div style={{ flex: "1 1 560px", minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, borderBottom: "1px solid var(--ink)", paddingBottom: 6 }}>
            <h2 className="serif" style={{ margin: 0, fontSize: 32, lineHeight: 1.1 }}>
              {venues.length ? `The ${venues.length} tokens` : "Tokens"} at {usd(amount)}
            </h2>
            <span style={{ fontSize: 14, fontStyle: "italic", color: "var(--muted)" }}>Ranked by what you&apos;d pay. Dotted figures show their source.</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
            {venues.map((v, i) => {
              const eff = effOf(v);
              const isBest = best?.token.mint === v.token.mint;
              const inside = v.devBps != null && Math.abs(v.devBps) <= guard;
              const tag = eff == null ? "Not quoting" : isBest ? "Best at your size" : inside ? "Within guard" : "Outside guard";
              return (
                <div
                  key={v.token.mint}
                  onClick={() => eff != null && setPickedMint(v.token.mint)}
                  style={{
                    cursor: eff != null ? "pointer" : "default",
                    padding: "14px 16px 16px",
                    borderRight: "1px solid var(--rule)",
                    borderBottom: "1px solid var(--rule)",
                    background: selected?.token.mint === v.token.mint ? "var(--selected)" : "transparent",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span className="label" style={{ color: isBest ? "var(--vermilion)" : "var(--muted)" }}>
                      {RANK[i] ?? `${i + 1}th`} · {tag}
                    </span>
                    {selected?.token.mint === v.token.mint && <span className="label">On slip</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="dot" style={{ width: 12, height: 12, background: INK[v.token.issuer] }} />
                    <span>
                      <span className="display-mid" style={{ fontSize: 22, display: "block" }}>
                        {v.token.symbol}
                      </span>
                      <span style={{ fontSize: 14, fontStyle: "italic", color: "var(--muted)" }}>{ISSUERS[v.token.issuer].name}</span>
                    </span>
                  </div>
                  <div>
                    <span
                      className="serif provenance"
                      style={{ fontSize: 44, lineHeight: 1, display: "inline-block" }}
                      onClick={(e) =>
                        open(e, {
                          title: `${v.token.symbol} at ${usd(amount)}, ${fmtPx(eff)}`,
                          rows: [
                            ["Quoted vs fair", bp(v.devBps)],
                            ["Price impact", v.priceImpactPct != null ? `${(v.priceImpactPct * 100).toFixed(3)}%` : "—"],
                            ["Pool liquidity", dep(v.token.liquidity)],
                            ["Route", v.swapType === "rfq" ? "JupiterZ RFQ" : v.route.slice(0, 2).join(" → ") || "—"],
                          ],
                          note: `A simulated fill of your full amount against live ${ISSUERS[v.token.issuer].name} liquidity, including impact and fees. What you would pay, not the last traded price.`,
                          verify: `https://solscan.io/token/${v.token.mint}`,
                        })
                      }
                    >
                      {fmtPx(eff)}
                    </span>
                    <div className="num" style={{ fontSize: 13 }}>
                      {eff == null ? (v.error ?? "no route") : `${bp(v.devBps)} · ${usd((amount * Math.abs(v.devBps ?? 0)) / 1e4, 2)} ${(v.devBps ?? 0) >= 0 ? "over" : "under"} fair`}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "3px 12px", fontSize: 14, borderTop: "1px solid var(--rule)", paddingTop: 8 }}>
                    <span style={{ color: "var(--muted)" }}>Last print vs fair</span>
                    <span className="num" style={{ fontSize: 13, textAlign: "right" }}>
                      {v.lastPx != null && fair ? bp(Math.round(((v.lastPx - fair.price) / fair.price) * 1e4)) : "—"}
                    </span>
                    <span style={{ color: "var(--muted)" }}>Impact at your size</span>
                    <span className="num" style={{ fontSize: 13, textAlign: "right" }}>
                      {v.priceImpactPct != null ? `${(v.priceImpactPct * 100).toFixed(3)}%` : "—"}
                    </span>
                    <span style={{ color: "var(--muted)" }}>Pool liquidity</span>
                    <span className="num" style={{ fontSize: 13, textAlign: "right" }}>
                      {dep(v.token.liquidity)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <OrderSlip
          underlying={underlying}
          quote={q}
          venue={selected}
          amount={amount}
          setAmount={setAmount}
          guard={guard}
          setGuard={setGuard}
          pay={pay}
          setPay={setPay}
          onPick={setPickedMint}
          guardCluster={guardCluster}
        />
      </div>

      {/* rights */}
      <div style={{ borderTop: "3px double var(--ink)", padding: "4px 0 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, borderBottom: "1px solid var(--ink)", paddingBottom: 6, marginTop: 20 }}>
          <h2 className="serif" style={{ margin: 0, fontSize: 32 }}>
            What each token gives you
          </h2>
          <span style={{ fontSize: 14, fontStyle: "italic", color: "var(--muted)" }}>Doesn&apos;t affect the ranking</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
          {underlying.tokens.map((t) => {
            const i = ISSUERS[t.issuer];
            return (
              <div key={t.mint} style={{ padding: "14px 16px 14px 0", borderBottom: "1px solid var(--rule)", display: "flex", flexDirection: "column", gap: 8, fontSize: 15, lineHeight: 1.4 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="dot" style={{ width: 10, height: 10, background: INK[t.issuer] }} />
                  <span style={{ fontWeight: 500 }}>{t.symbol}</span>
                  <span style={{ fontStyle: "italic", color: "var(--muted)" }}>{i.name}</span>
                </span>
                <span>
                  <span className="label">Structure </span>
                  {i.backing}.
                </span>
                <span>
                  <span className="label">Redemption </span>
                  {i.redemption}.
                </span>
                <span>
                  <span className="label">Dividends </span>
                  {i.dividends}.
                </span>
              </div>
            );
          })}
        </div>
        <Link href="/receipts" style={{ fontSize: 14, display: "inline-block", paddingTop: 16 }}>
          {underlying.symbol} receipts →
        </Link>
      </div>

      {src && <SourcePopover source={src.source} x={src.x} y={src.y} onClose={() => setSrc(null)} />}
    </div>
  );
}
