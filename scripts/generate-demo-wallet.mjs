// Generates a throwaway mainnet keypair for scripted execution tests and stores it in .env
// as DEMO_WALLET_SECRET_KEY (base58). Refuses to overwrite an existing key.
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { existsSync, readFileSync, appendFileSync } from "node:fs";

const env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const existing = env.match(/^DEMO_WALLET_SECRET_KEY=(.+)$/m);
if (existing) {
  const kp = Keypair.fromSecretKey(bs58.decode(existing[1].trim()));
  console.log(`DEMO_WALLET_SECRET_KEY already set. Address: ${kp.publicKey.toBase58()}`);
  process.exit(0);
}
const kp = Keypair.generate();
appendFileSync(".env", `${env.endsWith("\n") || !env ? "" : "\n"}DEMO_WALLET_SECRET_KEY=${bs58.encode(kp.secretKey)}\n`);
console.log(`Demo wallet address: ${kp.publicKey.toBase58()}`);
