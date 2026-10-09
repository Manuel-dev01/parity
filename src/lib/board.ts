import { unstable_cache } from "next/cache";
import { boardCandidates } from "./universe";
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
  /**
   * How far the cheapest tradable print sits from the underlying's reference price, in bps.
   * This is what a name has to say for itself when it has only one real pool and so no
   * spread — which is most of them, including SPY, NVDA and AAPL.
   */
  bestBps: number | null;
  /** issuer of that cheapest tradable print */
  best: IssuerId | null;
  /** how many of this name's prints have a real pool behind them */
  tradable: number;
  cheapest: IssuerId | null;
  richest: IssuerId | null;
  liquidity: number;
}

// Jupiter's keyless endpoint is rate-limited and every board render costs several calls.
// The cache has to be shared across instances: an in-process map only helped whichever
// instance happened to serve you, which left page loads swinging between 3s and 25s.
// 60s because a "this minute" board does not need to be fresher than a minute, and every
// miss costs several calls to a keyless, rate-limited endpoint.
export const liveBoard = (limit = 160): Promise<BoardRow[]> =>
  unstable_cache(() => buildBoard(limit), ["board", String(limit)], { revalidate: 60 })();

/**
 * Cheap, keyless live board: one Jupiter Price v3 batch per 50 mints gives the last
 * on-chain print per issuer token and the underlying stock reference price.
 */
async function buildBoard(limit: number): Promise<BoardRow[]> {
  const list: Underlying[] = boardCandidates().slice(0, limit);
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
        bestBps: lo?.bps ?? null,
        best: lo?.issuer ?? null,
        tradable: priced.length,
        cheapest: lo?.issuer ?? null,
        richest: hi?.issuer ?? null,
        liquidity: prints.reduce((s, p) => s + p.liquidity, 0),
      };
    })
    // A name with a real spread outranks one without; among the rest, the furthest from the
    // underlying's own price goes first, since that is the number those rows are reporting.
    .filter((r) => r.tradable > 0)
    .sort(
      (a, b) =>
        (b.spreadBps ?? -1) - (a.spreadBps ?? -1) ||
        Math.abs(b.bestBps ?? 0) - Math.abs(a.bestBps ?? 0),
    );
}
