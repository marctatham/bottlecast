// The Worker's Firestore access token. Signing the service account's JWT is an RSA signature, and
// exchanging it is a round trip, so the token Google returns is kept for most of its hour: in memory
// while the isolate lives, and in KV for the next isolate, since nearly every run starts cold.
import { base64ToBytes, base64UrlEncode, utf8 } from "./bytes.ts";
import type { KeyValueCache, ServiceAccount } from "./config.ts";

const KV_KEY = "firestore-token";
const SCOPE = "https://www.googleapis.com/auth/datastore";
/** Google's tokens last an hour; one is used for 55 minutes at most. */
const MARGIN_MS = 5 * 60 * 1000;

interface CachedToken {
  token: string;
  expiresAt: number;
}

export class AccessTokens {
  private readonly account: ServiceAccount;
  private readonly cache: KeyValueCache;
  private readonly signingKey: Promise<CryptoKey>;
  private memory: CachedToken | null = null;

  constructor(account: ServiceAccount, cache: KeyValueCache) {
    this.account = account;
    this.cache = cache;
    this.signingKey = importPrivateKey(account.privateKeyPem);
  }

  async get(now: number): Promise<string> {
    if (this.memory && this.memory.expiresAt > now) return this.memory.token;
    const cached = await this.cache.get<CachedToken>(KV_KEY, "json");
    if (cached && cached.expiresAt > now) {
      this.memory = cached;
      return cached.token;
    }
    const response = await fetch(this.account.tokenUri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: await this.assertion(now),
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`The token exchange answered ${response.status}`);
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string" || typeof body.expires_in !== "number") {
      throw new Error("The token exchange answered without a token");
    }
    const lifetimeMs = body.expires_in * 1000 - MARGIN_MS;
    this.memory = { token: body.access_token, expiresAt: now + lifetimeMs };
    if (lifetimeMs >= 60_000) {
      await this.cache.put(KV_KEY, JSON.stringify(this.memory), { expirationTtl: Math.floor(lifetimeMs / 1000) });
    }
    return body.access_token;
  }

  /** Forgets the token, after Firestore refused it. */
  async drop(): Promise<void> {
    this.memory = null;
    await this.cache.delete(KV_KEY);
  }

  /** The signed JWT the exchange takes (RS256, an hour long). */
  async assertion(now: number): Promise<string> {
    const issuedAt = Math.floor(now / 1000);
    const header = { alg: "RS256", typ: "JWT", ...(this.account.privateKeyId ? { kid: this.account.privateKeyId } : {}) };
    const claims = {
      iss: this.account.clientEmail,
      sub: this.account.clientEmail,
      aud: this.account.tokenUri,
      scope: SCOPE,
      iat: issuedAt,
      exp: issuedAt + 3600,
    };
    const signingInput = `${base64UrlEncode(utf8.encode(JSON.stringify(header)))}.${base64UrlEncode(utf8.encode(JSON.stringify(claims)))}`;
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await this.signingKey, utf8.encode(signingInput));
    return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
  }
}

function importPrivateKey(pem: string): Promise<CryptoKey> {
  const der = base64ToBytes(pem.replace(/-----[A-Z ]+-----|\s/g, ""));
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}
