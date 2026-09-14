import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getUnderlying } from "@/lib/universe";
import { parityQuote } from "@/lib/venues";
import { Ticker } from "@/components/Ticker";

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
  const size = Math.min(Math.max(Number(usd) || 1000, 1), 1_000_000);
  const initial = await parityQuote(u, size).catch(() => null);
  return <Ticker underlying={u} initial={initial} usd={size} />;
}
