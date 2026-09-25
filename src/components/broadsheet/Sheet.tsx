import Link from "next/link";
import type { ReactNode } from "react";
import { WalletPill } from "./WalletPill";
import { Clock } from "./Clock";

export type NavKey = "markets" | "holdings" | "receipts" | "methodology" | null;

const NAV: { key: Exclude<NavKey, null>; label: string; href: string }[] = [
  { key: "markets", label: "Markets", href: "/markets" },
  { key: "holdings", label: "Holdings", href: "/holdings" },
  { key: "receipts", label: "Receipts", href: "/receipts" },
  { key: "methodology", label: "Methodology", href: "/methodology" },
];

/** Dateline: page context on the left, a live clock on the right. */
export function Dateline({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "8px 16px",
        padding: "12px 0",
        borderBottom: "1px solid var(--ink)",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 12,
        flexWrap: "wrap",
      }}
    >
      <span>{left}</span>
      <span>{right ?? <Clock />}</span>
    </div>
  );
}

export function Masthead({ active }: { active: NavKey }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "12px 20px",
        padding: "16px 0 12px",
        borderBottom: "3px double var(--ink)",
        flexWrap: "wrap",
      }}
    >
      <Link href="/" className="serif" style={{ fontSize: 38, lineHeight: 1, color: "var(--ink)" }}>
        Parity
      </Link>
      <div style={{ display: "flex", gap: 18, fontSize: 15, alignItems: "center", flexWrap: "wrap" }}>
        {NAV.map((n) => (
          <Link
            key={n.key}
            href={n.href}
            style={{
              color: "var(--ink)",
              borderBottom: active === n.key ? "2px solid var(--ink)" : undefined,
            }}
          >
            {n.label}
          </Link>
        ))}
        <WalletPill />
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <div
      style={{
        borderTop: "1px solid var(--ink)",
        padding: "16px 0 26px",
        display: "flex",
        gap: 20,
        flexWrap: "wrap",
        fontSize: 13,
        color: "var(--muted)",
        alignItems: "baseline",
      }}
    >
      <span className="serif" style={{ fontSize: 20, color: "var(--ink)" }}>
        Parity
      </span>
      <Link href="/methodology">Methodology</Link>
      <Link href="/api/v1/quote?symbol=NVDA&usd=1000">API</Link>
      <span style={{ flex: 1 }} />
      <span>Neutral toward every issuer. Not investment advice.</span>
    </div>
  );
}

/** Escapes the gutter to run edge to edge — the Landing marquee. */
export function Bleed({ children }: { children: ReactNode }) {
  return <div style={{ margin: "0 calc(-1 * clamp(16px, 4cqw, 56px))" }}>{children}</div>;
}

/**
 * Page shell. `container-type: inline-size` lives on the outer div because every
 * size in the design is cqw against it — swapping to vw breaks the mobile renders.
 */
export function Sheet({
  dateline,
  datelineRight,
  active = null,
  children,
}: {
  dateline: ReactNode;
  datelineRight?: ReactNode;
  active?: NavKey;
  children: ReactNode;
}) {
  return (
    <div className="sheet">
      <div className="gutter">
        <Dateline left={dateline} right={datelineRight} />
        <Masthead active={active} />
        {children}
        <Footer />
      </div>
    </div>
  );
}
