"use client";
import { useEffect, useState } from "react";

const hhmmss = (d: Date, utc = false) =>
  [utc ? d.getUTCHours() : d.getHours(), utc ? d.getUTCMinutes() : d.getMinutes(), utc ? d.getUTCSeconds() : d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");

/**
 * Rendered empty on the server and filled on mount: the time is the one thing on a
 * server-rendered page guaranteed to mismatch the client.
 */
export function Clock({ prefix, utc = false, withDate = false }: { prefix?: string; utc?: boolean; withDate?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <span style={{ visibility: "hidden" }}>00:00:00</span>;
  const date = withDate ? now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) + " · " : "";
  return (
    <span>
      {prefix ? `${prefix} · ` : ""}
      {date}
      {hhmmss(now, utc)}
      {utc ? " UTC" : ""}
    </span>
  );
}
