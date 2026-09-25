import Link from "next/link";
import type { Metadata } from "next";
import { Sheet } from "@/components/broadsheet/Sheet";
import { guardDeployment } from "@/lib/guard";
import { multiIssuer, universeBuiltAt } from "@/lib/universe";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Methodology — Parity",
  description: "Where every number on Parity comes from, and what it does not know.",
};

const SECTIONS: [string, string, React.ReactNode][] = [
  [
    "01",
    "Fair value",
    <>
      The price of one underlying share, read from Pyth&apos;s sponsored on-chain accounts on mainnet — the same `PriceUpdateV2` accounts any program can verify.
      Parity does not set it and does not average it with its own quotes. When those accounts are not fresh, it falls back in order to Pyth&apos;s 24/7 index feed,
      Jupiter&apos;s stock reference, and Backpack&apos;s perpetual mark, and the ticker names whichever one it used. Outside the US session the reference is
      derived rather than live, its confidence band is wider, and the page says so.
    </>,
  ],
  [
    "02",
    "Executable price, not last price",
    <>
      Each issuer&apos;s token is quoted through Jupiter for the exact amount you entered, so the figure includes price impact and fees. This is what you would
      pay, not what someone last paid. It is why the cheapest token at $1,000 is often not the cheapest at $100,000 — change the size on any ticker and the
      ranking changes with it.
    </>,
  ],
  [
    "03",
    "Deviation, in basis points",
    <>
      Every comparison is <span style={{ fontStyle: "italic" }}>(executable price − fair value) ÷ fair value</span>, in basis points. One basis point is a
      hundredth of a percent, so 50 bps on $10,000 is $50. The input stablecoin is priced too: USDT has quoted $0.9996 during testing, and assuming it was
      exactly a dollar would shift every deviation by about 4 bps.
    </>,
  ],
  [
    "04",
    "The guard, and its two strengths",
    <>
      <b>Checked</b> means Parity verified the quote against fair value before you signed; after signing, your slippage limit governs the fill. <b>Enforced</b>{" "}
      means a program reads the oracle inside the same transaction and reverts the whole trade if the fill lands outside your guard, writing a permanent
      on-chain receipt. Enforced runs on devnet only, because the program is unaudited and unaudited code has no business in the path of real funds. Mainnet
      trades route through Jupiter&apos;s audited programs with the pre-sign check.
    </>,
  ],
  [
    "05",
    "Refusals",
    <>
      If no token fills within your guard, Parity does not build the transaction. Nothing is signed and nothing is spent. It then quotes the sibling issuers and
      a ladder of smaller sizes to offer what would actually work — those options only appear when a real quote passes, so an empty list means the whole market
      is outside your tolerance.
    </>,
  ],
  [
    "06",
    "What Parity does not know",
    <>
      It does not see trades made anywhere else, so Holdings shows balances read from the chain but can only show what you paid for fills it recorded. It does
      not have a long price history: the divergence tape begins when its sampler first ran, and the charts say how many samples they are drawn from. Where a
      figure is missing, the page says it is missing rather than estimating it.
    </>,
  ],
];

export default function Methodology() {
  const cluster = guardDeployment();
  return (
    <Sheet dateline="Methodology · how every figure is produced" datelineRight=" " active="methodology">
      <div style={{ padding: "clamp(24px,3.4cqw,44px) 0 28px", display: "flex", flexDirection: "column", gap: 14 }}>
        <h1 className="serif" style={{ margin: 0, fontSize: "clamp(40px,5.8cqw,84px)", lineHeight: 0.95, letterSpacing: "-0.02em", maxWidth: 1000, textWrap: "balance" }}>
          Every number here is a claim. <span style={{ fontStyle: "italic", color: "var(--vermilion)" }}>This is how each one is made.</span>
        </h1>
        <p style={{ margin: 0, fontSize: "clamp(18px,1.7cqw,22px)", lineHeight: 1.4, maxWidth: 720 }}>
          Parity ranks routes by price and never ranks issuers by merit. The rights each issuer gives you differ and are shown on every ticker, but they do not
          affect the ordering.
        </p>
      </div>

      {SECTIONS.map(([n, title, body]) => (
        <div
          key={n}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(48px,110px) minmax(0,1fr) minmax(0,1.1fr)",
            gap: "8px 32px",
            padding: "24px 0",
            borderTop: "1px solid var(--ink)",
            alignItems: "baseline",
          }}
        >
          <span className="num" style={{ fontSize: 13, color: "var(--vermilion)" }}>
            {n}
          </span>
          <span className="display-mid" style={{ fontSize: "clamp(24px,2.8cqw,38px)", lineHeight: 1.05, letterSpacing: "-0.03em" }}>
            {title}
          </span>
          <span style={{ fontSize: 18, lineHeight: 1.45 }}>{body}</span>
        </div>
      ))}

      <div style={{ borderTop: "3px double var(--ink)", padding: "24px 0 40px", display: "flex", flexWrap: "wrap", gap: "24px 48px" }}>
        <div style={{ flex: "1 1 320px" }}>
          <h2 className="serif" style={{ margin: "0 0 10px", fontSize: 26 }}>
            Sources
          </h2>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 16, lineHeight: 1.6 }}>
            <li>Pyth on-chain price accounts — fair value</li>
            <li>Jupiter Swap &amp; Ultra — quotes and execution</li>
            <li>Backpack public market data — off-hours reference</li>
            <li>Issuer documentation — the rights table</li>
          </ul>
        </div>
        <div style={{ flex: "1 1 320px" }}>
          <h2 className="serif" style={{ margin: "0 0 10px", fontSize: 26 }}>
            Coverage
          </h2>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6 }}>
            {multiIssuer(2).length.toLocaleString()} shares are issued by two or more issuers, out of {multiIssuer(1).length.toLocaleString()} tokenized on
            Solana. Universe last rebuilt {new Date(universeBuiltAt).toISOString().slice(0, 10)}.
            <br />
            Guard program: {cluster ? `${cluster.cluster} · ${cluster.id.toBase58().slice(0, 8)}…` : "not deployed"}.
          </p>
          <p style={{ margin: "10px 0 0", fontSize: 16 }}>
            <Link href="/receipts">Every fill Parity has routed →</Link>
          </p>
        </div>
      </div>
    </Sheet>
  );
}
