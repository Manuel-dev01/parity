import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Wallet } from "@/components/wallet/Wallet";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Parity — every stock on Solana, one fair price",
  description: "Every US stock now exists three times on Solana. Parity finds the fair price, shows which issuer is mispriced, and buys the right one — guarded by the oracle on-chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Wallet>
          <Nav />
          <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pb-16">{children}</main>
          <footer className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 text-xs text-dim flex flex-wrap gap-x-6 gap-y-2">
            <span>Parity · built for Stocklana 2026</span>
            <span>Reference prices: Pyth, Jupiter, Backpack · Execution: Jupiter Ultra / Swap API</span>
            <span>Not investment advice. Tokenized securities carry issuer-specific eligibility rules.</span>
          </footer>
        </Wallet>
      </body>
    </html>
  );
}
