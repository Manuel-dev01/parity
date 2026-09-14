"use client";
import { useEffect, useState } from "react";
import type { ParityQuote, Underlying } from "@/lib/types";
import type { SwapBuild } from "@/lib/execute";
import { useWallet } from "./wallet/Wallet";
import { usd as fmt, compact, Bps } from "./Bps";
import { IssuerChip } from "./IssuerChip";

type Stage = "idle" | "building" | "signing" | "sending" | "confirming";

interface Fill {
  sig: string;
  build: SwapBuild;
  savedUsd: number | null;
  recorded: boolean;
}

const MODE_LABEL: Record<SwapBuild["mode"], string> = {
  guarded: "On-chain guard",
  plain: "Client-side guard · guard program pending",
  ultra: "Client-side guard · Jupiter Ultra RFQ",
};

const b64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const bytesToB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

export function TradePanel({ underlying, quote, usd }: { underlying: Underlying; quote: ParityQuote | null; usd: number }) {
  const { address, signTransaction, signAndSendTransaction } = useWallet();
  const [maxDev, setMaxDev] = useState(50);
  const [amount, setAmount] = useState(Math.min(usd, 100));
  const [stage, setStage] = useState<Stage>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [fill, setFill] = useState<Fill | null>(null);

  useEffect(() => setAmount((a) => (a > usd ? usd : a)), [usd]);

  const best = quote?.venues.find((v) => v.token.mint === quote.best) ?? null;
  const worst = quote?.venues.find((v) => v.token.mint === quote.worst) ?? null;
  const eff = best?.effPx[String(usd)] ?? null;
  const busy = stage !== "idle";

  async function buy() {
    if (!address || !best || !quote) return;
    setErr(null);
    setFill(null);
    try {
      setStage("building");
      const r = await fetch("/api/v1/swap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol: underlying.symbol, mint: best.token.mint, usd: amount, owner: address, maxDevBps: maxDev }),
      });
      const build = (await r.json()) as SwapBuild & { error?: string };
      if (!r.ok) throw new Error(build.error || r.statusText);

      setStage("signing");
      let sig: string;
      if (build.mode === "ultra") {
        const signed = await signTransaction(b64ToBytes(build.tx));
        setStage("sending");
        const ex = await fetch("/api/v1/swap/execute", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestId: build.requestId, signedTx: bytesToB64(signed) }),
        });
        const j = (await ex.json()) as { signature?: string; error?: string };
        if (!ex.ok || !j.signature) throw new Error(j.error || "execution failed");
        sig = j.signature;
      } else {
        sig = await signAndSendTransaction(b64ToBytes(build.tx));
        setStage("confirming");
        await waitForConfirmation(sig);
      }

      const worstPx = worst?.effPx[String(usd)] ?? null;
      const savedUsd = worstPx && worst !== best ? Math.round((amount / build.quote.fillPx - amount / worstPx) * build.quote.fairPx * 100) / 100 : null;
      const rec = await fetch("/api/v1/fills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sig,
          wallet: address,
          symbol: underlying.symbol,
          issuer: build.quote.issuer,
          mint: build.quote.mint,
          usd: amount,
          shares: build.quote.shares,
          fillPx: build.quote.fillPx,
          fairPx: build.quote.fairPx,
          devBps: build.quote.devBps,
          savedUsd,
          guarded: build.mode === "guarded",
          receipt: build.guard?.receipt ?? null,
        }),
      })
        .then((x) => x.json())
        .catch(() => ({ recorded: false }));
      setFill({ sig, build, savedUsd, recorded: !!rec.recorded });
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setStage("idle");
    }
  }

  return (
    <div className="card p-5 h-fit lg:sticky lg:top-20">
      <h3 className="font-semibold tracking-tight">Buy at parity</h3>
      <p className="text-sm text-muted mt-1">Swap through the cheapest issuer; the fill is checked against the Pyth reference before it can settle.</p>

      {fill ? (
        <FillReceipt fill={fill} symbol={underlying.symbol} onReset={() => setFill(null)} />
      ) : (
        <>
          <div className="mt-5 space-y-3 text-sm">
            <Row
              k="You pay"
              v={
                <span className="flex items-center gap-1 justify-end">
                  <span className="text-muted">$</span>
                  <input
                    type="number"
                    min={1}
                    max={100_000}
                    step={1}
                    value={amount}
                    disabled={busy}
                    onChange={(e) => setAmount(Math.max(1, Math.min(100_000, Number(e.target.value) || 1)))}
                    className="num w-24 bg-surface-2 rounded-lg px-2 py-1 text-right outline-none focus:ring-1 ring-[var(--accent)]"
                  />
                  <span className="text-muted">USDC</span>
                </span>
              }
            />
            <Row k="Route" v={best ? <span className="flex items-center gap-2"><IssuerChip id={best.token.issuer} /> <span className="num text-xs text-muted">{best.token.symbol}</span></span> : "—"} />
            <Row k={`Est. price @ ${compact(usd)}`} v={<span className="num">{fmt(eff)}</span>} />
            <Row k="You receive" v={<span className="num">{eff ? `≈ ${(amount / eff).toFixed(4)} ${underlying.symbol}` : "—"}</span>} />
            <Row
              k="Max deviation"
              v={
                <span className="flex items-center gap-2">
                  <input type="range" min={5} max={300} step={5} value={maxDev} disabled={busy} onChange={(e) => setMaxDev(Number(e.target.value))} className="w-24 accent-[var(--accent)]" />
                  <span className="num text-xs">≤ {maxDev} bps</span>
                </span>
              }
            />
          </div>

          <button
            disabled={!address || !best || busy}
            onClick={buy}
            className="mt-5 w-full rounded-xl py-3 font-semibold bg-accent text-black disabled:opacity-40 disabled:cursor-not-allowed transition"
            title={address ? undefined : "Connect a wallet first"}
          >
            {STAGE_LABEL[stage] ?? (address ? (best ? `Buy ${underlying.symbol} at parity` : "No route right now") : "Connect wallet to buy")}
          </button>
          {err && <p className="text-xs text-danger mt-3 leading-relaxed">{err}</p>}
          <p className="text-[11px] text-dim mt-3 leading-relaxed">
            If the quoted fill is more than your max deviation from fair value you will not be asked to sign. With the on-chain guard active the transaction itself reverts. Issuer eligibility rules apply.
          </p>
        </>
      )}
    </div>
  );
}

const STAGE_LABEL: Partial<Record<Stage, string>> = {
  building: "Building transaction…",
  signing: "Approve in your wallet…",
  sending: "Submitting…",
  confirming: "Confirming…",
};

function FillReceipt({ fill, symbol, onReset }: { fill: Fill; symbol: string; onReset: () => void }) {
  const { build, sig } = fill;
  const q = build.quote;
  return (
    <div className="mt-5">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-accent" />
        <span className="font-semibold">Filled</span>
        <span className={`ml-auto text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 ${build.mode === "guarded" ? "bg-accent text-black" : "bg-surface-2 text-muted"}`}>{MODE_LABEL[build.mode]}</span>
      </div>
      <div className="num text-2xl font-semibold mt-3">
        {q.shares.toFixed(4)} {symbol}
      </div>
      <div className="text-xs text-muted">
        for {fmt(q.usd)} via <IssuerChip id={q.issuer} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-muted">Fill price</dt>
        <dd className="num text-right">{fmt(q.fillPx)}</dd>
        <dt className="text-muted">Fair value</dt>
        <dd className="num text-right">{fmt(q.fairPx)}</dd>
        <dt className="text-muted">Deviation</dt>
        <dd className="text-right">
          <Bps v={q.devBps} />
        </dd>
        <dt className="text-muted">Saved vs worst issuer</dt>
        <dd className={`num text-right ${fill.savedUsd && fill.savedUsd > 0 ? "text-accent" : ""}`}>{fill.savedUsd != null ? fmt(fill.savedUsd) : "—"}</dd>
      </dl>
      <div className="mt-4 flex flex-col gap-1.5 text-xs">
        <a className="text-accent hover:underline truncate" href={`https://solscan.io/tx/${sig}`} target="_blank" rel="noreferrer">
          View transaction on Solscan ↗
        </a>
        {build.guard && (
          <a className="text-accent hover:underline truncate" href={`https://solscan.io/account/${build.guard.receipt}`} target="_blank" rel="noreferrer">
            View on-chain Receipt ↗
          </a>
        )}
      </div>
      <p className="text-[11px] text-dim mt-3 leading-relaxed">
        {build.reason}
        {fill.recorded ? " Recorded to the fill history." : ""}
      </p>
      <button onClick={onReset} className="mt-4 w-full rounded-xl py-2.5 text-sm font-medium bg-surface-2 hover:bg-border transition">
        Buy again
      </button>
    </div>
  );
}

async function waitForConfirmation(sig: string) {
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    const j = (await fetch(`/api/v1/swap/status?sig=${sig}`, { cache: "no-store" }).then((r) => r.json())) as { status?: string; err?: string };
    if (j.status === "confirmed") return;
    if (j.status === "failed") throw new Error(`transaction failed on-chain: ${j.err}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`still unconfirmed after 90s — check https://solscan.io/tx/${sig}`);
}

function humanError(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  if (/reject|denied|cancel/i.test(m)) return "Signature request was cancelled.";
  return m;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
