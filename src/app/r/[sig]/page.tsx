import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { dbConfigured, sql } from "@/lib/db";
import { rankLabel, rankOf, type FillRow } from "@/app/api/v1/fills/route";
import { ISSUERS } from "@/lib/issuers";
import { Sheet } from "@/components/broadsheet/Sheet";
import { INK, bp, px as fmtPx, shortSig, usd } from "@/components/broadsheet/fmt";
import type { IssuerId } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sig: string }> };

async function getFill(sig: string) {
  if (!dbConfigured) return null;
  const rows = await sql<FillRow>(`select * from fills where sig = $1 limit 1`, [sig]).catch(() => []);
  return rows[0] ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sig } = await params;
  const f = await getFill(sig);
  if (!f) return { title: "Receipt — Parity" };
  const title = `${Number(f.shares).toFixed(4)} ${f.symbol} at ${fmtPx(Number(f.fill_px))}, ${bp(f.dev_bps)} from fair — Parity`;
  return { title, description: `A public receipt: what was paid, fair value at that moment, and which protection applied.`, openGraph: { title } };
}

export default async function Receipt({ params }: Props) {
  const { sig } = await params;
  const f = await getFill(sig);
  if (!f) notFound();

  const enforced = f.guarded;
  const rank = rankOf(f);
  const routes = [...(f.routes ?? [])].sort((a, b) => a.effPx - b.effPx);
  const ts = new Date(f.ts);

  return (
    <Sheet dateline={`parity.app/r/${shortSig(f.sig)} · public · permanent`} datelineRight={`${ts.toISOString().slice(11, 19)} UTC`} active="receipts">
      <div style={{ padding: "clamp(24px,3.4cqw,44px) 0 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        <span className="label label-loose">
          Receipt · {f.symbol} · {ts.toISOString().slice(0, 10)} {ts.toISOString().slice(11, 19)} UTC
        </span>
        <h1 className="serif" style={{ margin: 0, fontSize: "clamp(44px,6.4cqw,96px)", lineHeight: 0.92, letterSpacing: "-0.02em", textWrap: "balance" }}>
          {Number(f.shares).toFixed(4)} {f.symbol}
          {suffix(f.issuer as IssuerId)} bought at {fmtPx(Number(f.fill_px))},{" "}
          <span style={{ fontStyle: "italic", color: "var(--vermilion)" }}>{bp(f.dev_bps)} from fair.</span>
        </h1>
        <p style={{ margin: 0, fontSize: "clamp(18px,1.7cqw,22px)", lineHeight: 1.4, maxWidth: 720 }}>
          {rank ? (
            <>
              At {usd(f.usd)} this was {rankLabel(rank).toLowerCase()} of the {rank.of} {f.symbol} tokens quoting at that moment.
            </>
          ) : (
            <>Recorded before Parity captured every issuer&apos;s quote at fill time, so its rank among the other tokens is not known.</>
          )}
        </p>
      </div>

      {/* protection + facts */}
      <div style={{ display: "flex", flexWrap: "wrap", borderTop: "1px solid var(--ink)", borderBottom: "1px solid var(--ink)" }}>
        <div style={{ flex: "1 1 420px", padding: "22px 32px 22px 0", display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ display: "flex", gap: 3 }}>
            {[0, 1].map((i) => (
              <span key={i} style={{ width: 22, height: 5, background: i < (enforced ? 2 : 1) ? "var(--ink)" : "var(--meter-off)" }} />
            ))}
          </span>
          <span className="display-mid" style={{ fontSize: 24 }}>
            {enforced ? "Enforced" : "Checked"}
          </span>
          <span className="num" style={{ fontSize: 12, color: "var(--muted)" }}>
            {enforced ? "Devnet · unaudited program" : "Mainnet"}
          </span>
          <p style={{ margin: 0, fontSize: 18, lineHeight: 1.45 }}>
            {enforced
              ? "The guard program read the oracle in the same transaction and would have reverted the entire trade if the fill had landed outside the guard. This receipt was written on-chain by that transaction and cannot be changed."
              : "Parity verified this quote against fair value before the buyer signed; after signing, the buyer's slippage limit governed the fill. This receipt was recorded by Parity from the confirmed transaction, which anyone can inspect."}
          </p>
        </div>
        <div style={{ flex: "1 1 320px", padding: "22px 0", display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", fontSize: 15, alignContent: "start" }}>
          <Fact k="Transaction">
            <a href={`https://solscan.io/tx/${f.sig}`} target="_blank" rel="noreferrer">
              {shortSig(f.sig)} ↗
            </a>
          </Fact>
          <Fact k="Buyer">{shortSig(f.wallet)}</Fact>
          <Fact k="Issuer">{ISSUERS[f.issuer as IssuerId]?.name ?? f.issuer}</Fact>
          <Fact k="Size">{usd(f.usd)}</Fact>
          <Fact k="Receipt record">
            {f.receipt ? (
              <a href={`https://solscan.io/account/${f.receipt}?cluster=devnet`} target="_blank" rel="noreferrer">
                On-chain · {shortSig(f.receipt)} ↗
              </a>
            ) : (
              "Parity · recorded from the confirmed transaction"
            )}
          </Fact>
        </div>
      </div>

      {/* the market at that moment */}
      <div style={{ padding: "28px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <h2 className="serif" style={{ margin: 0, fontSize: 32 }}>
            The market at that moment
          </h2>
          <span style={{ fontSize: 14, fontStyle: "italic", color: "var(--muted)" }}>Quoted at {usd(f.usd)}, same moment</span>
        </div>
        {routes.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", borderTop: "1px solid var(--rule)" }}>
            {routes.map((r) => (
              <div
                key={r.mint}
                style={{
                  padding: "12px 16px 12px 0",
                  borderBottom: "1px solid var(--rule)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 12,
                  background: r.mint === f.mint ? "var(--selected)" : "transparent",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="dot" style={{ width: 10, height: 10, background: INK[r.issuer as IssuerId] }} />
                  <span style={{ fontWeight: 500 }}>{r.token}</span>
                  {r.mint === f.mint && <span style={{ fontSize: 14, fontStyle: "italic", color: "var(--muted)" }}>Bought</span>}
                </span>
                <span className="num" style={{ fontSize: 13 }}>
                  {fmtPx(r.effPx)} · {bp(r.devBps)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 15, fontStyle: "italic", color: "var(--muted)" }}>
            The other issuers&apos; quotes were not captured for this fill, so there is nothing to compare it against here.
          </p>
        )}
      </div>

      {/* provenance */}
      <div style={{ borderTop: "3px double var(--ink)", display: "flex", flexWrap: "wrap", gap: "32px 48px", padding: "24px 0 36px" }}>
        <div style={{ flex: "1 1 360px" }}>
          <h3 className="serif" style={{ margin: "0 0 8px", fontSize: 26 }}>
            Fair value used
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", fontSize: 15 }}>
            <Fact k="Price">{fmtPx(Number(f.fair_px))}</Fact>
            <Fact k="Fill">{fmtPx(Number(f.fill_px))}</Fact>
            <Fact k="Difference">{bp(f.dev_bps)}</Fact>
            <Fact k="Recorded">{ts.toISOString().replace("T", " ").slice(0, 19)} UTC</Fact>
          </div>
        </div>
        <div style={{ flex: "1 1 360px" }}>
          <h3 className="serif" style={{ margin: "0 0 8px", fontSize: 26 }}>
            Check it yourself
          </h3>
          {(enforced
            ? [
                "Open the transaction on any Solana explorer and find the guard program instruction.",
                "Read the Pyth account it verified against and compare it with the fill price.",
                "Fetch the receipt account. Its fields match this page.",
              ]
            : [
                "Open the transaction on any Solana explorer and read the swap amounts.",
                "Divide what left the wallet by what arrived to get the fill price on this page.",
                "Compare it with the oracle price Parity recorded, shown on the left.",
              ]
          ).map((step, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 10, padding: "8px 0", borderTop: "1px solid var(--rule)", fontSize: 16, lineHeight: 1.4 }}>
              <span className="num" style={{ fontSize: 13, color: "var(--vermilion)" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingBottom: 36 }}>
        <a
          href={`https://solscan.io/tx/${f.sig}`}
          target="_blank"
          rel="noreferrer"
          style={{ height: 48, padding: "0 22px", display: "flex", alignItems: "center", background: "var(--ink)", color: "var(--paper)" }}
        >
          View on Solscan ↗
        </a>
        <Link href="/receipts" style={{ height: 48, padding: "0 22px", display: "flex", alignItems: "center", border: "1px solid var(--ink)", color: "var(--ink)" }}>
          All receipts
        </Link>
      </div>
    </Sheet>
  );
}

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "contents" }}>
      <span style={{ color: "var(--muted)" }}>{k}</span>
      <span className="num" style={{ fontSize: 13, textAlign: "right", wordBreak: "break-all" }}>
        {children}
      </span>
    </div>
  );
}

const suffix = (i: IssuerId) => ({ xstocks: "x", ondo: "on", backpack: "" })[i] ?? "";
