"use client";
import { useState } from "react";
import type { SwapBuild, SwapRefusal } from "@/lib/execute";
import type { ParityQuote, Underlying, VenueQuote } from "@/lib/types";
import { ISSUERS } from "@/lib/issuers";
import { useWallet } from "../wallet/Wallet";
import { bp, px as fmtPx, usd } from "../broadsheet/fmt";

type Stage = "quote" | "signing" | "sending" | "filled";
type Tier = "checked" | "enforced";

interface Fill {
  sig: string;
  build: SwapBuild;
}

const b64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const bytesToB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

const btn: React.CSSProperties = { font: "inherit", cursor: "pointer", border: "none", borderRadius: 0 };

export function OrderSlip({
  underlying,
  quote,
  venue,
  amount,
  setAmount,
  guard,
  setGuard,
  pay,
  setPay,
  onPick,
  guardCluster,
}: {
  underlying: Underlying;
  quote: ParityQuote | null;
  venue: VenueQuote | null;
  amount: number;
  setAmount: (n: number) => void;
  guard: number;
  setGuard: (n: number) => void;
  pay: "USDC" | "USDT";
  setPay: (p: "USDC" | "USDT") => void;
  onPick: (mint: string) => void;
  guardCluster: "devnet" | "mainnet" | null;
}) {
  const { address, signTransaction, signAndSendTransaction } = useWallet();
  const [stage, setStage] = useState<Stage>("quote");
  const [err, setErr] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<SwapRefusal | null>(null);
  const [fill, setFill] = useState<Fill | null>(null);

  // Enforced lives on devnet only until the program is audited, so on mainnet it is shown
  // and explained but cannot be chosen. The UI must not imply protection it cannot deliver.
  const enforcedAvailable = guardCluster === "mainnet";
  const [tier, setTier] = useState<Tier>("checked");

  const eff = venue?.effPx[String(quote?.usd ?? amount)] ?? null;
  const shares = eff ? amount / eff : null;
  const busy = stage !== "quote" && stage !== "filled";

  const reset = () => {
    setRefusal(null);
    setErr(null);
    setStage("quote");
  };

  async function buy() {
    if (!address || !venue) return;
    reset();
    try {
      setStage("signing");
      const r = await fetch("/api/v1/swap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol: underlying.symbol, mint: venue.token.mint, usd: amount, owner: address, maxDevBps: guard, pay }),
      });
      const build = (await r.json()) as SwapBuild & { error?: string; refusal?: SwapRefusal };
      if (!r.ok) {
        setStage("quote");
        if (build.refusal) setRefusal(build.refusal);
        else setErr(build.error || r.statusText);
        return;
      }
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
        setStage("sending");
        await waitFor(sig);
      }
      await fetch("/api/v1/fills", {
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
          guarded: build.mode === "guarded",
          receipt: build.guard?.receipt ?? null,
        }),
      }).catch(() => {});
      setFill({ sig, build });
      setStage("filled");
    } catch (e) {
      setStage("quote");
      setErr(humanError(e));
    }
  }

  return (
    <div style={{ flex: "0 1 380px", minWidth: 290, border: "1px solid var(--ink)", background: "var(--slip)" }}>
      <div style={{ padding: "14px 18px 12px", borderBottom: "3px double var(--ink)" }}>
        <span className="label">Order slip</span>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span className="serif" style={{ fontSize: 32, lineHeight: 1.05 }}>
            Buy {venue?.token.symbol ?? underlying.symbol}
          </span>
          <span style={{ fontSize: 15, fontStyle: "italic", color: "var(--muted)" }}>{venue ? ISSUERS[venue.token.issuer].name : ""}</span>
        </div>
      </div>

      <div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
        {stage === "filled" && fill ? (
          <Filled fill={fill} onReset={() => { setFill(null); reset(); }} />
        ) : stage === "signing" || stage === "sending" ? (
          <Signing tier={tier} guard={guard} stage={stage} />
        ) : (
          <>
            <Rows
              rows={[
                ["You pay", `${amount.toLocaleString("en-US")} ${pay}`],
                ["You receive about", shares ? `${shares.toFixed(4)} ${venue?.token.symbol ?? ""}` : "—"],
              ]}
            />

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["USDC", "USDT"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPay(p)}
                  className="num"
                  style={{ ...btn, fontSize: 12, padding: "5px 9px", border: "1px solid var(--ink)", background: pay === p ? "var(--ink)" : "transparent", color: pay === p ? "var(--paper)" : "var(--ink)" }}
                >
                  {p}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
                <span style={{ color: "var(--muted)" }}>Price guard</span>
                <span className="num" style={{ fontSize: 14 }}>
                  ±{guard} bps
                </span>
              </div>
              <input type="range" min={10} max={150} step={5} value={guard} onChange={(e) => setGuard(Number(e.target.value))} style={{ width: "100%" }} onClick={(e) => e.stopPropagation()} />
              <p style={{ margin: 0, fontSize: 14, fontStyle: "italic", color: "var(--muted)" }}>
                Parity won&apos;t build a trade further than this from fair. At {usd(amount)} that is {usd((amount * guard) / 1e4, 2)}.
              </p>
            </div>

            <Tiers tier={tier} setTier={setTier} enforcedAvailable={enforcedAvailable} guard={guard} />

            {refusal ? (
              <Refused refusal={refusal} onPick={onPick} setAmount={setAmount} setGuard={setGuard} reset={reset} />
            ) : (
              <>
                <Rows
                  rows={[
                    ["Estimated fill", fmtPx(eff)],
                    ["From fair", venue?.devBps != null ? `${bp(venue.devBps)} · ${usd((amount * Math.abs(venue.devBps)) / 1e4, 2)}` : "—"],
                    ...(quote?.savedUsd != null && quote.savedUsd > 0 ? ([["vs costliest token", `${usd(quote.savedUsd, 2)} less`]] as [string, string][]) : []),
                  ]}
                  ruled
                />
                <button
                  onClick={buy}
                  disabled={!address || !venue || busy}
                  style={{ ...btn, height: 50, fontSize: 18, background: "var(--vermilion)", color: "var(--on-vermilion)", opacity: !address || !venue ? 0.45 : 1 }}
                >
                  {address ? (venue ? "Review and sign →" : "No route right now") : "Connect a wallet to buy"}
                </button>
              </>
            )}
            {err && <p style={{ margin: 0, fontSize: 14, color: "var(--vermilion)" }}>{err}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function Rows({ rows, ruled }: { rows: [string, string][]; ruled?: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "3px 12px",
        fontSize: 15,
        ...(ruled ? { borderTop: "1px solid var(--rule)", paddingTop: 10 } : {}),
      }}
    >
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <span style={{ color: "var(--muted)" }}>{k}</span>
          <span className="num" style={{ fontSize: 14, textAlign: "right" }}>
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}

function Tiers({ tier, setTier, enforcedAvailable, guard }: { tier: Tier; setTier: (t: Tier) => void; enforcedAvailable: boolean; guard: number }) {
  const tile = (id: Tier, name: string, network: string, bars: number, enabled: boolean) => (
    <button
      key={id}
      onClick={() => enabled && setTier(id)}
      disabled={!enabled}
      title={enabled ? undefined : "Enforced runs on devnet until the program is audited"}
      style={{
        ...btn,
        textAlign: "left",
        padding: 10,
        border: `1px solid ${tier === id ? "var(--ink)" : "var(--faint)"}`,
        background: tier === id ? "var(--paper)" : "transparent",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        cursor: enabled ? "pointer" : "not-allowed",
        opacity: enabled ? 1 : 0.55,
      }}
    >
      <span style={{ display: "flex", gap: 3 }}>
        {[0, 1].map((i) => (
          <span key={i} style={{ width: 18, height: 4, background: i < bars ? "var(--ink)" : "var(--meter-off)" }} />
        ))}
      </span>
      <span className="display-mid" style={{ fontSize: 16 }}>
        {name}
      </span>
      <span className="num" style={{ fontSize: 11, color: "var(--muted)" }}>
        {network}
      </span>
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="label">Protection</span>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {tile("checked", "Checked", "Mainnet · before you sign", 1, true)}
        {tile("enforced", "Enforced", enforcedAvailable ? "Reverts on-chain" : "Devnet · unaudited", 2, enforcedAvailable)}
      </div>
      <p style={{ margin: 0, fontSize: 15 }}>
        {tier === "checked"
          ? "Parity checks this quote against fair value before you sign. After signing, your slippage limit governs the fill."
          : `The trade reverts on-chain if the fill lands outside ±${guard} bps of fair, and writes a public receipt.`}
        {!enforcedAvailable && (
          <span style={{ fontStyle: "italic", color: "var(--muted)" }}> Enforced moves to mainnet after the program is audited.</span>
        )}
      </p>
    </div>
  );
}

/** The guard holding a trade is the product working — so it offers real ways forward. */
function Refused({
  refusal,
  onPick,
  setAmount,
  setGuard,
  reset,
}: {
  refusal: SwapRefusal;
  onPick: (mint: string) => void;
  setAmount: (n: number) => void;
  setGuard: (n: number) => void;
  reset: () => void;
}) {
  return (
    <div style={{ borderTop: "3px double var(--ink)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 9, height: 9, border: "1.5px solid var(--ink)", flexShrink: 0 }} />
        <span className="label label-loose">The guard held this trade</span>
      </div>
      <div className="serif" style={{ fontSize: 28, lineHeight: 1.05 }}>
        {refusal.token} would fill {bp(refusal.devBps)} from fair.
      </div>
      <p style={{ margin: 0, fontSize: 15 }}>
        At {usd(refusal.usd)} that is {usd(refusal.awayUsd, 2)} {refusal.devBps > 0 ? "above" : "below"} fair value, outside your ±{refusal.maxDevBps} bps guard.
        Nothing was signed and nothing was spent.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {refusal.options.map((o, i) => (
          <button
            key={o.kind}
            onClick={() => {
              if (o.kind === "issuer" && o.mint) onPick(o.mint);
              if (o.kind === "size" && o.usd) setAmount(o.usd);
              if (o.kind === "guard" && o.maxDevBps) setGuard(o.maxDevBps);
              reset();
            }}
            style={{
              ...btn,
              textAlign: "left",
              padding: "10px 12px",
              border: "1px solid var(--ink)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              background: i === 0 ? "var(--ink)" : "transparent",
              color: i === 0 ? "var(--paper)" : "var(--ink)",
            }}
          >
            <span>
              <span style={{ fontSize: 16 }}>{o.title}</span>
              <br />
              <span className="num" style={{ fontSize: 12, opacity: 0.85 }}>
                {o.detail}
              </span>
            </span>
            <span>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Signing({ tier, guard, stage }: { tier: Tier; guard: number; stage: Stage }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="serif" style={{ fontSize: 28 }}>
        {stage === "signing" ? "Waiting for your wallet" : "Confirming on-chain"}
      </div>
      <p style={{ margin: 0, fontSize: 15 }}>
        {tier === "checked"
          ? "Quote checked against fair value. It is re-checked at signing; after that, your slippage limit applies."
          : `If the fill lands outside ±${guard} bps of fair, the whole transaction reverts and you pay only the network fee.`}
      </p>
      <div style={{ height: 2, background: "var(--rule-light)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, width: "60%", background: "var(--ink)", animation: "slide 1.4s ease-in-out infinite" }} />
      </div>
      <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}`}</style>
    </div>
  );
}

function Filled({ fill, onReset }: { fill: Fill; onReset: () => void }) {
  const q = fill.build.quote;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span className="label label-loose" style={{ color: "var(--vermilion)" }}>
        Filled · {fill.build.mode === "guarded" ? "Enforced" : "Checked"}
      </span>
      <div className="serif" style={{ fontSize: 30, lineHeight: 1.05 }}>
        {q.shares.toFixed(4)} {q.symbol} at {fmtPx(q.fillPx)}
      </div>
      <Rows
        rows={[
          ["Fair at fill", fmtPx(q.fairPx)],
          ["From fair", bp(q.devBps)],
        ]}
        ruled
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
        <a href={`https://solscan.io/tx/${fill.sig}`} target="_blank" rel="noreferrer">
          Transaction ↗
        </a>
        <a href={`/r/${fill.sig}`}>View receipt</a>
      </div>
      <p style={{ margin: 0, fontSize: 14, fontStyle: "italic", color: "var(--muted)" }}>{fill.build.reason}</p>
      <button onClick={onReset} style={{ ...btn, height: 46, border: "1px solid var(--ink)", background: "none", color: "var(--ink)" }}>
        New trade
      </button>
    </div>
  );
}

async function waitFor(sig: string) {
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    const j = (await fetch(`/api/v1/swap/status?sig=${sig}`, { cache: "no-store" }).then((r) => r.json())) as { status?: string; err?: string };
    if (j.status === "confirmed") return;
    if (j.status === "failed") throw new Error(`transaction failed on-chain: ${j.err}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`still unconfirmed after 90s — check solscan.io/tx/${sig}`);
}

function humanError(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return /reject|denied|cancel/i.test(m) ? "Signature request was cancelled." : m;
}
