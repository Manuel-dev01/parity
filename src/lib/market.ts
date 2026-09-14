import type { MarketState } from "./types";

// US equity sessions in America/New_York, mirroring Backpack's /market-sessions:
// pre 04:00-09:30, regular 09:30-16:00, post 16:00-20:00, overnight 20:00-04:00 (Sun 20:00 → Fri 20:00).
const HOLIDAYS_2026 = new Set(["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"]);

function nyParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { dow, ymd: `${p.year}-${p.month}-${p.day}`, mins: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

export function getMarketState(now = new Date()): MarketState {
  const { dow, ymd, mins } = nyParts(now);
  const holiday = HOLIDAYS_2026.has(ymd);
  if (dow === 6) return "closed";
  if (dow === 0) return mins >= 20 * 60 ? "overnight" : "closed";
  if (holiday) return mins >= 20 * 60 && dow !== 5 ? "overnight" : "closed";
  if (mins < 4 * 60) return "overnight";
  if (mins < 9 * 60 + 30) return "pre";
  if (mins < 16 * 60) return "regular";
  if (mins < 20 * 60) return "post";
  return dow === 5 ? "closed" : "overnight";
}

export const MARKET_LABEL: Record<MarketState, string> = {
  regular: "US market open",
  pre: "Pre-market",
  post: "After hours",
  overnight: "Overnight session",
  closed: "US market closed",
};
