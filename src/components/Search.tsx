"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Underlying } from "@/lib/types";
import { IssuerChip } from "./IssuerChip";

export function Search({ autoFocus = false, big = false }: { autoFocus?: boolean; big?: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Underlying[]>([]);
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    const c = new AbortController();
    fetch(`/api/v1/universe?q=${encodeURIComponent(q)}&limit=8`, { signal: c.signal })
      .then((r) => r.json())
      .then((j) => {
        setHits(j.underlyings ?? []);
        setI(0);
      })
      .catch(() => {});
    return () => c.abort();
  }, [q]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, []);

  const go = (sym: string) => {
    setOpen(false);
    setQ("");
    router.push(`/s/${sym}`);
  };

  return (
    <div ref={box} className="relative w-full">
      <input
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setI((x) => Math.min(x + 1, hits.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setI((x) => Math.max(x - 1, 0));
          }
          if (e.key === "Enter") {
            const h = hits[i] ?? hits[0];
            if (h) go(h.symbol);
            else if (q.trim()) go(q.trim().toUpperCase());
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search a US stock: NVDA, SPCX, AAPL, SPY"
        className={`w-full card outline-none focus:border-accent/60 placeholder:text-dim transition ${big ? "text-lg px-5 py-4" : "text-sm px-4 py-2.5"}`}
        spellCheck={false}
      />
      {open && hits.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-2 card overflow-hidden shadow-2xl">
          {hits.map((h, k) => (
            <li key={h.symbol}>
              <button
                onMouseEnter={() => setI(k)}
                onClick={() => go(h.symbol)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${k === i ? "bg-surface-2" : ""}`}
              >
                <span className="num font-semibold w-16">{h.symbol}</span>
                <span className="text-sm text-muted truncate flex-1">{h.name}</span>
                <span className="flex gap-1">
                  {h.issuers.map((x) => (
                    <IssuerChip key={x} id={x} />
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
