// The startup warm-up (decisions.md, 2026-10-17). With BottleCast's traffic nearly every request and
// every cron run starts on a fresh isolate, where V8 still interprets JavaScript. So while the isolate
// starts (the limit is 1 s, not 10 ms), everything a link, an unlink and a cron mint run is run 30
// times, and V8 has optimised it by the first request. It signs with a fixed throwaway key and chain
// id 0, so it never signs a mint that could be sent, and the minter key never signs here at all.
import { base64UrlEncode, bytesToHex, hexToBytes, utf8, type Hex } from "./bytes.ts";
import { checkClaims, parseJwt } from "./auth.ts";
import {
  decodeUint,
  encodeL1FeeUpperBound,
  encodeOwnerOf,
  encodeTokenOfMessage,
  erc6492ValidatorCall,
  isErc6492,
  keccak256,
  mintedTransfer,
  parseAddress,
  parseReceipt,
  personalMessageHash,
  recoverSigner,
  toChecksumAddress,
} from "./eth.ts";
import { decodeDoc, DELETE_FIELD, SERVER_TIME, updateWrite } from "./firestore.ts";
import type { AccessTokens } from "./google-token.ts";
import { HttpError } from "./http.ts";
import { planFinish, planMint, recheck, type InFlight } from "./minter-decide.ts";
import { encodeMintCall, signEip1559 } from "./mint-tx.ts";
import { matchAnswers } from "./rpc.ts";
import type { Secp256k1Wasm } from "./secp256k1-wasm.ts";
import { buildSiweMessage, parseIsoTime, parseSiweMessage, SIWE_STATEMENT } from "./siwe.ts";

export const WARM_UP_ROUNDS = 30;

// Worthless and public: the key signs only these warm-up transactions, for chain id 0.
const THROWAWAY_KEY = keccak256(utf8.encode("bottlecast warm-up key"));
const MESSAGE_ID = "Vb3kQm9TzR2xLp8sWn4E";
// 280 bytes of mixed scripts, the longest text a bottle carries, so the encoding isn't the ASCII case.
const TEXT = fitBytes(
  "Hoy el mar me devolvió algo que creía perdido: la calma. Leave the porch light on for the people still " +
    "finding their way home. If you're reading this, drink some water and text someone you miss. Today the " +
    "sea gave me back something I thought I'd lost: calm. 🌊🌙 Hey, that's pretty cool.",
  280,
);
const ADDRESS: Hex = "0x9a8f2e4b7c6d5a3f1e0b9c8d7a6f5e4d3c2b1a09";
// A throwaway RSA public key, so the ID token check's WebCrypto path runs once; the signature is junk.
const WARM_UP_JWK: JsonWebKey = {
  kty: "RSA",
  e: "AQAB",
  n:
    "wQ4zSOUWsz35BF8WhByISayGA4itqlMeSqo0gEaHUYBeAldl4dDZhAcdcarJH6XV-spH128u7p0dJiGJDSR2CozijnHb8Tde" +
    "BZ7NLsrgZuuHZG8oU3wsr7xZr-amvzs79jEu89lNGamxTEhZSd2KCr0f6sxjx5oOPMaCBBKCPV5T_zNAyMQiyCgALVabu7JE" +
    "0ZzE94JHmLafkgenOdrox4lJu_XADMfwNgcJXc9KAGv8ZTs_Jk6s24Zz-Z5WzCymdiE3IV1QaVvJAX8734KjVBpnWg-fi9NY" +
    "cdf06PmIp8WNUaz6ZYxMxdWXV3YWJHf3O5SmidkL_Oir4D2Yx4jphw",
};

export interface WarmUpKeys {
  nonceKey: Promise<CryptoKey>;
  markKey: Promise<CryptoKey>;
  tokens: AccessTokens | null;
}

/** Runs the hot paths `rounds` times. Throws if anything's wrong, which fails the deploy. */
export function warmUp(secp: Secp256k1Wasm, keys: WarmUpKeys, rounds = WARM_UP_ROUNDS): void {
  const token = sampleToken();
  for (let round = 0; round < rounds; round++) {
    warmMint(secp, round);
    warmLink(secp);
    warmToken(token);
    warmFirestore();
    warmChain(round);
  }
  // WebCrypto is native code, but its first call in a fresh isolate isn't free. These aren't awaited
  // (module scope can't), and workerd settles them before the first request.
  const jwt = parseJwt(token)!;
  Promise.all([
    crypto.subtle
      .importKey("jwk", WARM_UP_JWK, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"])
      .then((key) => crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, jwt.signature, jwt.signingInput)),
    keys.nonceKey.then((key) => crypto.subtle.sign("HMAC", key, utf8.encode("warm-up"))),
    keys.markKey.then((key) => crypto.subtle.sign("HMAC", key, utf8.encode("warm-up"))),
    keys.tokens?.assertion(0),
  ]).catch((error: unknown) => console.error(`Warm-up failed: ${error}`));
}

function warmMint(secp: Secp256k1Wasm, round: number): void {
  const data = encodeMintCall({
    to: hexToBytes(ADDRESS),
    messageId: MESSAGE_ID,
    text: TEXT,
    castAt: 1_791_763_200n,
    penName: "Driftwood",
    writerMark: keccak256(utf8.encode(MESSAGE_ID)),
    glass: 0,
  });
  signEip1559(secp, THROWAWAY_KEY, {
    chainId: 0,
    nonce: round,
    maxPriorityFeePerGas: 1_000_000n,
    maxFeePerGas: 1_200_000n,
    gas: 400_000n,
    to: hexToBytes(ADDRESS),
    value: 0n,
    data,
  });
  encodeTokenOfMessage(MESSAGE_ID);
  encodeOwnerOf(BigInt(round + 1));
  encodeL1FeeUpperBound(data.length + 120);
}

function warmLink(secp: Secp256k1Wasm): void {
  const issuedAt = new Date(1_791_763_200_000).toISOString();
  const message = buildSiweMessage({
    domain: "bottling-messages.web.app",
    address: toChecksumAddress(ADDRESS),
    statement: SIWE_STATEMENT,
    uri: "https://bottling-messages.web.app",
    chainId: 84532,
    nonce: "0123456789abcdef0123456789abcdef",
    issuedAt,
    expirationTime: new Date(1_791_763_800_000).toISOString(),
  });
  const parsed = parseSiweMessage(message);
  if (!parsed || buildSiweMessage(parsed) !== message || Number.isNaN(parseIsoTime(parsed.issuedAt))) {
    throw new Error("Warm-up: SIWE didn't round-trip");
  }
  const hash = personalMessageHash(message);
  const { signature, recoveryId } = secp.signRecoverable(hash, THROWAWAY_KEY);
  const signer = recoverSigner(secp, hash, new Uint8Array([...signature, 27 + recoveryId]));
  if (!signer || !parseAddress(signer)) throw new Error("Warm-up: recovery failed");
  isErc6492(signature);
  erc6492ValidatorCall(ADDRESS, hash, signature);
}

function warmToken(token: string): void {
  const jwt = parseJwt(token);
  if (!jwt) throw new Error("Warm-up: the sample token didn't parse");
  try {
    checkClaims(jwt.payload, "warm-up", 1_791_763_300);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
  }
}

function warmFirestore(): void {
  const doc = decodeDoc({
    name: `projects/warm-up/databases/(default)/documents/claims/${MESSAGE_ID}`,
    updateTime: "2026-10-12T09:00:00.123456Z",
    fields: {
      messageId: { stringValue: MESSAGE_ID },
      keeperUid: { stringValue: "kT7wq2Xr9mZp4LsVb8NcYe3HdQ1a" },
      status: { stringValue: "cooling" },
      keptAt: { timestampValue: "2026-10-12T09:00:00.123456Z" },
      sealAfter: { timestampValue: "2026-10-13T09:00:00Z" },
      to: { stringValue: ADDRESS },
      nonce: { integerValue: "7" },
      inFlight: { mapValue: { fields: { txHashes: { arrayValue: { values: [{ stringValue: ADDRESS }] } } } } },
    },
  });
  updateWrite(doc.name, { status: "minting", txHash: ADDRESS, nonce: 7, delayedSince: DELETE_FIELD, mintedAt: SERVER_TIME });
}

function warmChain(round: number): void {
  const hash = bytesToHex(keccak256(Uint8Array.of(round)));
  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const receipt = parseReceipt({
    transactionHash: hash,
    status: "0x1",
    logs: [{ address: ADDRESS, topics: [transferTopic, `0x${"00".repeat(32)}`, `0x${"00".repeat(12)}${ADDRESS.slice(2)}`, `0x${"00".repeat(31)}01`] }],
  })!;
  mintedTransfer(receipt, ADDRESS);
  matchAnswers(
    [
      { jsonrpc: "2.0", id: 2, result: { baseFeePerGas: ["0x3b9aca00", "0x3b9aca01"] } },
      { jsonrpc: "2.0", id: 1, result: "0x2a" },
      { jsonrpc: "2.0", id: 3, error: { code: 3, message: "execution reverted", data: "0xe2517d3f" } },
    ],
    3,
  );
  decodeUint(`0x${"00".repeat(31)}01`);
  planMint(
    {
      minedNonce: BigInt(round),
      nextBaseFee: 1_000_000n,
      tip: 1_000n,
      balance: 10n ** 17n,
      tokenOfMessage: 0n,
      estimate: { gas: 400_000n },
      l1Fee: 1_000n,
    },
    round,
  );
  const flight: InFlight = {
    messageId: MESSAGE_ID,
    keeperUid: "keeper",
    to: ADDRESS,
    nonce: round,
    txHashes: [hash],
    raw: hash,
    maxFeePerGas: 2_000_000n,
    maxPriorityFeePerGas: 1_000n,
    gas: 400_000n,
    sentAt: 0,
    consumedSince: null,
    cancelled: false,
  };
  planFinish(flight, { receipts: [receipt], minedNonce: BigInt(round), tokenOfMessage: 1n, nextBaseFee: 1n, tip: 1n }, false, 1);
  recheck(
    { id: MESSAGE_ID, keeperUid: "keeper", status: "cooling", to: ADDRESS, delayedSince: null },
    {
      status: "kept",
      keptAt: new Date(0),
      sealable: true,
      userId: "writer",
      text: TEXT,
      penName: "Driftwood",
      createdAt: new Date(0),
    },
    true,
    false,
  );
}

/** A Firebase-shaped token with a junk signature: enough to run the parsing and the claim checks. */
function sampleToken(): string {
  const segment = (json: object) => base64UrlEncode(utf8.encode(JSON.stringify(json)));
  return [
    segment({ alg: "RS256", kid: "warm-up", typ: "JWT" }),
    segment({
      iss: "https://securetoken.google.com/warm-up",
      aud: "warm-up",
      auth_time: 1_791_763_200,
      user_id: "kT7wq2Xr9mZp4LsVb8NcYe3HdQ1a",
      sub: "kT7wq2Xr9mZp4LsVb8NcYe3HdQ1a",
      iat: 1_791_763_200,
      exp: 1_791_766_800,
      firebase: { identities: { "google.com": ["1234567890"] }, sign_in_provider: "google.com" },
    }),
    base64UrlEncode(new Uint8Array(256).fill(7)),
  ].join(".");
}

function fitBytes(text: string, limit: number): string {
  let fitted = "";
  for (const char of text) {
    if (utf8.encode(fitted + char).length > limit) break;
    fitted += char;
  }
  return fitted;
}
