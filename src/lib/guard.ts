// Client-side encoders for the fair_fill_guard program (programs/fair_fill_guard).
// Server-only: uses node:crypto for Anchor discriminators. No IDL needed — the account
// order and arg layout mirror lib.rs exactly, and discriminators are sha256("global:<ix>")[..8].
//
// Written against the nonce-seeded Receipt (docs/PROGRAM_PATCH.md): the client picks a random
// u64 per trade, passes it to `snapshot`, and derives the Receipt PDA from it up front.
import { createHash, randomBytes } from "node:crypto";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import type { IssuerId } from "./types";

export const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const ASSOCIATED_TOKEN_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

const PLACEHOLDER_ID = "FFGuardPARiTy1111111111111111111111111111111";

export type GuardCluster = "devnet" | "mainnet";

/** Where fair_fill_guard currently lives, if anywhere. Unaudited, so devnet by default. */
export function guardDeployment(): { id: PublicKey; cluster: GuardCluster } | null {
  const id = process.env.NEXT_PUBLIC_GUARD_PROGRAM_ID;
  if (!id || id === PLACEHOLDER_ID) return null;
  const cluster: GuardCluster = process.env.NEXT_PUBLIC_GUARD_CLUSTER === "mainnet" ? "mainnet" : "devnet";
  try {
    return { id: new PublicKey(id), cluster };
  } catch {
    return null;
  }
}

/**
 * The program id to compose into a mainnet buy — null while the guard is only on devnet.
 * A devnet program cannot be called from a mainnet transaction, so mainnet fills fall back
 * to the pre-sign fair-value check until the program is audited and deployed to mainnet.
 */
export function mainnetGuardProgram(): PublicKey | null {
  const d = guardDeployment();
  return d?.cluster === "mainnet" ? d.id : null;
}

export const GUARD_DEFAULTS = { maxConfBps: 50, maxAgeSecRegular: 120, maxAgeSecOffHours: 900 };

const discriminator = (ix: string) => createHash("sha256").update(`global:${ix}`).digest().subarray(0, 8);

export const newNonce = (): bigint => randomBytes(8).readBigUInt64LE();

const u64le = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
};

export function deriveAta(owner: PublicKey, mint: PublicKey, tokenProgram: PublicKey) {
  return PublicKey.findProgramAddressSync([owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM)[0];
}

export function deriveSnapshotPda(programId: PublicKey, owner: PublicKey, outMint: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("snapshot"), owner.toBuffer(), outMint.toBuffer()], programId)[0];
}

export function deriveReceiptPda(programId: PublicKey, owner: PublicKey, outMint: PublicKey, nonce: bigint) {
  return PublicKey.findProgramAddressSync([Buffer.from("receipt"), owner.toBuffer(), outMint.toBuffer(), u64le(nonce)], programId)[0];
}

export function feedIdFromHex(hex: string): Buffer {
  const h = hex.replace(/^0x/, "");
  if (h.length !== 64) throw new Error(`pyth feed id must be 32 bytes, got ${h}`);
  return Buffer.from(h, "hex");
}

export const issuerCode = (i: IssuerId): number => ({ xstocks: 0, ondo: 1, backpack: 2 })[i];

export function buildSnapshotIx(p: { programId: PublicKey; owner: PublicKey; inAta: PublicKey; outAta: PublicKey; snapshotPda: PublicKey; nonce: bigint }) {
  return new TransactionInstruction({
    programId: p.programId,
    keys: [
      { pubkey: p.owner, isSigner: true, isWritable: true },
      { pubkey: p.inAta, isSigner: false, isWritable: false },
      { pubkey: p.outAta, isSigner: false, isWritable: false },
      { pubkey: p.snapshotPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([discriminator("snapshot"), u64le(p.nonce)]),
  });
}

export interface VerifyParams {
  programId: PublicKey;
  owner: PublicKey;
  inAta: PublicKey;
  outAta: PublicKey;
  inMint: PublicKey;
  outMint: PublicKey;
  snapshotPda: PublicKey;
  priceUpdate: PublicKey;
  receiptPda: PublicKey;
  feedId: Buffer;
  maxDevBps: number;
  maxConfBps: number;
  maxAgeSec: number;
  issuer: IssuerId;
}

export function buildVerifyIx(p: VerifyParams) {
  const args = Buffer.alloc(32 + 2 + 2 + 8 + 1);
  p.feedId.copy(args, 0);
  args.writeUInt16LE(p.maxDevBps, 32);
  args.writeUInt16LE(p.maxConfBps, 34);
  args.writeBigUInt64LE(BigInt(p.maxAgeSec), 36);
  args.writeUInt8(issuerCode(p.issuer), 44);
  return new TransactionInstruction({
    programId: p.programId,
    keys: [
      { pubkey: p.owner, isSigner: true, isWritable: true },
      { pubkey: p.inAta, isSigner: false, isWritable: false },
      { pubkey: p.outAta, isSigner: false, isWritable: false },
      { pubkey: p.inMint, isSigner: false, isWritable: false },
      { pubkey: p.outMint, isSigner: false, isWritable: false },
      { pubkey: p.snapshotPda, isSigner: false, isWritable: true },
      { pubkey: p.priceUpdate, isSigner: false, isWritable: false },
      { pubkey: p.receiptPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([discriminator("verify"), args]),
  });
}
