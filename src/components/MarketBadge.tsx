import { getMarketState, MARKET_LABEL } from "@/lib/market";

export function MarketBadge() {
  const s = getMarketState();
  const live = s === "regular";
  return (
    <span className="hidden xs:inline-flex sm:inline-flex items-center gap-2 text-xs text-muted border border-border rounded-full px-2.5 py-1">
      <span className={`w-1.5 h-1.5 rounded-full ${live ? "bg-accent pulse" : s === "closed" ? "bg-dim" : "bg-warn"}`} />
      {MARKET_LABEL[s]}
    </span>
  );
}
