"use client";
import { useEffect, useRef } from "react";

export interface TapeItem {
  symbol: string;
  spreadBps: number;
}

/** 40px/s, paused when off-screen. Duplicated once so the wrap is seamless. */
export function Marquee({ items }: { items: TapeItem[] }) {
  const track = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = track.current;
    const outer = box.current;
    if (!el || !outer || !items.length) return;
    let x = 0;
    let last = 0;
    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0 });
    io.observe(outer);
    const step = (t: number) => {
      if (last && visible) {
        x -= (t - last) * 0.04;
        const half = el.scrollWidth / 2;
        if (half && -x >= half) x += half;
        el.style.transform = `translateX(${x}px)`;
      }
      last = t;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [items]);

  if (!items.length) return null;

  return (
    <div ref={box} style={{ borderTop: "3px double var(--ink)", borderBottom: "1px solid var(--ink)", overflow: "hidden", padding: "12px 0" }}>
      <div ref={track} style={{ display: "flex", gap: 48, whiteSpace: "nowrap", willChange: "transform", width: "max-content", fontFamily: "'IBM Plex Mono', monospace", fontSize: 14 }}>
        {[...items, ...items].map((it, i) => (
          <span key={i}>
            <span style={{ fontWeight: 500 }}>{it.symbol}</span> <span style={{ color: "var(--muted)" }}>spread</span> {it.spreadBps} bps
          </span>
        ))}
      </div>
    </div>
  );
}
