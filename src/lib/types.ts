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
  /** Pyth push-oracle accounts sponsored on mainnet (read directly, no API key) */
  pythOnchain?: { us?: PythOnchainRef; index?: PythOnchainRef };
}

export interface PythOnchainRef {
  address: string;
  shard: number;
  ageSec: number;
  price: number;
}

export interface FairValue {
  price: number;
  /** +/- confidence band in USD (0 when the source has none) */
  conf: number;
  source: "pyth-onchain" | "pyth-24/7" | "pyth-us" | "jupiter-stock" | "backpack-perp";
  /** on-chain PriceUpdateV2 account the guard can verify against, when one exists */
  onchainAccount: string | null;
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
