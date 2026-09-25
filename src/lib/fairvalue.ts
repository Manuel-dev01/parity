import type { FairValue, Underlying } from "./types";
import { readPythOnchain } from "./pyth-onchain";
import { getMarketState } from "./market";
import { JUP_BASE, jupHeaders } from "./jupiter";

const HERMES = process.env.PYTH_HERMES_URL || "https://pyth.dourolabs.app/hermes";
const PYTH_KEY = process.env.PYTH_API_KEY;

const BACKPACK = "https://api.backpack.exchange/api/v1";

type Ref = { source: string; price: number; conf: number; asOf: string; account?: string };

async function pythRefs(u: Underlying): Promise<Ref[]> {
  if (!PYTH_KEY || !u.pyth) return [];
  const ids = [u.pyth.us, u.pyth.index].filter(Boolean) as string[];
  const qs = ids.map((id) => `ids[]=${id}`).join("&");
  try {
    const r = await fetch(`${HERMES}/v2/updates/price/latest?${qs}&parsed=true`, {
      headers: { Authorization: `Bearer ${PYTH_KEY}` },
      next: { revalidate: 5 },
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { parsed: { id: string; price: { price: string; conf: string; expo: number; publish_time: number } }[] };
    return j.parsed.map((p) => ({
      source: p.id === u.pyth!.index ? "pyth-24/7" : "pyth-us",
      price: Number(p.price.price) * 10 ** p.price.expo,
      conf: Number(p.price.conf) * 10 ** p.price.expo,
      asOf: new Date(p.price.publish_time * 1000).toISOString(),
    }));
  } catch {
    return [];
  }
}

/** Jupiter Price v3 carries the underlying stock reference price for tokenized equities (keyless). */
export async function jupiterPrices(mints: string[]) {
  const r = await fetch(`${JUP_BASE}/price/v3?ids=${mints.join(",")}`, { headers: jupHeaders(), next: { revalidate: 5 } });
  if (!r.ok) return {} as Record<string, JupPrice>;
  return (await r.json()) as Record<string, JupPrice>;
}
export type JupPrice = {
  usdPrice: number;
  liquidity: number;
  decimals: number;
  priceChange24h: number;
  blockId: number;
  stockData?: { id: string; price: number; mcap: number; updatedAt: string };
};

async function backpackPerpRef(symbol: string): Promise<Ref | null> {
  try {
    const r = await fetch(`${BACKPACK}/ticker?symbol=${symbol}.US_USDC_PERP`, { next: { revalidate: 5 } });
    if (r.status !== 200) return null;
    const j = (await r.json()) as { lastPrice: string; timestamp?: number };
    return { source: "backpack-perp", price: Number(j.lastPrice), conf: 0, asOf: new Date().toISOString() };
  } catch {
    return null;
  }
}

export async function getFairValue(u: Underlying, jup?: Record<string, JupPrice>): Promise<FairValue> {
  const marketState = getMarketState();
  const [onchain, pyth, bp, jp] = await Promise.all([
    u.pythOnchain?.us ? readPythOnchain(u.pythOnchain.us.address).catch(() => null) : Promise.resolve(null),
    pythRefs(u),
    backpackPerpRef(u.symbol),
    jup ? Promise.resolve(jup) : jupiterPrices(u.tokens.map((t) => t.mint)),
  ]);
  const refs: Ref[] = [];
  if (onchain) refs.push({ source: "pyth-onchain", price: onchain.price, conf: onchain.conf, asOf: new Date(onchain.publishTime * 1000).toISOString(), account: u.pythOnchain!.us!.address });
  refs.push(...pyth);
  const stock = Object.values(jp).find((p) => p?.stockData)?.stockData;
  if (stock) refs.push({ source: "jupiter-stock", price: stock.price, conf: 0, asOf: stock.updatedAt });
  if (bp) refs.push(bp);

  const now = Date.now();
  const age = (r: Ref) => (now - Date.parse(r.asOf)) / 1000;
  const fresh = (r: Ref | undefined, maxSec: number) => r && age(r) <= maxSec;
  const oc = refs.find((r) => r.source === "pyth-onchain");
  const us = refs.find((r) => r.source === "pyth-us");
  const idx = refs.find((r) => r.source === "pyth-24/7");
  const js = refs.find((r) => r.source === "jupiter-stock");

  // Priority: live Pyth during the regular session, Pyth 24/7 index off-hours,
  // then Jupiter's stock reference, then Backpack's perp mark, then whatever is stale.
  let pick: Ref | undefined;
  if (fresh(oc, marketState === "regular" ? 90 : 900)) pick = oc;
  else if (marketState === "regular" && fresh(us, 90)) pick = us;
  else if (fresh(idx, 180)) pick = idx;
  else if (fresh(js, 6 * 3600)) pick = js;
  else if (bp) pick = bp;
  else pick = us ?? idx ?? js ?? oc ?? refs[0];

  if (!pick) throw new Error(`no reference price for ${u.symbol}`);
  const ageSec = Math.max(0, Math.round(age(pick)));
  return {
    price: pick.price,
    conf: pick.conf,
    source: pick.source as FairValue["source"],
    asOf: pick.asOf,
    ageSec,
    stale: marketState === "regular" ? ageSec > 90 : ageSec > 6 * 3600,
    marketState,
    onchainAccount: oc && fresh(oc, 900) ? (oc.account ?? null) : null,
    refs: refs.map(({ source, price, asOf }) => ({ source, price, asOf })),
  };
}
