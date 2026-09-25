import { ImageResponse } from "next/og";

export const alt = "Parity — every stock on Solana, one fair price";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#F7F3EB";
const INK = "#1A1512";
const VERMILION = "#C83406";
const INKS = ["#F72FA7", "#FFDC3A", "#00C5EE"];

/** The share card: the same misregistration idea the landing page opens with. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: PAPER,
          color: INK,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, letterSpacing: 2, textTransform: "uppercase" }}>
          <span>Parity</span>
          <span>Tokenized US stocks · Solana</span>
        </div>

        {/* three inks, out of register */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 8 }}>
          {INKS.map((c, i) => (
            <div key={c} style={{ display: "flex", marginLeft: [56, 0, 30][i] }}>
              <div style={{ width: 620, height: 26, background: c }} />
            </div>
          ))}
          <div style={{ display: "flex", width: 700, height: 3, background: INK, marginTop: 14 }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 76, lineHeight: 1.05, letterSpacing: -1.5 }}>
            One share, printed three times.
          </div>
          <div style={{ fontSize: 40, color: VERMILION, fontStyle: "italic" }}>None of them line up.</div>
          <div style={{ fontSize: 26, color: "#4C4642", marginTop: 8 }}>
            Fair value, every issuer&apos;s real price at your size, and a guard that refuses the trade.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
