import data from "@/data/universe.json";
import type { Underlying } from "./types";

const all = (data as { builtAt: string; underlyings: Underlying[] }).underlyings;
const bySymbol = new Map(all.map((u) => [u.symbol, u]));
const byMint = new Map(all.flatMap((u) => u.tokens.map((t) => [t.mint, { u, t }] as const)));

export const universeBuiltAt = (data as { builtAt: string }).builtAt;

export function getUnderlying(symbol: string): Underlying | undefined {
  return bySymbol.get(symbol.toUpperCase());
}

export function findByMint(mint: string) {
  return byMint.get(mint);
}

/** Underlyings issued by 2+ issuers, most liquid first — the ones where parity matters. */
export function multiIssuer(min = 2): Underlying[] {
  return all.filter((u) => u.issuers.length >= min).sort((a, b) => b.liquidity - a.liquidity);
}

export function searchUnderlyings(q: string, limit = 12): Underlying[] {
  const s = q.trim().toUpperCase();
  if (!s) return multiIssuer().slice(0, limit);
  const starts = all.filter((u) => u.symbol.startsWith(s));
  const names = all.filter((u) => !u.symbol.startsWith(s) && u.name.toUpperCase().includes(s));
  return [...starts, ...names].sort((a, b) => b.issuers.length - a.issuers.length || b.liquidity - a.liquidity).slice(0, limit);
}

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
