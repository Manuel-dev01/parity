"use client";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "../wallet/Wallet";

export const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/**
 * The artboards only ever show a connected wallet (`7Fq4…w3kP`), so the disconnected
 * and picker states are authored here in the same language: square, ruled, no radius.
 */
export function WalletPill() {
  const { wallets, address, connecting, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, []);

  const pill: React.CSSProperties = {
    font: "inherit",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    padding: "6px 10px",
    border: "1px solid var(--ink)",
    background: "none",
    color: "var(--ink)",
    whiteSpace: "nowrap",
    cursor: "pointer",
  };

  if (address) {
    return (
      <button onClick={disconnect} title="Disconnect" style={pill}>
        {short(address)}
      </button>
    );
  }

  return (
    <div ref={box} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} disabled={connecting} style={pill}>
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            width: 220,
            zIndex: 30,
            background: "var(--slip)",
            border: "1px solid var(--ink)",
            boxShadow: "6px 6px 0 var(--popover-shadow)",
            padding: 8,
          }}
        >
          {wallets.length === 0 ? (
            <p style={{ margin: 0, fontSize: 14, fontStyle: "italic", color: "var(--muted)", padding: 6 }}>
              No Solana wallet detected. Install{" "}
              <a href="https://phantom.app" target="_blank" rel="noreferrer">
                Phantom
              </a>{" "}
              or{" "}
              <a href="https://backpack.app" target="_blank" rel="noreferrer">
                Backpack
              </a>
              .
            </p>
          ) : (
            wallets.map((w) => (
              <button
                key={w.name}
                onClick={() => {
                  setOpen(false);
                  connect(w).catch(() => {});
                }}
                style={{
                  font: "inherit",
                  fontSize: 15,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "8px 6px",
                  background: "none",
                  border: "none",
                  color: "var(--ink)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.icon} alt="" style={{ width: 18, height: 18 }} />
                {w.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
