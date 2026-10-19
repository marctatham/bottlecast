// Who's asking: a Firebase ID token, checked by hand on WebCrypto as Firebase's docs describe
// (RS256 only; Google's securetoken keys; iss, aud, exp, iat, auth_time and sub), plus a Google
// identity on the account, as the rules' hasGoogle() asks. A linked guest's token can still name
// "anonymous" as its sign-in provider, so the identities decide (CLAUDE.md).
import { base64UrlDecode, utf8 } from "./bytes.ts";
import type { KeyValueCache } from "./config.ts";
import { HttpError } from "./http.ts";

/** Clock skew allowed on a token's iat and auth_time: the Worker's clock is the request's start. */
const SKEW_SECONDS = 60;
const KV_KEY = "firebase-jwks";
const decoder = new TextDecoder();

export interface ParsedToken {
  header: { alg?: unknown; kid?: unknown };
  payload: Record<string, unknown>;
  signingInput: Uint8Array<ArrayBuffer>;
  signature: Uint8Array<ArrayBuffer>;
}

/** Splits and decodes a JWT without checking anything. Null if it isn't one. */
export function parseJwt(token: string): ParsedToken | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(decoder.decode(base64UrlDecode(parts[0])));
    const payload = JSON.parse(decoder.decode(base64UrlDecode(parts[1])));
    if (typeof header !== "object" || header === null || typeof payload !== "object" || payload === null) return null;
    return { header, payload, signingInput: utf8.encode(`${parts[0]}.${parts[1]}`), signature: base64UrlDecode(parts[2]) };
  } catch {
    return null;
  }
}

/** The uid a verified token's claims name, or why not: `unauthenticated`, or `google_required`. */
export function checkClaims(payload: Record<string, unknown>, projectId: string, nowSeconds: number): string {
  const { iss, aud, exp, iat, auth_time: authTime, sub, firebase } = payload;
  const fresh =
    iss === `https://securetoken.google.com/${projectId}` &&
    aud === projectId &&
    typeof exp === "number" &&
    exp > nowSeconds &&
    typeof iat === "number" &&
    iat <= nowSeconds + SKEW_SECONDS &&
    typeof authTime === "number" &&
    authTime <= nowSeconds + SKEW_SECONDS;
  // Firebase's uids are 28 letters and digits; the Worker puts them in document paths and MACs.
  if (!fresh || typeof sub !== "string" || !/^[A-Za-z0-9]{1,128}$/.test(sub)) {
    throw new HttpError(401, "unauthenticated");
  }
  const identities = (firebase as { identities?: Record<string, unknown> } | undefined)?.identities;
  const google = identities?.["google.com"];
  if (!Array.isArray(google) || google.length === 0) throw new HttpError(403, "google_required");
  return sub;
}

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

interface CachedJwks {
  keys: Jwk[];
  expiresAt: number;
}

/**
 * Firebase's signing keys: in memory while the isolate lives, and in KV for the time Google's
 * Cache-Control allows, so a cold isolate needn't fetch them. A token naming a key that isn't there
 * fetches them again, at most once a minute, in case Google rotated them.
 */
export class FirebaseKeys {
  private readonly url: string;
  private readonly cache: KeyValueCache;
  private keys = new Map<string, Promise<CryptoKey>>();
  private expiresAt = 0;
  private lastFetch = -Infinity;

  constructor(url: string, cache: KeyValueCache) {
    this.url = url;
    this.cache = cache;
  }

  async key(kid: string, now: number): Promise<CryptoKey | null> {
    if (now >= this.expiresAt) await this.load(now, false);
    if (!this.keys.has(kid) && now - this.lastFetch > 60_000) await this.load(now, true);
    const key = this.keys.get(kid);
    return key ? key : null;
  }

  private async load(now: number, network: boolean): Promise<void> {
    let jwks = network ? null : await this.cache.get<CachedJwks>(KV_KEY, "json");
    if (!jwks || jwks.expiresAt <= now) {
      this.lastFetch = now;
      const response = await fetch(this.url, { signal: AbortSignal.timeout(8_000) }).catch(() => null);
      if (!response?.ok) throw new HttpError(503, "busy");
      const body = (await response.json()) as { keys?: Jwk[] };
      const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("Cache-Control") ?? "")?.[1] ?? 3600);
      jwks = { keys: Array.isArray(body.keys) ? body.keys : [], expiresAt: now + maxAge * 1000 };
      await this.cache.put(KV_KEY, JSON.stringify(jwks), { expirationTtl: Math.max(60, maxAge) });
    }
    this.keys = new Map(
      jwks.keys
        .filter((key) => key.kty === "RSA" && typeof key.kid === "string")
        .map((key) => [
          key.kid,
          crypto.subtle.importKey(
            "jwk",
            { kty: "RSA", n: key.n, e: key.e, alg: "RS256", ext: true },
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            false,
            ["verify"],
          ),
        ]),
    );
    this.expiresAt = jwks.expiresAt;
  }
}

/** The uid of a valid Firebase ID token for `projectId` from a Google account, or an HttpError. */
export async function verifyIdToken(token: string, projectId: string, keys: FirebaseKeys, now: number): Promise<string> {
  const jwt = parseJwt(token);
  if (!jwt || jwt.header.alg !== "RS256" || typeof jwt.header.kid !== "string") throw new HttpError(401, "unauthenticated");
  const key = await keys.key(jwt.header.kid, now);
  if (!key) throw new HttpError(401, "unauthenticated");
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, jwt.signature, jwt.signingInput);
  if (!valid) throw new HttpError(401, "unauthenticated");
  return checkClaims(jwt.payload, projectId, Math.floor(now / 1000));
}
