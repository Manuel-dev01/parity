export function Bps({ v, className = "" }: { v: number | null | undefined; className?: string }) {
  if (v == null) return <span className={`num text-dim ${className}`}>—</span>;
  const tone = Math.abs(v) < 15 ? "text-muted" : v > 0 ? "text-danger" : "text-accent";
  return (
    <span className={`num ${tone} ${className}`}>
      {v > 0 ? "+" : ""}
      {v} bps
    </span>
  );
}

export const usd = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });

export const compact = (n: number | null | undefined) =>
  n == null ? "—" : "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
