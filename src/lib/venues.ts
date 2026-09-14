import type { FairValue, ParityQuote, Underlying, UniverseToken, VenueQuote } from "./types";
import { USDC_MINT } from "./universe";
import { getFairValue, jupiterPrices, type JupPrice } from "./fairvalue";

const ULTRA = "https://lite-api.jup.ag/ultra/v1/order";

type UltraOrder = {
  outAmount: string;
  priceImpactPct?: string | number;
  swapType?: "aggregator" | "rfq";
  gasless?: boolean;
  routePlan?: { swapInfo?: { label?: string } }[];
  error?: string;
  errorMessage?: string;
};

/** Effective USD price per share when buying `usd` of `token` right now via Jupiter Ultra. */
async function ultraEffectivePrice(token: UniverseToken, usd: number) {
  const amount = Math.round(usd * 1e6);
  const r = await fetch(`${ULTRA}?inputMint=${USDC_MINT}&outputMint=${token.mint}&amount=${amount}`, { next: { revalidate: 5 } });
  const j = (await r.json()) as UltraOrder;
  if (!r.ok || j.error || j.errorMessage || !j.outAmount) {
    return { effPx: null as number | null, err: j.error || j.errorMessage || `http ${r.status}` };
  }
  const shares = Number(j.outAmount) / 10 ** token.decimals;
  return {
    effPx: shares > 0 ? usd / shares : null,
    impact: j.priceImpactPct != null ? Number(j.priceImpactPct) : null,
    swapType: j.swapType ?? null,
    gasless: !!j.gasless,
    route: [...new Set((j.routePlan ?? []).map((p) => p.swapInfo?.label).filter(Boolean) as string[])],
  };
}

const bps = (px: number, fair: number) => Math.round(((px - fair) / fair) * 1e4);

export async function quoteVenue(token: UniverseToken, sizes: number[], primary: number, fair: FairValue, jp?: JupPrice): Promise<VenueQuote> {
  const results = await Promise.all(sizes.map((s) => ultraEffectivePrice(token, s).catch((e) => ({ effPx: null, err: String(e) }))));
  const effPx: Record<string, number | null> = {};
  sizes.forEach((s, i) => (effPx[String(s)] = results[i].effPx));
  const p = results[sizes.indexOf(primary)] as Awaited<ReturnType<typeof ultraEffectivePrice>>;
  const lastPx = jp?.usdPrice ?? token.usdPrice;
  return {
    token: { ...token, liquidity: jp?.liquidity != null ? Math.round(jp.liquidity) : token.liquidity, usdPrice: lastPx ?? null },
    lastPx: lastPx ?? null,
    effPx,
    devBps: p.effPx != null ? bps(p.effPx, fair.price) : null,
    priceImpactPct: "impact" in p ? (p.impact ?? null) : null,
    swapType: "swapType" in p ? (p.swapType ?? null) : null,
    gasless: "gasless" in p ? !!p.gasless : false,
    route: "route" in p && p.route ? p.route : [],
    error: "err" in p ? p.err : undefined,
  };
}

export async function parityQuote(u: Underlying, usd: number): Promise<ParityQuote> {
  const sizes = [...new Set([100, usd, 10_000])].sort((a, b) => a - b);
  const jp = await jupiterPrices(u.tokens.map((t) => t.mint));
  const fair = await getFairValue(u, jp);
  const venues = await Promise.all(u.tokens.map((t) => quoteVenue(t, sizes, usd, fair, jp[t.mint])));

  const routable = venues.filter((v) => v.effPx[String(usd)] != null);
  const px = (v: VenueQuote) => v.effPx[String(usd)] as number;
  const best = routable.length ? routable.reduce((a, b) => (px(b) < px(a) ? b : a)) : null;
  const worst = routable.length ? routable.reduce((a, b) => (px(b) > px(a) ? b : a)) : null;
  const spreadBps = best && worst && best !== worst ? Math.round(((px(worst) - px(best)) / px(best)) * 1e4) : null;
  const savedUsd = best && worst && best !== worst ? (usd / px(best) - usd / px(worst)) * fair.price : null;

  return {
    symbol: u.symbol,
    name: u.name,
    usd,
    sizes,
    fair,
    venues: venues.sort((a, b) => (a.effPx[String(usd)] ?? Infinity) - (b.effPx[String(usd)] ?? Infinity)),
    best: best?.token.mint ?? null,
    worst: worst?.token.mint ?? null,
    spreadBps,
    savedUsd: savedUsd != null ? Math.round(savedUsd * 100) / 100 : null,
    generatedAt: new Date().toISOString(),
  };
}
