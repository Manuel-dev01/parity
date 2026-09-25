"use client";
import type { IssuerId } from "@/lib/types";
import { INK, bp } from "../broadsheet/fmt";

export interface Mark {
  issuer: IssuerId;
  token: string;
  bps: number | null;
}

/** −150…+150 bps across the full width, clamped so a wild print stays on the page. */
const pos = (bps: number) => Math.min(98, Math.max(2, ((bps + 150) / 300) * 100));

/**
 * Fig. 1: where each token sits against fair value, with the guard band drawn behind.
 * Marks are stacked 17px apart so labels never collide.
 */
export function NumberLine({ marks, guard, size }: { marks: Mark[]; guard: number; size: string }) {
  const priced = marks.filter((m) => m.bps != null);
  return (
    <div style={{ borderTop: "1px solid var(--ink)", padding: "14px 0 10px" }}>
      <div style={{ position: "relative", height: 112 }}>
        <div
          style={{
            position: "absolute",
            top: 58,
            height: 28,
            left: `${((150 - guard) / 300) * 100}%`,
            width: `${((guard * 2) / 300) * 100}%`,
            background: "var(--band)",
            borderLeft: "1px dashed var(--band-edge)",
            borderRight: "1px dashed var(--band-edge)",
          }}
        />
        <div style={{ position: "absolute", top: 72, left: 0, right: 0, height: 1, background: "var(--stem)" }} />
        <div style={{ position: "absolute", top: 52, left: "50%", width: 1.5, height: 40, background: "var(--ink)" }} />

        {priced.map((m, i) => {
          const top = i * 17;
          const inside = Math.abs(m.bps as number) <= guard;
          // Near an edge, anchor the label inward or .sheet's overflow clips it.
          const at = pos(m.bps as number);
          const anchor = at < 18 ? "0" : at > 82 ? "-100%" : "-50%";
          return (
            <div
              key={m.issuer}
              style={{
                position: "absolute",
                top,
                left: `${at}%`,
                transform: `translateX(${anchor})`,
                display: "flex",
                flexDirection: "column",
                alignItems: at < 18 ? "flex-start" : at > 82 ? "flex-end" : "center",
                transition: "left 1.2s cubic-bezier(.2,.8,.2,1)",
              }}
            >
              <span className="num" style={{ fontSize: 12, whiteSpace: "nowrap", fontStyle: inside ? "normal" : "italic" }}>
                {m.token} {bp(m.bps)}
              </span>
              <span style={{ width: 1, height: Math.max(4, 62 - top - 21), background: "var(--stem)" }} />
              <span className="dot" style={{ width: 10, height: 10, background: INK[m.issuer] }} />
            </div>
          );
        })}

        <div style={{ position: "absolute", top: 94, left: 0, right: 0, display: "flex", justifyContent: "space-between" }}>
          <span className="label">−150 bps</span>
          <span className="label" style={{ color: "var(--ink)" }}>
            FAIR
          </span>
          <span className="label">+150 bps</span>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 14, fontStyle: "italic", color: "var(--muted)" }}>
        <span style={{ fontStyle: "normal", fontWeight: 500 }}>Fig. 1</span> What each token would cost at {size}, measured from fair value. Shaded: your ±{guard} bps
        guard.
      </p>
    </div>
  );
}
