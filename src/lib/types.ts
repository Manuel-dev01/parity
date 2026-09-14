export type IssuerId = "xstocks" | "ondo" | "backpack";

export type MarketState = "pre" | "regular" | "post" | "overnight" | "closed";

export interface UniverseToken {
  mint: string;
  symbol: string;
  name: string;
  issuer: IssuerId;
  decimals: number;
  tokenProgram: string;
  liquidity: number;
  holders: number;
  vol24h: number;
  usdPrice: number | null;
  icon: string | null;
}

export interface Underlying {
  symbol: string;
  name: string;
  tokens: UniverseToken[];
  issuers: IssuerId[];
  liquidity: number;
  pyth: { us: string; index: string | null } | null;
}

export interface FairValue {
  price: number;
  /** +/- confidence band in USD (0 when the source has none) */
  conf: number;
  source: "pyth-24/7" | "pyth-us" | "jupiter-stock" | "backpack-perp";
  asOf: string;
  ageSec: number;
  stale: boolean;
  marketState: MarketState;
  /** every reference we could see, for transparency */
  refs: { source: string; price: number; asOf: string }[];
}

export interface VenueQuote {
  token: UniverseToken;
  /** last on-chain print (Jupiter Price v3) */
  lastPx: number | null;
  /** effective USD price at each requested size, null if unroutable */
  effPx: Record<string, number | null>;
  /** deviation of effPx[primary size] from fair value */
  devBps: number | null;
  priceImpactPct: number | null;
  swapType: "aggregator" | "rfq" | null;
  gasless: boolean;
  route: string[];
  error?: string;
}

export interface ParityQuote {
  symbol: string;
  name: string;
  usd: number;
  sizes: number[];
  fair: FairValue;
  venues: VenueQuote[];
  best: string | null;
  worst: string | null;
  /** bps the best route beats the worst route by */
  spreadBps: number | null;
  savedUsd: number | null;
  generatedAt: string;
}
