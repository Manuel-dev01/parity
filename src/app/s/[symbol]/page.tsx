import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getUnderlying } from "@/lib/universe";
import { parityQuote } from "@/lib/venues";
import { guardDeployment } from "@/lib/guard";
import { MARKET_LABEL } from "@/lib/market";
import { Sheet } from "@/components/broadsheet/Sheet";
import { Ticker } from "@/components/ticker/Ticker";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ symbol: string }>; searchParams: Promise<{ usd?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const u = getUnderlying(symbol);
  return { title: u ? `${u.symbol} · ${u.name} — Parity` : "Parity" };
}

export default async function TickerPage({ params, searchParams }: Props) {
  const { symbol } = await params;
  const { usd } = await searchParams;
  const u = getUnderlying(symbol);
  if (!u) notFound();
  const size = Math.min(Math.max(Number(usd) || 1000, 1), 100_000);
  // Quoting three issuers can take seconds when Jupiter is slow. Render the page with
  // whatever arrives in time; the client polls on mount and fills in the rest.
  const initial = await Promise.race([
    parityQuote(u, size).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 4000)),
  ]);
  const cluster = guardDeployment()?.cluster ?? null;

  return (
    <Sheet
      dateline={`${u.symbol} · ${u.name} · ${initial ? MARKET_LABEL[initial.fair.marketState] : "—"}`}
      datelineRight={initial ? `Fair value updated ${initial.fair.ageSec}s ago` : undefined}
      active="markets"
    >
      <Ticker underlying={u} initial={initial} guardCluster={cluster} size={size} />
    </Sheet>
  );
}
