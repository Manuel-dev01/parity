"use client";
// Minimal Wallet Standard connector. Phantom, Backpack and Solflare all register
// themselves via the standard, so no per-wallet adapter packages are needed.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getWallets } from "@wallet-standard/app";
import type { Wallet as StdWallet, WalletAccount } from "@wallet-standard/base";

const CHAIN = "solana:mainnet";

export interface WalletCtx {
  wallets: StdWallet[];
  wallet: StdWallet | null;
  address: string | null;
  connecting: boolean;
  connect: (w: StdWallet) => Promise<void>;
  disconnect: () => Promise<void>;
  /** sign one versioned transaction (raw bytes in, raw signed bytes out) */
  signTransaction: (tx: Uint8Array) => Promise<Uint8Array>;
  /** sign + send; returns signature (base58) */
  signAndSendTransaction: (tx: Uint8Array) => Promise<string>;
}

const Ctx = createContext<WalletCtx | null>(null);

type SignTxFeature = { signTransaction: (...i: { transaction: Uint8Array; account: unknown; chain: string }[]) => Promise<{ signedTransaction: Uint8Array }[]> };
type SignSendFeature = { signAndSendTransaction: (...i: { transaction: Uint8Array; account: unknown; chain: string; options?: unknown }[]) => Promise<{ signature: Uint8Array }[]> };
type ConnectFeature = { connect: (o?: { silent?: boolean }) => Promise<{ accounts: readonly { address: string; chains: readonly string[] }[] }> };
type DisconnectFeature = { disconnect: () => Promise<void> };

const feature = <T,>(w: StdWallet | null, name: string) => (w?.features as Record<string, unknown> | undefined)?.[name] as T | undefined;

export function Wallet({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<StdWallet[]>([]);
  const [wallet, setWallet] = useState<StdWallet | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const { get, on } = getWallets();
    const refresh = () => setWallets(get().filter((w) => w.chains.some((c) => c.startsWith("solana:")) && "standard:connect" in w.features));
    refresh();
    const offs = [on("register", refresh), on("unregister", refresh)];
    return () => offs.forEach((f) => f());
  }, []);

  const connect = useCallback(async (w: StdWallet) => {
    setConnecting(true);
    try {
      const f = feature<ConnectFeature>(w, "standard:connect");
      if (!f) throw new Error("wallet cannot connect");
      const { accounts } = await f.connect();
      const acct = accounts.find((a) => a.chains.includes(CHAIN)) ?? accounts[0];
      if (!acct) throw new Error("no Solana account");
      setWallet(w);
      setAddress(acct.address);
      try { localStorage.setItem("parity:wallet", w.name); } catch {}
    } finally {
      setConnecting(false);
    }
  }, []);

  // Silent reconnect to the wallet used last time.
  useEffect(() => {
    let name: string | null = null;
    try { name = localStorage.getItem("parity:wallet"); } catch {}
    const w = name ? wallets.find((x) => x.name === name) : null;
    if (w && !wallet) {
      feature<ConnectFeature>(w, "standard:connect")
        ?.connect({ silent: true })
        .then(({ accounts }) => {
          const acct = accounts.find((a) => a.chains.includes(CHAIN)) ?? accounts[0];
          if (acct) { setWallet(w); setAddress(acct.address); }
        })
        .catch(() => {});
    }
  }, [wallets, wallet]);

  const disconnect = useCallback(async () => {
    await feature<DisconnectFeature>(wallet, "standard:disconnect")?.disconnect().catch(() => {});
    setWallet(null);
    setAddress(null);
    try { localStorage.removeItem("parity:wallet"); } catch {}
  }, [wallet]);

  const account = (): WalletAccount | undefined => wallet?.accounts.find((a: WalletAccount) => a.address === address) ?? wallet?.accounts[0];

  const signTransaction = useCallback(async (tx: Uint8Array) => {
    const f = feature<SignTxFeature>(wallet, "solana:signTransaction");
    if (!f) throw new Error("wallet cannot sign transactions");
    const [r] = await f.signTransaction({ transaction: tx, account: account(), chain: CHAIN });
    return r.signedTransaction;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, address]);

  const signAndSendTransaction = useCallback(async (tx: Uint8Array) => {
    const f = feature<SignSendFeature>(wallet, "solana:signAndSendTransaction");
    if (!f) throw new Error("wallet cannot send transactions");
    const [r] = await f.signAndSendTransaction({ transaction: tx, account: account(), chain: CHAIN });
    const { default: bs58 } = await import("bs58");
    return bs58.encode(r.signature);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, address]);

  const value = useMemo<WalletCtx>(
    () => ({ wallets, wallet, address, connecting, connect, disconnect, signTransaction, signAndSendTransaction }),
    [wallets, wallet, address, connecting, connect, disconnect, signTransaction, signAndSendTransaction],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWallet outside <Wallet>");
  return c;
}
