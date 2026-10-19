// A first read on this machine of the Worker's hot paths, before anything is deployed: each one's
// first call in a fresh process, then its cost over many calls. Cloudflare's CPUs differ, and only
// the deployed Worker's cold figures count (README.md), so this is a guide, not the measurement.
//   node bench/local.ts [calls]
import { readFileSync } from "node:fs";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { checkClaims, parseJwt } from "../src/auth.ts";
import { hexToBytes, type Hex } from "../src/bytes.ts";
import { decodeDoc, DELETE_FIELD, SERVER_TIME, updateWrite } from "../src/firestore.ts";
import { personalMessageHash, recoverSigner, toChecksumAddress } from "../src/eth.ts";
import { writerMark } from "../src/minter.ts";
import { encodeMintCall, signEip1559 } from "../src/mint-tx.ts";
import { instantiateSecp256k1 } from "../src/secp256k1-wasm.ts";
import { buildSiweMessage, parseSiweMessage, SIWE_STATEMENT, siweNonce } from "../src/siwe.ts";

const calls = Number(process.argv[2] ?? 500);
const wasm = readFileSync(new URL("../node_modules/tiny-secp256k1/lib/secp256k1.wasm", import.meta.url));
const secp = instantiateSecp256k1(new WebAssembly.Module(wasm), crypto.getRandomValues(new Uint8Array(32)));
const minterKey = hexToBytes(generatePrivateKey());
const wallet = privateKeyToAccount(generatePrivateKey());
const hmacKey = await crypto.subtle.importKey("raw", crypto.getRandomValues(new Uint8Array(32)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
const text = "Leave the porch light on for the people still finding their way home. ".repeat(4).slice(0, 280);
const issuedAt = new Date().toISOString();
const message = buildSiweMessage({
  domain: "bottling-messages.web.app",
  address: toChecksumAddress(wallet.address.toLowerCase() as Hex),
  statement: SIWE_STATEMENT,
  uri: "https://bottling-messages.web.app",
  chainId: 84532,
  nonce: await siweNonce(hmacKey, "kT7wq2Xr9mZp4LsVb8NcYe3HdQ1a", wallet.address.toLowerCase() as Hex, issuedAt),
  issuedAt,
  expirationTime: new Date(Date.now() + 600_000).toISOString(),
});
const signature = hexToBytes(await wallet.signMessage({ message }));
const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
const rsaKey = await crypto.subtle.importKey("jwk", await exportJWK(publicKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
const token = await new SignJWT({ auth_time: Math.floor(Date.now() / 1000), firebase: { identities: { "google.com": ["1"] } } })
  .setProtectedHeader({ alg: "RS256", kid: "bench" })
  .setIssuer("https://securetoken.google.com/demo-bottlecast")
  .setAudience("demo-bottlecast")
  .setSubject("kT7wq2Xr9mZp4LsVb8NcYe3HdQ1a")
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(privateKey);

type Op = () => unknown;
const ops: Record<string, Op> = {
  mint: () =>
    signEip1559(secp, minterKey, {
      chainId: 84532,
      nonce: 7,
      maxPriorityFeePerGas: 1_000_000n,
      maxFeePerGas: 2_000_000n,
      gas: 480_000n,
      to: hexToBytes(wallet.address),
      value: 0n,
      data: encodeMintCall({
        to: hexToBytes(wallet.address),
        messageId: "Vb3kQm9TzR2xLp8sWn4E",
        text,
        castAt: 1_791_763_200n,
        penName: "Driftwood",
        writerMark: new Uint8Array(32),
        glass: 0,
      }),
    }),
  siwe: () => {
    const fields = parseSiweMessage(message)!;
    if (buildSiweMessage(fields) !== message) throw new Error("SIWE didn't round-trip");
    return recoverSigner(secp, personalMessageHash(message), signature);
  },
  idtoken: async () => {
    const jwt = parseJwt(token)!;
    if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", rsaKey, jwt.signature, jwt.signingInput))) throw new Error("bad");
    return checkClaims(jwt.payload, "demo-bottlecast", Math.floor(Date.now() / 1000));
  },
  nonce: () => siweNonce(hmacKey, "kT7wq2Xr9mZp4LsVb8NcYe3HdQ1a", wallet.address.toLowerCase() as Hex, issuedAt),
  mark: () => writerMark(hmacKey, "kT7wq2Xr9mZp4LsVb8NcYe3HdQ1a", "Vb3kQm9TzR2xLp8sWn4E"),
  firestore: () => {
    const doc = decodeDoc({
      name: "projects/p/databases/(default)/documents/claims/Vb3kQm9TzR2xLp8sWn4E",
      updateTime: "2026-10-12T09:00:00.123456Z",
      fields: { status: { stringValue: "cooling" }, sealAfter: { timestampValue: "2026-10-13T09:00:00Z" }, nonce: { integerValue: "7" } },
    });
    return updateWrite(doc.name, { status: "minting", nonce: 7, delayedSince: DELETE_FIELD, mintedAt: SERVER_TIME });
  },
};

console.log(`op          first CPU   p50 CPU   p99 CPU   max CPU   (ms, ${calls} calls)`);
for (const [name, op] of Object.entries(ops)) {
  const first = await measure(op);
  const samples: number[] = [];
  for (let i = 0; i < calls; i++) samples.push(await measure(op));
  samples.sort((a, b) => a - b);
  const at = (q: number) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
  console.log([name.padEnd(10), first, at(0.5), at(0.99), samples[samples.length - 1]].map((v) => (typeof v === "number" ? v.toFixed(2).padStart(9) : v)).join(" "));
}

async function measure(op: Op): Promise<number> {
  const cpu = process.cpuUsage();
  await op();
  const used = process.cpuUsage(cpu);
  return (used.user + used.system) / 1000;
}
