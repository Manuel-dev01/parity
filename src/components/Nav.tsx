import Link from "next/link";
import { MarketBadge } from "./MarketBadge";
import { WalletButton } from "./wallet/WalletButton";

export function Nav() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-bg/70 border-b border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent shadow-[0_0_12px_rgba(53,224,161,0.8)]" />
          Parity
        </Link>
        <nav className="hidden sm:flex items-center gap-4 text-sm text-muted">
          <Link href="/" className="hover:text-text">Board</Link>
          <Link href="/tape" className="hover:text-text">Tape</Link>
          <Link href="/api/v1/quote?symbol=NVDA&usd=1000" className="hover:text-text">API</Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <MarketBadge />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
