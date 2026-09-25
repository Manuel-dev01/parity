import type { Metadata } from "next";
import "./globals.css";
import { Wallet } from "@/components/wallet/Wallet";

export const metadata: Metadata = {
  title: "Parity — every stock on Solana, one fair price",
  description:
    "Every US stock now exists two or three times on Solana, and the prices disagree. Parity measures each against the oracle fair price, shows what it really costs at your size, and buys the closest in one transaction.",
};

// Loaded by <link> rather than next/font: the build machine is bandwidth-limited and
// Turbopack's font fetch is the flakiest step in the pipeline. Axes matter — Archivo
// needs wdth for the font-stretch display sizes, Newsreader needs opsz.
const FONTS =
  "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=IBM+Plex+Mono:wght@400;500&family=Archivo:wdth,wght@62..125,400..900&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href={FONTS} rel="stylesheet" />
      </head>
      <body>
        <Wallet>{children}</Wallet>
      </body>
    </html>
  );
}
