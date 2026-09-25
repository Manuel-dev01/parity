import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { rpc } from "@/lib/pyth-onchain";
import { STABLES, findByMint } from "@/lib/universe";
import { getFairValue, jupiterPrices, type JupPrice } from "@/lib/fairvalue";
import { swapQuote } from "@/lib/jupiter";
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "@/lib/guard";
import type { IssuerId, Underlying } from "@/lib/types";
import { dbConfigured, sql } from "@/lib/db";
import type { FillRow } from "../fills/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface HoldingLot {
  sig: string;
  ts: string;
  token: string;
  issuer: IssuerId;
  shares: number;
  fillPx: number;
  fairPx: number;
  devBps: number;
}

export interface HoldingToken {
  mint: string;
  token: string;
  issuer: IssuerId;
  shares: number;
  /** what a sell of this whole position quotes at right now, in bps from fair */
  exitBps: number | null;
  exitUsd: number | null;
}

export interface Position {
  symbol: string;
  name: string;
  fairPx: number | null;
  shares: number;
  valueUsd: number | null;
  tokens: HoldingToken[];
  lots: HoldingLot[];
}

/**
 * GET /api/v1/holdings?owner=<pubkey>
 *
 * Real balances only: the wallet's token accounts, matched against the universe and grouped
 * by underlying. Purchase history comes from the fills Parity actually recorded — a wallet
 * that bought elsewhere shows a position with no lots, which is the truth.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("owner");
  let owner: PublicKey;
  try {
    owner = new PublicKey(raw || "");
  } catch {
    return NextResponse.json({ error: "owner must be a valid public key" }, { status: 400 });
  }

  const conn = rpc();
  const accounts = (
    await Promise.all(
      [TOKEN_PROGRAM, TOKEN_2022_PROGRAM].map((programId) => conn.getParsedTokenAccountsByOwner(owner, { programId }).catch(() => ({ value: [] }))),
    )
  ).flatMap((r) => r.value);

  const balances = accounts
    .map((a) => {
      const info = a.account.data.parsed.info as { mint: string; tokenAmount: { uiAmount: number | null } };
      return { mint: info.mint, amount: info.tokenAmount.uiAmount ?? 0 };
    })
    .filter((b) => b.amount > 0);

  const cash = balances
    .filter((b) => STABLES[b.mint])
    .map((b) => ({ symbol: STABLES[b.mint].symbol, mint: b.mint, amount: b.amount }))
    .sort((a, b) => b.amount - a.amount);

  // group the stock tokens by their underlying share
  const grouped = new Map<string, { u: Underlying; held: { mint: string; amount: number }[] }>();
  for (const b of balances) {
    const hit = findByMint(b.mint);
    if (!hit) continue;
    const g = grouped.get(hit.u.symbol) ?? { u: hit.u, held: [] };
    g.held.push(b);
    grouped.set(hit.u.symbol, g);
  }

  // A failed lookup must not read as "no purchases" — the UI says which it was.
  let fills: FillRow[] = [];
  let historyAvailable = dbConfigured;
  if (dbConfigured) {
    try {
      fills = await sql<FillRow>(`select * from fills where wallet = $1 order by ts desc`, [owner.toBase58()]);
    } catch {
      historyAvailable = false;
    }
  }

  const positions: Position[] = await Promise.all(
    [...grouped.values()].map(async ({ u, held }) => {
      const [fair, jp] = await Promise.all([
        getFairValue(u).catch(() => null),
        jupiterPrices(held.map((h) => h.mint)).catch(() => ({}) as Record<string, JupPrice>),
      ]);
      const tokens: HoldingToken[] = await Promise.all(
        held.map(async (h) => {
          const t = u.tokens.find((x) => x.mint === h.mint)!;
          // "If you sold today" is a real sell-side quote, not the buy price mirrored.
          let exitBps: number | null = null;
          let exitUsd: number | null = null;
          if (fair) {
            const units = Math.floor(h.amount * 10 ** t.decimals);
            const q = units > 0 ? await swapQuote({ inputMint: h.mint, outputMint: Object.keys(STABLES)[0], amount: units, slippageBps: 100 }).catch(() => null) : null;
            if (q) {
              const out = Number(q.outAmount) / 1e6;
              const px = out / h.amount;
              exitBps = Math.round(((px - fair.price) / fair.price) * 1e4);
              exitUsd = Math.round((px - fair.price) * h.amount * 100) / 100;
            }
          }
          return { mint: h.mint, token: t.symbol, issuer: t.issuer, shares: h.amount, exitBps, exitUsd };
        }),
      );
      const shares = tokens.reduce((n, t) => n + t.shares, 0);
      return {
        symbol: u.symbol,
        name: u.name,
        fairPx: fair?.price ?? null,
        shares,
        valueUsd: fair ? Math.round(shares * fair.price * 100) / 100 : null,
        tokens: tokens.sort((a, b) => b.shares - a.shares),
        lots: fills
          .filter((f) => f.symbol === u.symbol)
          .map((f) => ({
            sig: f.sig,
            ts: f.ts,
            token: `${u.symbol}${issuerSuffix(f.issuer as IssuerId)}`,
            issuer: f.issuer as IssuerId,
            shares: Number(f.shares),
            fillPx: Number(f.fill_px),
            fairPx: Number(f.fair_px),
            devBps: Number(f.dev_bps),
          })),
      };
    }),
  );

  positions.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
  const valueUsd = positions.reduce((n, p) => n + (p.valueUsd ?? 0), 0);
  // Weighted by what each lot cost, so a large purchase counts more than a small one.
  const lots = positions.flatMap((p) => p.lots);
  const basis = lots.reduce((n, l) => n + l.shares * l.fairPx, 0);
  const paidVsFairBps = basis > 0 ? Math.round(lots.reduce((n, l) => n + l.devBps * l.shares * l.fairPx, 0) / basis) : null;

  return NextResponse.json({
    owner: owner.toBase58(),
    valueUsd: Math.round(valueUsd * 100) / 100,
    paidVsFairBps,
    lotCount: lots.length,
    positions,
    cash,
    historyAvailable,
  });
}

const issuerSuffix = (i: IssuerId) => ({ xstocks: "x", ondo: "on", backpack: "" })[i] ?? "";
