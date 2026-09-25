"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Position } from "@/app/api/v1/holdings/route";
import { useWallet } from "../wallet/Wallet";
import { INK, bp, px as fmtPx, usd } from "../broadsheet/fmt";

interface Data {
  valueUsd: number;
  paidVsFairBps: number | null;
  lotCount: number;
  positions: Position[];
  cash: { symbol: string; amount: number }[];
  historyAvailable: boolean;
}

export function Holdings() {
  const { address } = useWallet();
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (!address) {
      setData(null);
      setState("idle");
      return;
    }
    let dead = false;
    setState("loading");
    fetch(`/api/v1/holdings?owner=${address}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (dead) return;
        if (j.error) throw new Error(j.error);
        setData(j);
        setState("idle");
      })
      .catch(() => !dead && setState("error"));
    return () => {
      dead = true;
    };
  }, [address]);

  if (!address) return <Empty title="Connect a wallet to see what you hold." body="Parity reads your balances straight from the chain. Nothing is stored." />;
  if (state === "loading" && !data) return <Empty title="Reading your balances…" body="One call to the chain for every token account you own." />;
  if (state === "error") return <Empty title="Could not read your balances." body="The RPC did not answer. Reload to try again — nothing is cached in between." />;
  if (!data) return null;

  if (!data.positions.length) {
    return (
      <Empty
        title="No tokenized stocks in this wallet."
        body={
          data.cash.length
            ? `You hold ${data.cash.map((c) => `${c.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${c.symbol}`).join(" and ")}. Price a stock and Parity will route it to the cheapest issuer.`
            : "Fund the wallet with USDC or USDT and Parity will route your first buy to the cheapest issuer."
        }
      />
    );
  }

  return (
    <>
      <div style={{ padding: "clamp(24px,3.4cqw,44px) 0 28px", display: "flex", flexDirection: "column", gap: 14 }}>
        <h1 className="serif" style={{ margin: 0, fontSize: "clamp(40px,5.8cqw,84px)", lineHeight: 0.95, letterSpacing: "-0.02em", maxWidth: 1100, textWrap: "balance" }}>
          {data.positions.length} stock{data.positions.length === 1 ? "" : "s"}, {data.positions.reduce((n, p) => n + p.tokens.length, 0)} token
          {data.positions.reduce((n, p) => n + p.tokens.length, 0) === 1 ? "" : "s"}, worth{" "}
          <span style={{ fontStyle: "italic", color: "var(--vermilion)" }}>{usd(data.valueUsd, 2)}</span> at fair value.
        </h1>
        <p style={{ margin: 0, fontSize: "clamp(18px,1.7cqw,22px)", lineHeight: 1.4, maxWidth: 720 }}>
          {!data.historyAvailable ? (
            <>Purchase history is unavailable right now, so what you paid cannot be shown. The balances above are read live from the chain.</>
          ) : data.lotCount ? (
            <>
              Across {data.lotCount} purchase{data.lotCount === 1 ? "" : "s"} recorded by Parity you paid an average of{" "}
              <span className="num" style={{ fontSize: "0.85em" }}>
                {bp(data.paidVsFairBps)}
              </span>{" "}
              from fair.
            </>
          ) : (
            <>Parity has no record of these being bought here, so only what you hold is shown — not what you paid.</>
          )}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", borderTop: "1px solid var(--ink)", borderBottom: "1px solid var(--ink)" }}>
        <Kpi label="Value at fair" value={usd(data.valueUsd, 2)} />
        <Kpi label="Paid vs fair, average" value={data.paidVsFairBps == null ? "—" : bp(data.paidVsFairBps)} />
        <Kpi label="Buying power" value={data.cash.length ? usd(data.cash.reduce((n, c) => n + c.amount, 0), 2) : "—"} />
      </div>

      {data.positions.map((p) => (
        <div key={p.symbol} style={{ padding: "28px 0 8px", borderBottom: "3px double var(--ink)", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: "10px 32px" }}>
            <div>
              <Link href={`/s/${p.symbol}`} className="display" style={{ fontSize: "clamp(48px,6cqw,80px)", lineHeight: 0.85, letterSpacing: "-0.045em", color: "var(--ink)", display: "block" }}>
                {p.symbol}
              </Link>
              <span style={{ fontSize: 15, fontStyle: "italic", color: "var(--muted)" }}>
                {p.name} · fair{" "}
                <span className="num" style={{ fontStyle: "normal", fontSize: 14, color: "var(--ink)" }}>
                  {fmtPx(p.fairPx)}
                </span>
              </span>
            </div>
            <div style={{ display: "flex", gap: 28 }}>
              <Figure value={p.shares.toFixed(4)} label="shares" />
              <Figure value={usd(p.valueUsd, 2)} label="at fair" />
            </div>
          </div>

          {p.tokens.length > 1 && (
            <div style={{ display: "flex", height: 30, border: "1px solid var(--ink)" }}>
              {p.tokens.map((t) => (
                <div
                  key={t.mint}
                  style={{
                    width: `${(t.shares / p.shares) * 100}%`,
                    background: INK[t.issuer],
                    borderRight: "1px solid var(--ink)",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 10px",
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    color: "var(--ink)",
                  }}
                >
                  {t.token} {t.shares.toFixed(4)}
                </div>
              ))}
            </div>
          )}

          {p.lots.length > 0 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, borderBottom: "1px solid var(--ink)", paddingBottom: 4 }}>
                <h2 className="serif" style={{ margin: 0, fontSize: 26 }}>
                  What you paid
                </h2>
                <span style={{ fontSize: 14, fontStyle: "italic", color: "var(--muted)" }}>Each purchase against fair value at that moment</span>
              </div>
              {p.lots.map((l) => (
                <div key={l.sig} style={{ display: "flex", flexWrap: "wrap", gap: "6px 28px", alignItems: "baseline", padding: "12px 0", borderBottom: "1px solid var(--rule)" }}>
                  <span style={{ flex: "0 0 200px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="dot" style={{ width: 10, height: 10, background: INK[l.issuer] }} />
                    <span style={{ fontWeight: 500 }}>{l.token}</span>
                    <span className="num" style={{ fontSize: 12, color: "var(--muted)" }}>
                      {new Date(l.ts).toISOString().slice(0, 10)}
                    </span>
                  </span>
                  <span className="num" style={{ flex: "0 0 150px", fontSize: 14 }}>
                    {l.shares.toFixed(4)} @ {fmtPx(l.fillPx)}
                  </span>
                  <span style={{ flex: "0 0 180px" }}>
                    <span className="num" style={{ fontSize: 14 }}>
                      {bp(l.devBps)}
                    </span>{" "}
                    <span style={{ fontSize: 14, fontStyle: "italic", color: "var(--muted)" }}>from fair {fmtPx(l.fairPx)}</span>
                  </span>
                  <span style={{ flex: "1 1 160px", fontSize: 15 }}>
                    {l.rank ? <span style={{ fontWeight: 500 }}>{l.rank}</span> : <span style={{ fontStyle: "italic", color: "var(--muted)" }}>rank not recorded</span>}
                  </span>
                  <a className="num" style={{ fontSize: 13 }} href={`/r/${l.sig}`}>
                    Receipt →
                  </a>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 28px", alignItems: "baseline", padding: "4px 0 16px", fontSize: 15 }}>
            <span className="label">If you sold today</span>
            {p.tokens.map((t) => (
              <span key={t.mint}>
                <span style={{ fontWeight: 500 }}>{t.token}</span> bids{" "}
                <span className="num" style={{ fontSize: 14 }}>
                  {bp(t.exitBps)}
                </span>{" "}
                {t.exitUsd != null && <span style={{ fontStyle: "italic", color: "var(--muted)" }}>({usd(t.exitUsd, 2)})</span>}
              </span>
            ))}
            <span style={{ flex: 1 }} />
            <Link href={`/s/${p.symbol}`} style={{ fontSize: 14 }}>
              Price {p.symbol} →
            </Link>
          </div>
        </div>
      ))}

      <p style={{ padding: "22px 0", fontSize: 15, fontStyle: "italic", color: "var(--muted)", maxWidth: 760 }}>
        Balances are read from the chain each time this page loads. What you paid comes from the receipts Parity recorded, so purchases made elsewhere will not
        appear. Selling prices are live sell-side quotes for your whole position, including impact.
      </p>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "18px 20px 18px 0", display: "flex", flexDirection: "column", gap: 2 }}>
      <span className="label label-loose">{label}</span>
      <span className="display" style={{ fontSize: "clamp(34px,4cqw,54px)" }}>
        {value}
      </span>
    </div>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <span>
      <span className="serif" style={{ fontSize: 34, display: "block" }}>
        {value}
      </span>
      <span style={{ fontSize: 15, fontStyle: "italic", color: "var(--muted)" }}>{label}</span>
    </span>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: "clamp(40px,6cqw,96px) 0", maxWidth: 680, display: "flex", flexDirection: "column", gap: 14 }}>
      <h1 className="serif" style={{ margin: 0, fontSize: "clamp(36px,5cqw,72px)", lineHeight: 0.95, letterSpacing: "-0.02em" }}>
        {title}
      </h1>
      <p style={{ margin: 0, fontSize: "clamp(18px,1.7cqw,22px)", lineHeight: 1.4 }}>{body}</p>
      <Link href="/markets" style={{ fontSize: 15 }}>
        Browse markets →
      </Link>
    </div>
  );
}
