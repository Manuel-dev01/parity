import type { Metadata } from "next";
import { Sheet } from "@/components/broadsheet/Sheet";
import { Clock } from "@/components/broadsheet/Clock";
import { Holdings } from "@/components/holdings/Holdings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Holdings — Parity" };

export default function HoldingsPage() {
  return (
    <Sheet dateline="Holdings · read from the chain · mainnet" datelineRight={<Clock prefix="Valued at oracle fair value" />} active="holdings">
      <Holdings />
    </Sheet>
  );
}
