import Link from "next/link";
import { Search } from "@/components/Search";
import { IssuerChip } from "@/components/IssuerChip";
import { Bps, usd } from "@/components/Bps";
import { liveBoard } from "@/lib/board";
import { multiIssuer } from "@/lib/universe";
import { ISSUER_ORDER } from "@/lib/issuers";

export const revalidate = 15;

export default async function Home() {
  const rows = await liveBoard(40);
  const total = multiIssuer(1).length;
  const multi = multiIssuer(2).length;
  const triple = multiIssuer(3).length;

  return (
    <div className="pt-14 sm:pt-20">
      <section className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.2em] text-accent mb-4">Tokenized stocks on Solana</p>
        <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.02]">
          Every stock on Solana.
          <br />
          <span className="text-muted">One fair price.</span>
        </h1>
        <p className="mt-6 text-lg text-muted max-w-2xl">
          The same share now trades under three issuers on Solana, and they disagree, sometimes by whole percent. Parity shows the
          fair value, the premium each issuer is charging right now, and buys the cheapest legitimate route in one oracle-guarded
          transaction.
        </p>
        <div className="mt-8">
          <Search autoFocus big />
        </div>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-dim num">
          <span>
            <b className="text-text">{total.toLocaleString()}</b> tokenized US stocks
          </span>
          <span>
            <b className="text-text">{multi}</b> issued by 2+ issuers
          </span>
          <span>
            <b className="text-text">{triple}</b> issued by all three
          </span>
        </div>
      </section>

      <section className="mt-16">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Most mispriced right now</h2>
            <p className="text-sm text-muted mt-1">
              Last on-chain print per issuer vs. the underlying reference price. Open a name for executable quotes at size.
            </p>
          </div>
          <span className="text-xs text-dim hidden sm:block">refreshes every 15s</span>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-dim uppercase tracking-wider">
              <tr className="border-b border-border">
                <th className="text-left font-medium px-4 py-3">Stock</th>
                <th className="text-right font-medium px-4 py-3">Reference</th>
                {ISSUER_ORDER.map((i) => (
                  <th key={i} className="text-right font-medium px-4 py-3">
                    <IssuerChip id={i} />
                  </th>
                ))}
                <th className="text-right font-medium px-4 py-3">Spread</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.symbol} className="border-b border-border/60 last:border-0 hover:bg-surface-2/60 transition">
                  <td className="px-4 py-3">
                    <Link href={`/s/${r.symbol}`} className="flex flex-col">
                      <span className="num font-semibold">{r.symbol}</span>
                      <span className="text-xs text-muted truncate max-w-[180px]">{r.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right num text-muted">{usd(r.ref)}</td>
                  {ISSUER_ORDER.map((i) => {
                    const p = r.prints.filter((x) => x.issuer === i).sort((a, b) => b.liquidity - a.liquidity)[0];
                    return (
                      <td key={i} className="px-4 py-3 text-right">
                        {p?.px != null ? (
                          <div className="flex flex-col items-end">
                            <span className={`num ${r.cheapest === i ? "text-accent" : r.richest === i ? "text-danger" : ""}`}>
                              {usd(p.px)}
                            </span>
                            <Bps v={p.bps} className="text-xs" />
                          </div>
                        ) : (
                          <span className="text-dim">&mdash;</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right">
                    <Bps v={r.spreadBps} className="font-semibold" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
