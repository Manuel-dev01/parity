import type { IssuerId } from "@/lib/types";
import { INK } from "../broadsheet/fmt";

export interface Print {
  issuer: IssuerId;
  bps: number | null;
}

/** Same mapping as the ticker's number line: −150…+150 bps across the width. */
const pos = (bps: number) => Math.min(99, Math.max(1, ((bps + 150) / 300) * 100));

/**
 * One row's worth of dispersion: the vertical rule is fair value, the bar spans the
 * cheapest to costliest token, and each dot is an issuer.
 */
export function Dispersion({ prints }: { prints: Print[] }) {
  const priced = prints.filter((p) => p.bps != null) as { issuer: IssuerId; bps: number }[];
  if (!priced.length) return <div style={{ flex: "1 1 260px", minWidth: 200, height: 36 }} />;
  const lo = Math.min(...priced.map((p) => p.bps));
  const hi = Math.max(...priced.map((p) => p.bps));

  return (
    <div style={{ flex: "1 1 260px", position: "relative", height: 36, minWidth: 200 }}>
      <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "var(--faint)" }} />
      <div style={{ position: "absolute", left: "50%", top: "22%", bottom: "22%", width: 1.5, background: "var(--ink)" }} />
      <div
        style={{
          position: "absolute",
          top: "calc(50% - 1.5px)",
          height: 3,
          left: `${pos(lo)}%`,
          width: `${Math.max(0, pos(hi) - pos(lo))}%`,
          background: "oklch(0.55 0.19 35 / 0.35)",
          transition: "left 1.2s ease, width 1.2s ease",
        }}
      />
      {priced.map((p) => (
        <span
          key={p.issuer}
          className="dot"
          style={{
            position: "absolute",
            top: "50%",
            left: `${pos(p.bps)}%`,
            width: 11,
            height: 11,
            margin: "-5px 0 0 -5px",
            background: INK[p.issuer],
            transition: "left 1.2s ease",
          }}
        />
      ))}
    </div>
  );
}

/** Spread history for one symbol, drawn from real snapshot rows. */
export function Sparkline({ values, guard = 50 }: { values: number[]; guard?: number }) {
  if (values.length < 2) return null;
  const hmax = Math.max(guard, ...values) * 1.1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${40 - (v / hmax) * 38}`).join(" ");
  const guardH = (guard / hmax) * 38;
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: "100%", height: 72, display: "block", overflow: "visible" }}>
      <rect x="0" y={40 - guardH} width="100" height={guardH} fill="var(--band-svg)" />
      <polyline points={pts} fill="none" stroke="var(--ink)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
