// Jupiter execution client. Keyless lite-api by default; JUPITER_API_KEY switches to api.jup.ag.
import { PublicKey, TransactionInstruction } from "@solana/web3.js";

const KEY = process.env.JUPITER_API_KEY;
/** Keyless lite-api is heavily rate-limited; a free key from portal.jup.ag lifts the ceiling. */
export const JUP_BASE = KEY ? "https://api.jup.ag" : "https://lite-api.jup.ag";
export const jupHeaders = (): Record<string, string> => (KEY ? { "x-api-key": KEY } : {});
const BASE = JUP_BASE;
const headers: Record<string, string> = { "content-type": "application/json", ...jupHeaders() };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  // Nothing upstream is allowed to hang a render: every call is bounded.
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string>) },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; errorMessage?: string; errorCode?: string };
  if (!r.ok || j.error || j.errorMessage) throw new JupiterError(j.error || j.errorMessage || `jupiter ${r.status}`, j.errorCode ?? String(r.status));
  return j;
}

export class JupiterError extends Error {
  constructor(msg: string, public code: string) {
    super(msg);
  }
}

export interface UltraOrder {
  requestId: string;
  transaction: string | null;
  inAmount: string;
  outAmount: string;
  priceImpactPct?: string | number;
  swapType?: "aggregator" | "rfq";
  gasless?: boolean;
  slippageBps?: number;
  routePlan?: { swapInfo?: { label?: string } }[];
}

export function ultraOrder(p: { inputMint: string; outputMint: string; amount: number; taker: string }) {
  const qs = new URLSearchParams({ inputMint: p.inputMint, outputMint: p.outputMint, amount: String(p.amount), taker: p.taker });
  return call<UltraOrder>(`/ultra/v1/order?${qs}`);
}

export interface UltraExecute {
  status: "Success" | "Failed";
  signature?: string;
  code?: number;
  error?: string;
  inputAmountResult?: string;
  outputAmountResult?: string;
}

export function ultraExecute(p: { signedTransaction: string; requestId: string }) {
  return call<UltraExecute>(`/ultra/v1/execute`, { method: "POST", body: JSON.stringify(p) });
}

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: { swapInfo?: { label?: string } }[];
}

export function swapQuote(p: { inputMint: string; outputMint: string; amount: number; slippageBps: number }) {
  const qs = new URLSearchParams({
    inputMint: p.inputMint,
    outputMint: p.outputMint,
    amount: String(p.amount),
    slippageBps: String(p.slippageBps),
    // keep the account count low so the guard's two instructions fit alongside the route
    maxAccounts: "40",
  });
  return call<SwapQuote>(`/swap/v1/quote?${qs}`);
}

type JsonIx = { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string };

interface SwapInstructionsRaw {
  computeBudgetInstructions: JsonIx[];
  setupInstructions: JsonIx[];
  swapInstruction: JsonIx;
  cleanupInstruction: JsonIx | null;
  otherInstructions?: JsonIx[];
  addressLookupTableAddresses: string[];
}

export interface SwapInstructions {
  computeBudget: TransactionInstruction[];
  setup: TransactionInstruction[];
  swap: TransactionInstruction;
  cleanup: TransactionInstruction | null;
  other: TransactionInstruction[];
  lookupTables: string[];
}

const toIx = (i: JsonIx) =>
  new TransactionInstruction({
    programId: new PublicKey(i.programId),
    keys: i.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
    data: Buffer.from(i.data, "base64"),
  });

export async function swapInstructions(p: { quoteResponse: SwapQuote; userPublicKey: string }): Promise<SwapInstructions> {
  const r = await call<SwapInstructionsRaw>(`/swap/v1/swap-instructions`, {
    method: "POST",
    body: JSON.stringify({
      quoteResponse: p.quoteResponse,
      userPublicKey: p.userPublicKey,
      wrapAndUnwrapSol: false,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { priorityLevel: "medium", maxLamports: 2_000_000 } },
    }),
  });
  return {
    computeBudget: (r.computeBudgetInstructions ?? []).map(toIx),
    setup: (r.setupInstructions ?? []).map(toIx),
    swap: toIx(r.swapInstruction),
    cleanup: r.cleanupInstruction ? toIx(r.cleanupInstruction) : null,
    other: (r.otherInstructions ?? []).map(toIx),
    lookupTables: r.addressLookupTableAddresses ?? [],
  };
}
