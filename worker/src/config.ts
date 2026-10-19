// What the Worker runs with: the public vars in wrangler.jsonc, and the secrets set with
// `wrangler secret` (README.md). Read once per isolate. A missing secret doesn't stop the Worker
// starting, since the first deploy comes before its secrets: its routes answer `not_configured` and
// the cron does nothing until they're all there.
import { hexToBytes, type Hex } from "./bytes.ts";
import { parseAddress } from "./eth.ts";

/** The KV methods the Worker uses. KVNamespace fits it, and modules that take this still type-check under Node. */
export interface KeyValueCache {
  get<T>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  CACHE: KeyValueCache;
  CHAIN_ID: string;
  RPC_URL: string;
  /** Empty until the contract is deployed; the cron idles meanwhile. */
  CONTRACT_ADDRESS?: string;
  SIWE_DOMAIN: string;
  SIWE_URI: string;
  RECEIPT_WAIT_MS?: string;
  // Secrets
  FIREBASE_PROJECT_ID?: string;
  /** The service account's JSON key, as Google issues it. */
  FIREBASE_SERVICE_ACCOUNT?: string;
  MINTER_KEY?: string;
  /** libsecp256k1's blinding seed: Workers allows no random numbers at module scope. */
  SIGNER_SEED?: string;
  MARK_KEY?: string;
  NONCE_KEY?: string;
  // Local runs and tests only
  /** `host:port` of the Firestore emulator, which takes `Bearer owner` in place of a token. */
  FIRESTORE_EMULATOR_HOST?: string;
  /** Where Firebase's signing keys are, in place of Google's (a test key set). */
  JWKS_URL?: string;
}

export interface ServiceAccount {
  clientEmail: string;
  privateKeyPem: string;
  privateKeyId?: string;
  tokenUri: string;
}

export interface Config {
  chainId: number;
  rpcUrl: string;
  contract: Hex | null;
  siweDomain: string;
  siweUri: string;
  receiptWaitMs: number;
  projectId: string;
  /** Null when talking to the emulator. */
  serviceAccount: ServiceAccount | null;
  emulatorHost: string | null;
  jwksUrl: string;
  minterKey: Uint8Array<ArrayBuffer>;
  signerSeed: Uint8Array<ArrayBuffer>;
  markKey: Uint8Array<ArrayBuffer>;
  nonceKey: Uint8Array<ArrayBuffer>;
}

const GOOGLE_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

/** The config, or the names of what's missing or malformed (never their values). */
export function readConfig(env: Env): { config: Config; problems?: undefined } | { config?: undefined; problems: string[] } {
  const problems: string[] = [];
  const chainId = Number(env.CHAIN_ID);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) problems.push("CHAIN_ID");
  if (!/^https?:\/\/\S+$/.test(env.RPC_URL ?? "")) problems.push("RPC_URL");
  const contract = env.CONTRACT_ADDRESS ? parseAddress(env.CONTRACT_ADDRESS) : null;
  if (env.CONTRACT_ADDRESS && !contract) problems.push("CONTRACT_ADDRESS");
  if (!env.SIWE_DOMAIN) problems.push("SIWE_DOMAIN");
  if (!env.SIWE_URI) problems.push("SIWE_URI");
  const receiptWaitMs = Number(env.RECEIPT_WAIT_MS ?? 10_000);
  if (!Number.isSafeInteger(receiptWaitMs) || receiptWaitMs < 0 || receiptWaitMs > 20_000) problems.push("RECEIPT_WAIT_MS");
  if (!/^[a-z0-9-]{4,40}$/.test(env.FIREBASE_PROJECT_ID ?? "")) problems.push("FIREBASE_PROJECT_ID");
  const emulatorHost = env.FIRESTORE_EMULATOR_HOST || null;
  if (emulatorHost && !/^(127\.0\.0\.1|localhost):\d+$/.test(emulatorHost)) problems.push("FIRESTORE_EMULATOR_HOST");
  const serviceAccount = emulatorHost ? null : parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
  if (!emulatorHost && !serviceAccount) problems.push("FIREBASE_SERVICE_ACCOUNT");
  const minterKey = key32(env.MINTER_KEY, "MINTER_KEY", problems);
  const signerSeed = key32(env.SIGNER_SEED, "SIGNER_SEED", problems);
  const markKey = key32(env.MARK_KEY, "MARK_KEY", problems);
  const nonceKey = key32(env.NONCE_KEY, "NONCE_KEY", problems);
  if (problems.length) return { problems };
  return {
    config: {
      chainId,
      rpcUrl: env.RPC_URL,
      contract,
      siweDomain: env.SIWE_DOMAIN,
      siweUri: env.SIWE_URI,
      receiptWaitMs,
      projectId: env.FIREBASE_PROJECT_ID!,
      serviceAccount,
      emulatorHost,
      jwksUrl: env.JWKS_URL || GOOGLE_JWKS,
      minterKey: minterKey!,
      signerSeed: signerSeed!,
      markKey: markKey!,
      nonceKey: nonceKey!,
    },
  };
}

function key32(value: string | undefined, name: string, problems: string[]): Uint8Array<ArrayBuffer> | undefined {
  const hex = value?.startsWith("0x") ? value : `0x${value ?? ""}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    problems.push(name);
    return undefined;
  }
  return hexToBytes(hex);
}

function parseServiceAccount(json: string | undefined): ServiceAccount | null {
  if (!json) return null;
  try {
    const key = JSON.parse(json) as Record<string, unknown>;
    if (typeof key.client_email !== "string" || typeof key.private_key !== "string") return null;
    return {
      clientEmail: key.client_email,
      privateKeyPem: key.private_key,
      privateKeyId: typeof key.private_key_id === "string" ? key.private_key_id : undefined,
      tokenUri: typeof key.token_uri === "string" ? key.token_uri : "https://oauth2.googleapis.com/token",
    };
  } catch {
    return null;
  }
}
