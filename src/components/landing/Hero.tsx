"use client";
import { useEffect, useState } from "react";
import type { IssuerId, ParityQuote } from "@/lib/types";
import { ISSUERS } from "@/lib/issuers";
import { INK, bp, spreadOf } from "../broadsheet/fmt";

export interface HeroToken {
  issuer: IssuerId;
  token: string;
  bps: number | null;
}

/** Vertical offsets, so the three inks miss each other on two axes like bad registration. */
const DY: Record<IssuerId, number> = { ondo: -0.6, xstocks: 0.5, backpack: 0 };
/** Horizontal shift per bp, capped: a 300 bps outlier must not throw the word off the page. */
const SHIFT = (bps: number | null) => Math.max(-5, Math.min(5, (bps ?? 0) * 0.12));

/**
 * Three issuer inks printed out of register, offset by each token's real deviation from
 * fair value. Hovering pulls them into register — that is what Parity does.
 */
export function Hero({ symbol, initial }: { symbol: string; initial: HeroToken[] }) {
  const [tokens, setTokens] = useState(initial);
  const [aligned, setAligned] = useState(false);

  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/v1/quote?symbol=${symbol}&usd=1000`, { cache: "no-store" });
        const q = (await r.json()) as ParityQuote;
        if (dead || !q.venues) return;
        setTokens(q.venues.map((v) => ({ issuer: v.token.issuer, token: v.token.symbol, bps: v.devBps })));
      } catch {
        /* keep the last good print */
      }
    };
    const t = setInterval(load, 4000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [symbol]);

  const spread = spreadOf(tokens.map((t) => t.bps));

  return (
    <div style={{ padding: "clamp(20px,3cqw,36px) 0 0", cursor: "crosshair" }} onMouseEnter={() => setAligned(true)} onMouseLeave={() => setAligned(false)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "4px 16px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, flexWrap: "wrap" }}>
        <span>
          {aligned ? "Fair value: all three inks in register" : `${symbol} on Solana, live · ${spread == null ? "—" : `${spread} bps`} between the prints`}
        </span>
        {!aligned && <span style={{ color: "var(--vermilion)" }}>Hover to print it at fair</span>}
      </div>

      <div style={{ position: "relative", height: "clamp(140px,25cqw,330px)", marginTop: 6 }}>
        {tokens.map((t) => (
          <div
            key={t.issuer}
            className="display"
            style={{
              position: "absolute",
              inset: 0,
              fontSize: "clamp(64px,24cqw,460px)",
              textAlign: "center",
              color: INK[t.issuer],
              mixBlendMode: "multiply",
              transform: aligned ? "translate(0,0)" : `translate(${SHIFT(t.bps)}%, ${DY[t.issuer] * 1.5}%)`,
              transition: "transform 1.4s cubic-bezier(.2,.8,.2,1)",
            }}
          >
            {symbol}
          </div>
        ))}
        <div
          className="display"
          style={{
            position: "absolute",
            inset: 0,
            fontSize: "clamp(64px,24cqw,460px)",
            textAlign: "center",
            color: "transparent",
            WebkitTextStroke: "1.5px var(--ink)",
            pointerEvents: "none",
          }}
        >
          {symbol}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          borderTop: "1px solid var(--ink)",
          borderBottom: "1px solid var(--ink)",
          marginTop: "clamp(12px,1.6cqw,24px)",
        }}
      >
        {tokens.map((t) => (
          <div key={t.issuer} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px 12px 0", borderRight: "1px solid var(--rule)" }}>
            <span style={{ width: 12, height: 12, background: INK[t.issuer], mixBlendMode: "multiply", flexShrink: 0 }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 500 }}>{t.token}</span>
              <br />
              <span style={{ fontSize: 13, fontStyle: "italic", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                {ISSUERS[t.issuer].name}
              </span>
            </span>
            <span style={{ flex: 1 }} />
            <span className="num" style={{ fontSize: 13 }}>
              {bp(t.bps)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
