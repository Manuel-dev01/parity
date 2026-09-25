import type { IssuerId } from "@/lib/types";

/** U+2212 MINUS SIGN, not a hyphen — it aligns with tabular figures. */
export const MINUS = "−";

export const bp = (n: number | null | undefined) =>
  n == null ? "—" : `${n > 0 ? "+" : n < 0 ? MINUS : "±"}${Math.abs(Math.round(n))} bps`;

export const usd = (n: number | null | undefined, d = 0) =>
  n == null ? "—" : `${n < 0 ? MINUS : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

export const px = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(2)}`);

export const dep = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`;

/** Widest minus narrowest deviation across an underlying's tokens. */
export const spreadOf = (bpsList: (number | null | undefined)[]) => {
  const v = bpsList.filter((n): n is number => n != null);
  return v.length > 1 ? Math.round(Math.max(...v) - Math.min(...v)) : null;
};

export const shortSig = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

export const INK: Record<IssuerId, string> = {
  ondo: "var(--ink-ondo)",
  xstocks: "var(--ink-xstocks)",
  backpack: "var(--ink-backpack)",
};

/** bps in prose. Sign is the only signal — colour is reserved for issuer ink and vermilion. */
export function Bps({ v, size = 13, weight }: { v: number | null | undefined; size?: number; weight?: number }) {
  return (
    <span className="num" style={{ fontSize: size, fontWeight: weight }}>
      {bp(v)}
    </span>
  );
}

/** The ink ring is what makes the xStocks yellow visible on cream. Never drop it. */
export function Dot({ id, size = 10 }: { id: IssuerId; size?: number }) {
  return <span className="dot" style={{ width: size, height: size, background: INK[id], display: "inline-block" }} />;
}

export function Label({ children, loose, style }: { children: React.ReactNode; loose?: boolean; style?: React.CSSProperties }) {
  return (
    <span className={`label${loose ? " label-loose" : ""}`} style={style}>
      {children}
    </span>
  );
}

/** A figure highlighted inline in a sentence. */
export function Figure({ children }: { children: React.ReactNode }) {
  return (
    <span className="num" style={{ fontSize: "0.85em", background: "var(--tint)", padding: "1px 5px" }}>
      {children}
    </span>
  );
}
