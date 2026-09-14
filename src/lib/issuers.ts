import type { IssuerId } from "./types";

// Facts here are educational, sourced from each issuer's own documentation.
// Keep the tone neutral: Parity ranks routes by price, never issuers by merit.
export const ISSUERS: Record<
  IssuerId,
  {
    name: string;
    short: string;
    color: string;
    suffix: string;
    issuerEntity: string;
    backing: string;
    redemption: string;
    dividends: string;
    liquidity: string;
    url: string;
  }
> = {
  xstocks: {
    name: "xStocks",
    short: "xStocks",
    color: "#7c5cff",
    suffix: "x",
    issuerEntity: "Backed Assets (Switzerland)",
    backing: "1:1 shares held by a regulated custodian; Swiss-law tracker certificate",
    redemption: "Redeemable for cash value by eligible non-US professional participants",
    dividends: "Reinvested into the token via a multiplier (no cash payout)",
    liquidity: "On-chain AMM pools (Raydium, Meteora, Orca) plus Jupiter RFQ",
    url: "https://xstocks.fi",
  },
  ondo: {
    name: "Ondo Global Markets",
    short: "Ondo",
    color: "#2dd4bf",
    suffix: "on",
    issuerEntity: "Ondo Global Markets",
    backing: "1:1 shares held at US-registered broker-dealers",
    redemption: "Mint/redeem 24/5 through Ondo; not for US persons",
    dividends: "Passed through to token holders",
    liquidity: "Primarily Jupiter RFQ (market-maker quotes), thin AMM pools",
    url: "https://ondo.finance",
  },
  backpack: {
    name: "Backpack Securities",
    short: "Backpack",
    color: "#f59e0b",
    suffix: "",
    issuerEntity: "Backpack Securities (via Sunrise)",
    backing: "1:1 real shares custodied by a US broker-dealer",
    redemption: "Redeemable into a brokerage account via ACATS/DTCC",
    dividends: "Passed through to token holders",
    liquidity: "Sunrise-routed AMM pools plus Backpack spot/perp order books",
    url: "https://backpack.exchange",
  },
};

export const ISSUER_ORDER: IssuerId[] = ["xstocks", "ondo", "backpack"];
