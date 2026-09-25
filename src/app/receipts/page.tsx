import Link from "next/link";
import type { Metadata } from "next";
import { dbConfigured, sql } from "@/lib/db";
import { rankLabel, rankOf, type FillRow } from "@/app/api/v1/fills/route";
import { Sheet } from "@/components/broadsheet/Sheet";
import { Clock } from "@/components/broadsheet/Clock";
import { INK, bp, shortSig, usd } from "@/components/broadsheet/fmt";
import type { IssuerId } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Receipts — Parity" };

type Props = { searchParams: Promise<{ filter?: string }> };

export default async function Receipts({ searchParams }: Props) {
  const { filter } = await searchParams;
  const mode = filter === "checked" || filter === "enforced" ? filter : "all";
  let rows: FillRow[] = [];
  let available = dbConfigured;
  if (dbConfigured) {
    try {
      rows = await sql<FillRow>(`select * from fills order by ts desc limit 100`);
    } catch {
      available = false;
    }
  }
  const shown = rows.filter((r) => (mode === "all" ? true : mode === "enforced" ? r.guarded : !r.guarded));

  return (
    <Sheet dateline="Receipts · public ledger · all issuers" datelineRight={<Clock utc />} active="receipts">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px 48px", alignItems: "flex-end", padding: "clamp(24px,3.4cqw,44px) 0 24px" }}>
        <div style={{ flex: "1 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 className="serif" style={{ margin: 0, fontSize: "clamp(40px,5.8cqw,84px)", lineHeight: 0.95, letterSpacing: "-0.02em", textWrap: "balance" }}>
            Every fill Parity routes, <span style={{ fontStyle: "italic", color: "var(--vermilion)" }}>in public.</span>
          </h1>
          <p style={{ margin: 0, fontSize: "clamp(18px,1.7cqw,22px)", lineHeight: 1.4, maxWidth: 640, textWrap: "pretty" }}>
            Each line is a receipt: the price paid, fair value at that moment, and the protection that applied. Anyone can check any of them against the chain.
          </p>
        </div>
        <div style={{ display: "flex", border: "1px solid var(--ink)" }}>
          {(
            [
              ["All", "/receipts", mode === "all"],
              ["Checked", "/receipts?filter=checked", mode === "checked"],
              ["Enforced", "/receipts?filter=enforced", mode === "enforced"],
            ] as [string, string, boolean][]
          ).map(([label, href, active], i) => (
            <Link
              key={label}
              href={href}
              style={{
                padding: "10px 16px",
                borderLeft: i ? "1px solid var(--ink)" : undefined,
                background: active ? "var(--ink)" : "transparent",
                color: active ? "var(--paper)" : "var(--ink)",
                textDecoration: "none",
              }}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--ink)" }}>
        {!available ? (
          <p style={{ fontSize: 18, lineHeight: 1.45, padding: "28px 0", maxWidth: 640 }}>
            The receipt store did not answer. This page lists only what Parity recorded, so rather than show an empty ledger it says the record could not be
            read.
          </p>
        ) : shown.length === 0 ? (
          <p style={{ fontSize: 18, lineHeight: 1.45, padding: "28px 0", maxWidth: 640 }}>
            {rows.length === 0
              ? "No fills recorded yet. Every trade Parity routes is published here, with the price paid and the fair value it was measured against."
              : `No ${mode} receipts yet.`}
          </p>
        ) : (
          shown.map((f) => {
            const rank = rankOf(f);
            return (
              <Link
                key={f.sig}
                href={`/r/${f.sig}`}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "4px 24px",
                  alignItems: "baseline",
                  padding: "11px 0",
                  borderBottom: "1px solid var(--rule)",
                  color: "var(--ink)",
                  textDecoration: "none",
                }}
              >
                <span className="num" style={{ flex: "0 0 80px", fontSize: 12, color: "var(--muted)" }}>
                  {new Date(f.ts).toISOString().slice(11, 19)}
                </span>
                <span style={{ flex: "1 1 220px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="dot" style={{ width: 10, height: 10, background: INK[f.issuer as IssuerId] ?? "var(--ink)" }} />
                  {usd(f.usd)} of{" "}
                  <span style={{ fontWeight: 500 }}>
                    {f.symbol}
                    {suffix(f.issuer as IssuerId)}
                  </span>
                </span>
                <span className="num" style={{ flex: "0 0 110px", fontSize: 14 }}>
                  {bp(f.dev_bps)} fair
                </span>
                <span style={{ flex: "0 0 120px", fontSize: 15, color: "var(--muted)" }}>{rank ? rankLabel(rank) : "—"}</span>
                <span style={{ flex: "0 0 90px", fontSize: 15, fontStyle: "italic" }}>{f.guarded ? "Enforced" : "Checked"}</span>
                <span className="num" style={{ fontSize: 13, color: "var(--vermilion)" }}>
                  {shortSig(f.sig)} →
                </span>
              </Link>
            );
          })
        )}
      </div>

      <p style={{ fontSize: 14, fontStyle: "italic", color: "var(--muted)", padding: "10px 0 36px", maxWidth: 760 }}>
        Enforced receipts are written on-chain by the guard program, which runs on devnet until it has been audited. Checked receipts are recorded by Parity
        from the confirmed mainnet transaction, and every one links to the transaction itself.
      </p>
    </Sheet>
  );
}

const suffix = (i: IssuerId) => ({ xstocks: "x", ondo: "on", backpack: "" })[i] ?? "";
