"use client";
import { useEffect, useRef, useState } from "react";
import type { IssuerId, ParityQuote } from "@/lib/types";
import type { HeroToken } from "./Hero";

/** Series are told apart by dash pattern, not colour — the chart is printed in one ink. */
const DASH: Record<IssuerId, number[]> = { ondo: [], xstocks: [10, 6], backpack: [2, 4] };
const SAMPLE_MS = 3000;
const MAX_SAMPLES = 400;

type Series = { issuer: IssuerId; token: string; pts: number[] };

/**
 * Deviation from fair for each token, sampled live. The window is the length of this
 * visit — there is no stored per-second history behind it, and the caption says so.
 */
export function Fig1({ symbol, initial }: { symbol: string; initial: HeroToken[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const series = useRef<Series[]>(initial.map((t) => ({ issuer: t.issuer, token: t.token, pts: t.bps == null ? [] : [t.bps] })));
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let dead = false;
    const poll = async () => {
      try {
        const r = await fetch(`/api/v1/quote?symbol=${symbol}&usd=1000`, { cache: "no-store" });
        const q = (await r.json()) as ParityQuote;
        if (dead || !q.venues) return;
        for (const v of q.venues) {
          if (v.devBps == null) continue;
          let s = series.current.find((x) => x.issuer === v.token.issuer);
          if (!s) {
            s = { issuer: v.token.issuer, token: v.token.symbol, pts: [] };
            series.current.push(s);
          }
          s.pts.push(v.devBps);
          if (s.pts.length > MAX_SAMPLES) s.pts.shift();
        }
        setElapsed((e) => e + SAMPLE_MS / 1000);
      } catch {
        /* skip this sample */
      }
    };
    const t = setInterval(poll, SAMPLE_MS);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [symbol]);

  useEffect(() => {
    const c = canvas.current;
    const outer = wrap.current;
    if (!c || !outer) return;
    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0 });
    io.observe(outer);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!visible) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = outer.clientWidth;
      const H = outer.clientHeight;
      if (!W || !H) return;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
      }
      const g = c.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);

      const ink = "rgb(52,44,36)";
      const ver = "rgb(214,72,38)";
      const mid = H / 2;
      const sc = (H / 2 - 20) / 110; // ±110 bps fills the height
      const right = W - 120; // reserve the right edge for head labels
      const step = 2;

      g.fillStyle = "rgba(214,72,38,0.09)";
      g.fillRect(0, mid - 50 * sc, right, 100 * sc);
      g.strokeStyle = "rgba(214,72,38,0.5)";
      g.lineWidth = 1;
      g.setLineDash([3, 3]);
      for (const s of [-50, 50]) {
        g.beginPath();
        g.moveTo(0, mid + s * sc);
        g.lineTo(right, mid + s * sc);
        g.stroke();
      }
      g.setLineDash([]);
      g.strokeStyle = "rgba(52,44,36,0.12)";
      for (let x = right; x > 0; x -= 120) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, H);
        g.stroke();
      }
      g.strokeStyle = ink;
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(0, mid);
      g.lineTo(right, mid);
      g.stroke();

      const heads: { y: number; text: string; off: boolean }[] = [];
      for (const s of series.current) {
        if (!s.pts.length) continue;
        const n = Math.min(s.pts.length, Math.floor(right / step));
        const slice = s.pts.slice(-n);
        g.strokeStyle = ink;
        g.lineWidth = 1.6;
        g.setLineDash(DASH[s.issuer]);
        g.beginPath();
        slice.forEach((v, i) => {
          const x = right - (slice.length - 1 - i) * step;
          const y = mid - v * sc;
          i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        });
        g.stroke();
        g.setLineDash([]);
        const last = slice[slice.length - 1];
        const y = mid - last * sc;
        const off = Math.abs(last) > 50;
        g.fillStyle = off ? ver : ink;
        g.beginPath();
        g.arc(right, y, 3.5, 0, Math.PI * 2);
        g.fill();
        heads.push({ y, text: `${s.token} ${last > 0 ? "+" : last < 0 ? "−" : "±"}${Math.abs(Math.round(last))}`, off });
      }
      // de-collide the head labels
      heads.sort((a, b) => a.y - b.y);
      for (let i = 1; i < heads.length; i++) if (heads[i].y - heads[i - 1].y < 16) heads[i].y = heads[i - 1].y + 16;
      g.font = "12px ui-monospace, monospace";
      g.textBaseline = "middle";
      for (const h of heads) {
        g.fillStyle = h.off ? ver : ink;
        g.fillText(h.text, right + 10, h.y);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  const mins = Math.floor(elapsed / 60);
  const window_ = elapsed < 60 ? `${Math.round(elapsed)} seconds` : `${mins} minute${mins === 1 ? "" : "s"}`;

  return (
    <div style={{ padding: "28px 0 10px", borderBottom: "1px solid var(--ink)" }}>
      <div ref={wrap} style={{ width: "100%", height: "clamp(240px,26cqw,360px)", position: "relative" }}>
        <canvas ref={canvas} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "4px 24px", flexWrap: "wrap", fontSize: 14, fontStyle: "italic", color: "var(--muted)", paddingTop: 8 }}>
        <span>
          <span style={{ fontStyle: "normal", fontWeight: 500 }}>Fig. 1</span> The same {series.current.length} tokens over the last {window_}, distance from oracle fair
          value. Sampled since you opened this page. Shaded band: a ±50 bps guard.
        </span>
        <span className="num" style={{ fontSize: 12, fontStyle: "normal" }}>
          {series.current.map((s, i) => `${i === 0 ? "—" : i === 1 ? "– –" : "···"} ${s.token}`).join("   ")}
        </span>
      </div>
    </div>
  );
}
