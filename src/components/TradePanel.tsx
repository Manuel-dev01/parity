"use client";
import { useState } from "react";
import type { ParityQuote, Underlying } from "@/lib/types";
import { useWallet } from "./wallet/Wallet";
import { usd as fmt, compact } from "./Bps";
import { IssuerChip } from "./IssuerChip";

// Execution lands Monday: Jupiter swap-instructions composed with the fair_fill_guard
// program. Today the panel shows the route that would be taken and gates on wallet.
export function TradePanel({ underlying, quote, usd }: { underlying: Underlying; quote: ParityQuote | null; usd: number }) {
  const { address } = useWallet();
  const [maxDev, setMaxDev] = useState(50);
  const best = quote?.venues.find((v) => v.token.mint === quote.best) ?? null;
  const eff = best?.effPx[String(usd)] ?? null;

  return (
    <div className="card p-5 h-fit lg:sticky lg:top-20">
      <h3 className="font-semibold tracking-tight">Buy at parity</h3>
      <p className="text-sm text-muted mt-1">One transaction: swap through the cheapest issuer, then verify the fill against the oracle on-chain.</p>

      <div className="mt-5 space-y-3 text-sm">
        <Row k="You pay" v={<span className="num">{compact(usd)} USDC</span>} />
        <Row k="Route" v={best ? <span className="flex items-center gap-2"><IssuerChip id={best.token.issuer} /> <span className="num text-xs text-muted">{best.token.symbol}</span></span> : "—"} />
        <Row k="Est. price" v={<span className="num">{fmt(eff)}</span>} />
        <Row k="You receive" v={<span className="num">{eff ? `${(usd / eff).toFixed(4)} ${underlying.symbol}` : "—"}</span>} />
        <Row
          k="Oracle guard"
          v={
            <span className="flex items-center gap-2">
              <input type="range" min={5} max={300} step={5} value={maxDev} onChange={(e) => setMaxDev(Number(e.target.value))} className="w-24 accent-[var(--accent)]" />
              <span className="num text-xs">≤ {maxDev} bps</span>
            </span>
          }
        />
      </div>

      <button
        disabled
        className="mt-5 w-full rounded-xl py-3 font-semibold bg-accent text-black disabled:opacity-40 disabled:cursor-not-allowed"
        title={address ? "Execution goes live with the guard program" : "Connect a wallet first"}
      >
        {address ? "Buy " + underlying.symbol + " at parity" : "Connect wallet to buy"}
      </button>
      <p className="text-[11px] text-dim mt-3 leading-relaxed">
        The transaction reverts if the effective fill deviates from the Pyth reference by more than your guard. Issuer eligibility rules apply.
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
