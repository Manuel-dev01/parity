import { ISSUERS } from "@/lib/issuers";
import type { IssuerId } from "@/lib/types";

export function IssuerChip({ id, size = "sm" }: { id: IssuerId; size?: "sm" | "md" }) {
  const i = ISSUERS[id];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1"}`}
      style={{ borderColor: i.color + "55", color: i.color, background: i.color + "12" }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: i.color }} />
      {i.short}
    </span>
  );
}
