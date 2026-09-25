import Link from "next/link";
import { Sheet } from "@/components/broadsheet/Sheet";

export default function NotFound() {
  return (
    <Sheet dateline="Not found" datelineRight=" ">
      <div style={{ padding: "clamp(40px,6cqw,96px) 0", maxWidth: 640, display: "flex", flexDirection: "column", gap: 14 }}>
        <h1 className="serif" style={{ margin: 0, fontSize: "clamp(40px,5.8cqw,84px)", lineHeight: 0.95, letterSpacing: "-0.02em" }}>
          No tokenized version of that stock yet.
        </h1>
        <p style={{ margin: 0, fontSize: "clamp(18px,1.7cqw,22px)", lineHeight: 1.4 }}>
          Parity tracks every US stock issued on Solana by xStocks, Ondo and Backpack Securities. Try another ticker, or{" "}
          <Link href="/markets">browse the markets</Link>.
        </p>
      </div>
    </Sheet>
  );
}
