"use client";

export interface Source {
  title: string;
  rows: [string, string][];
  note: string;
  /** explorer link, when the figure is backed by an on-chain account */
  verify?: string;
}

/**
 * "Where this figure comes from". Every dotted figure on the ticker opens one of these —
 * the design's answer to the fact that each number on screen is a claim.
 */
export function SourcePopover({ source, x, y, onClose }: { source: Source; x: number; y: number; onClose: () => void }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 330,
        maxWidth: "calc(100% - 24px)",
        zIndex: 20,
        background: "var(--slip)",
        border: "1px solid var(--ink)",
        boxShadow: "6px 6px 0 var(--popover-shadow)",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderBottom: "1px solid var(--ink)", paddingBottom: 8 }}>
        <span className="label label-loose">Where this figure comes from</span>
        <button onClick={onClose} aria-label="Close" style={{ font: "inherit", fontSize: 18, background: "none", border: "none", cursor: "pointer", color: "var(--ink)", lineHeight: 1 }}>
          ×
        </button>
      </div>
      <div className="serif" style={{ fontSize: 24 }}>
        {source.title}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 12px", fontSize: 14 }}>
        {source.rows.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <span style={{ color: "var(--muted)" }}>{k}</span>
            <span className="num" style={{ fontSize: 12, textAlign: "right", wordBreak: "break-all" }}>
              {v}
            </span>
          </div>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 14, fontStyle: "italic", color: "var(--muted)" }}>{source.note}</p>
      <div style={{ display: "flex", gap: 16, borderTop: "1px solid var(--rule)", paddingTop: 8, fontSize: 14 }}>
        {source.verify && (
          <a href={source.verify} target="_blank" rel="noreferrer">
            Verify on explorer ↗
          </a>
        )}
        <a href="/methodology">Methodology</a>
      </div>
    </div>
  );
}
