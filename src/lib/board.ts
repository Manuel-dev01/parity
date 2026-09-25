import { multiIssuer } from "./universe";
import { jupiterPrices, type JupPrice } from "./fairvalue";
import type { IssuerId, Underlying } from "./types";

/** Below this, a token's last print is noise rather than a price. */
const POOL_FLOOR = 25_000;

export interface BoardPrint {
  issuer: IssuerId;
  symbol: string;
  mint: string;
  px: number | null;
  bps: number | null;
  liquidity: number;
  /** has a real pool behind it, so its last print can be compared with another's */
  comparable: boolean;
}

export interface BoardRow {
  symbol: string;
  name: string;
  ref: number | null;
  refAt: string | null;
  prints: BoardPrint[];
  /** richest minus cheapest across *comparable* prints, in bps of the cheapest */
  spreadBps: number | null;
  cheapest: IssuerId | null;
  richest: IssuerId | null;
  liquidity: number;
}

// Jupiter's keyless endpoint is rate-limited and every board render costs several calls.
// Instances are reused, so a short in-memory TTL keeps repeat loads off the wire entirely.
const CACHE_MS = 20_000;
const cache = new Map<string, { at: number; rows: Promise<BoardRow[]> }>();

export function liveBoard(limit = 30, minIssuers = 2): Promise<BoardRow[]> {
  const key = `${limit}:${minIssuers}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const rows = buildBoard(limit, minIssuers).catch((e) => {
    cache.delete(key); // never cache a failure
    throw e;
  });
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

/**
 * Cheap, keyless live board: one Jupiter Price v3 batch per 50 mints gives the last
 * on-chain print per issuer token and the underlying stock reference price.
 */
async function buildBoard(limit: number, minIssuers: number): Promise<BoardRow[]> {
  const list: Underlying[] = multiIssuer(minIssuers).slice(0, limit);
  const mints = list.flatMap((u) => u.tokens.map((t) => t.mint));
  const prices: Record<string, JupPrice> = {};
  for (let i = 0; i < mints.length; i += 50) {
    Object.assign(prices, await jupiterPrices(mints.slice(i, i + 50)).catch(() => ({})));
  }
  return list
    .map((u) => {
      const stock = u.tokens.map((t) => prices[t.mint]?.stockData).find(Boolean) ?? null;
      const ref = stock?.price ?? null;
      const prints: BoardPrint[] = u.tokens.map((t) => {
        const px = prices[t.mint]?.usdPrice ?? null;
        return {
          issuer: t.issuer,
          symbol: t.symbol,
          mint: t.mint,
          px,
          bps: px != null && ref ? Math.round(((px - ref) / ref) * 1e4) : null,
          liquidity: Math.round(prices[t.mint]?.liquidity ?? t.liquidity),
          comparable: (prices[t.mint]?.liquidity ?? t.liquidity) > POOL_FLOOR,
        };
      });
      // Only prints with a real pool behind them can be compared. Ondo trades by RFQ and
      // carries almost no pool, so its last print drifts — comparing it produced spreads of
      // several hundred bps that no one could have traded. Those names are quoted at size on
      // the ticker instead, where RFQ answers properly.
      const priced = prints.filter((p) => p.px != null && p.comparable);
      const lo = priced.length ? priced.reduce((a, b) => ((b.px as number) < (a.px as number) ? b : a)) : null;
      const hi = priced.length ? priced.reduce((a, b) => ((b.px as number) > (a.px as number) ? b : a)) : null;
      return {
        symbol: u.symbol,
        name: u.name,
        ref,
        refAt: stock?.updatedAt ?? null,
        prints,
        spreadBps: lo && hi && lo !== hi ? Math.round((((hi.px as number) - (lo.px as number)) / (lo.px as number)) * 1e4) : null,
        cheapest: lo?.issuer ?? null,
        richest: hi?.issuer ?? null,
        liquidity: prints.reduce((s, p) => s + p.liquidity, 0),
      };
    })
    .sort((a, b) => (b.spreadBps ?? -1) - (a.spreadBps ?? -1));
}
