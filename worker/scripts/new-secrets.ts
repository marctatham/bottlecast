// Makes the Worker's own secrets and hands them straight to `wrangler secret bulk` on stdin, so no
// copy is ever written to disk or shown: the minter key, libsecp256k1's blinding seed, and the keys
// for the verified mark and the SIWE nonce. It prints only the minter's address, which the contract
// deploy names as its minter (contracts/README.md). Deploying needs the owner's OK (CLAUDE.md).
//   node scripts/new-secrets.ts            refuses if the Worker already has a minter key
//   node scripts/new-secrets.ts --replace  a new minter, whose address then needs MINTER_ROLE
// The Firebase project ID and the service account's key are set separately (README.md).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { bytesToHex } from "../src/bytes.ts";
import { addressFromPublicKey, toChecksumAddress } from "../src/eth.ts";
import { instantiateSecp256k1 } from "../src/secp256k1-wasm.ts";

const replace = process.argv.includes("--replace");
const wrangler = new URL("../node_modules/.bin/wrangler", import.meta.url).pathname;
const cwd = new URL("..", import.meta.url).pathname;

const existing = JSON.parse(execFileSync(wrangler, ["secret", "list", "--format", "json"], { cwd, encoding: "utf8" })) as { name: string }[];
if (existing.some((secret) => secret.name === "MINTER_KEY") && !replace) {
  console.error("The Worker already has a minter key. Pass --replace for a new one, then grant it MINTER_ROLE.");
  process.exit(1);
}

const secp = instantiateSecp256k1(
  new WebAssembly.Module(readFileSync(new URL("../node_modules/tiny-secp256k1/lib/secp256k1.wasm", import.meta.url))),
);
// A private key must lie in [1, n); publicKey refuses one that doesn't, and a fresh draw follows.
let minterKey: Uint8Array;
let minter: `0x${string}`;
for (;;) {
  minterKey = crypto.getRandomValues(new Uint8Array(32));
  try {
    minter = addressFromPublicKey(secp.publicKey(minterKey));
    break;
  } catch {
    // out of range: draw again
  }
}
const random32 = () => bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
const secrets = {
  MINTER_KEY: bytesToHex(minterKey),
  SIGNER_SEED: random32(),
  MARK_KEY: random32(),
  NONCE_KEY: random32(),
};
execFileSync(wrangler, ["secret", "bulk"], { cwd, input: JSON.stringify(secrets), stdio: ["pipe", "inherit", "inherit"] });
minterKey.fill(0);
console.log(`\nThe minter's address: ${toChecksumAddress(minter)}`);
