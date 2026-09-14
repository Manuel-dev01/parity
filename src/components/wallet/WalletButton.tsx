"use client";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "./Wallet";

export function WalletButton() {
  const { wallets, wallet, address, connecting, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, []);

  if (address) {
    return (
      <button
        onClick={disconnect}
        title="Disconnect"
        className="num text-xs sm:text-sm border border-border rounded-full px-3 py-1.5 hover:border-border-2 flex items-center gap-2"
      >
        {wallet?.icon && <img src={wallet.icon} alt="" className="w-4 h-4 rounded" />}
        {address.slice(0, 4)}…{address.slice(-4)}
      </button>
    );
  }

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={connecting}
        className="text-sm font-medium rounded-full px-3.5 py-1.5 bg-accent text-black hover:bg-accent-2 disabled:opacity-60"
      >
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 card p-1.5 shadow-2xl z-50">
          {wallets.length === 0 && (
            <p className="text-xs text-muted p-3">
              No Solana wallet detected. Install{" "}
              <a className="underline" href="https://phantom.app" target="_blank" rel="noreferrer">
                Phantom
              </a>{" "}
              or{" "}
              <a className="underline" href="https://backpack.app" target="_blank" rel="noreferrer">
                Backpack
              </a>
              .
            </p>
          )}
          {wallets.map((w) => (
            <button
              key={w.name}
              onClick={() => {
                setOpen(false);
                connect(w).catch(() => {});
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-2 text-sm"
            >
              <img src={w.icon} alt="" className="w-5 h-5 rounded" />
              {w.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
