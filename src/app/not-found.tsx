import Link from "next/link";
import { Search } from "@/components/Search";

export default function NotFound() {
  return (
    <div className="pt-24 max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight">No tokenized version of that stock yet</h1>
      <p className="mt-3 text-muted">
        Parity tracks every US stock issued on Solana by xStocks, Ondo and Backpack Securities. Try another ticker, or{" "}
        <Link href="/" className="underline">
          browse the board
        </Link>
        .
      </p>
      <div className="mt-6">
        <Search autoFocus />
      </div>
    </div>
  );
}
