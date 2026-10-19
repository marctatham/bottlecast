import { exportJWK, generateKeyPair, importPKCS8, jwtVerify, SignJWT, exportPKCS8, type JWTPayload } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FirebaseKeys, verifyIdToken } from "../src/auth.ts";
import type { KeyValueCache } from "../src/config.ts";
import { AccessTokens } from "../src/google-token.ts";
import { HttpError } from "../src/http.ts";

const PROJECT = "demo-bottlecast";
const UID = "kT7wq2Xr9mZp4LsVb8NcYe3HdQ1a";
const JWKS_URL = "https://keys.example/jwks";

/** KV in memory. */
export function memoryCache(): KeyValueCache & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get<T>(key: string) {
      const value = store.get(key);
      return value === undefined ? null : (JSON.parse(value) as T);
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

const keys = await generateKeyPair("RS256", { extractable: true });
const other = await generateKeyPair("RS256", { extractable: true });
const jwk = { ...(await exportJWK(keys.publicKey)), kid: "k1", alg: "RS256", use: "sig" };

/** A Firebase-shaped token; `claims` replace its defaults, and an undefined one is left out. */
function token(claims: JWTPayload = {}, { kid = "k1", key = keys.privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: UID,
    iat: now - 60,
    exp: now + 3600,
    auth_time: now - 60,
    firebase: { sign_in_provider: "google.com", identities: { "google.com": ["1"] } },
    ...claims,
  };
  for (const [name, value] of Object.entries(payload)) if (value === undefined) delete payload[name];
  return new SignJWT(payload).setProtectedHeader({ alg: "RS256", kid, typ: "JWT" }).sign(key);
}

let fetches = 0;
beforeEach(() => {
  fetches = 0;
  vi.stubGlobal("fetch", async (url: string) => {
    expect(url).toBe(JWKS_URL);
    fetches++;
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "Cache-Control": "public, max-age=19000" } });
  });
});
afterEach(() => vi.unstubAllGlobals());

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    if (error instanceof HttpError) return error.code;
    throw error;
  }
}

describe("verifyIdToken", () => {
  it("accepts a Firebase token from a Google account, and a guest that linked Google", async () => {
    const cache = memoryCache();
    const firebaseKeys = new FirebaseKeys(JWKS_URL, cache);
    expect(await verifyIdToken(await token(), PROJECT, firebaseKeys, Date.now())).toBe(UID);
    const linkedGuest = await token({ firebase: { sign_in_provider: "anonymous", identities: { "google.com": ["1"] } } });
    expect(await verifyIdToken(linkedGuest, PROJECT, firebaseKeys, Date.now())).toBe(UID);
    expect(fetches).toBe(1);
  });

  it("keeps the keys in KV for the next isolate, for as long as Google allows", async () => {
    const cache = memoryCache();
    await verifyIdToken(await token(), PROJECT, new FirebaseKeys(JWKS_URL, cache), Date.now());
    await verifyIdToken(await token(), PROJECT, new FirebaseKeys(JWKS_URL, cache), Date.now());
    expect(fetches).toBe(1);
    const later = await token({ exp: Math.floor(Date.now() / 1000) + 30_000 });
    await verifyIdToken(later, PROJECT, new FirebaseKeys(JWKS_URL, cache), Date.now() + 19_001_000);
    expect(fetches).toBe(2);
  });

  it("fetches the keys again for a key it doesn't know, at most once a minute", async () => {
    const firebaseKeys = new FirebaseKeys(JWKS_URL, memoryCache());
    const now = Date.now();
    expect(await code(verifyIdToken(await token({}, { kid: "rotated" }), PROJECT, firebaseKeys, now))).toBe("unauthenticated");
    expect(fetches).toBe(1);
    expect(await code(verifyIdToken(await token({}, { kid: "rotated" }), PROJECT, firebaseKeys, now + 1_000))).toBe("unauthenticated");
    expect(fetches).toBe(1);
    expect(await code(verifyIdToken(await token({}, { kid: "rotated" }), PROJECT, firebaseKeys, now + 61_000))).toBe("unauthenticated");
    expect(fetches).toBe(2);
  });

  it("refuses everything else", async () => {
    const firebaseKeys = new FirebaseKeys(JWKS_URL, memoryCache());
    const now = Math.floor(Date.now() / 1000);
    const cases: [string, Promise<string> | string, string][] = [
      ["another key's signature", token({}, { key: other.privateKey }), "unauthenticated"],
      ["another project", token({ aud: "someone-else" }), "unauthenticated"],
      ["another issuer", token({ iss: "https://securetoken.google.com/someone-else" }), "unauthenticated"],
      ["an expired token", token({ exp: now - 1 }), "unauthenticated"],
      ["a token from the future", token({ iat: now + 120 }), "unauthenticated"],
      ["a sign-in from the future", token({ auth_time: now + 120 }), "unauthenticated"],
      ["no sign-in time", token({ auth_time: undefined }), "unauthenticated"],
      ["an empty subject", token({ sub: "" }), "unauthenticated"],
      ["a subject that isn't a plain uid", token({ sub: "a/b" }), "unauthenticated"],
      ["a guest", token({ firebase: { sign_in_provider: "anonymous", identities: {} } }), "google_required"],
      ["no identities", token({ firebase: undefined }), "google_required"],
      ["not a JWT", "abc.def", "unauthenticated"],
      ["junk", "a.b.c", "unauthenticated"],
    ];
    for (const [label, made, expected] of cases) {
      expect(await code(verifyIdToken(await made, PROJECT, firebaseKeys, Date.now())), label).toBe(expected);
    }
    // alg "none", with the same claims
    const real = (await token()).split(".");
    const none = `${Buffer.from(JSON.stringify({ alg: "none", kid: "k1" })).toString("base64url")}.${real[1]}.`;
    expect(await code(verifyIdToken(none, PROJECT, firebaseKeys, Date.now()))).toBe("unauthenticated");
  });
});

const pem = await exportPKCS8(keys.privateKey);

describe("AccessTokens", () => {
  const account = { clientEmail: "worker@demo.iam.gserviceaccount.com", privateKeyPem: pem, privateKeyId: "kid1", tokenUri: "https://oauth2.example/token" };

  it("signs the service account's JWT as Google asks", async () => {
    const tokens = new AccessTokens(account, memoryCache());
    const assertion = await tokens.assertion(Date.now());
    const { payload, protectedHeader } = await jwtVerify(assertion, keys.publicKey, { audience: account.tokenUri, issuer: account.clientEmail });
    expect(protectedHeader).toMatchObject({ alg: "RS256", kid: "kid1" });
    expect(payload).toMatchObject({ sub: account.clientEmail, scope: "https://www.googleapis.com/auth/datastore" });
    expect(payload.exp! - payload.iat!).toBe(3600);
    await importPKCS8(pem, "RS256");
  });

  it("exchanges it once, then keeps the token in memory and KV for 55 minutes", async () => {
    let exchanges = 0;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      expect(url).toBe(account.tokenUri);
      expect(String(init.body)).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
      exchanges++;
      return Response.json({ access_token: `token-${exchanges}`, expires_in: 3599 });
    });
    const cache = memoryCache();
    const now = Date.now();
    expect(await new AccessTokens(account, cache).get(now)).toBe("token-1");
    expect(await new AccessTokens(account, cache).get(now + 50 * 60_000)).toBe("token-1");
    expect(await new AccessTokens(account, cache).get(now + 56 * 60_000)).toBe("token-2");
    const tokens = new AccessTokens(account, cache);
    await tokens.drop();
    expect(await tokens.get(now + 56 * 60_000)).toBe("token-3");
    expect(exchanges).toBe(3);
  });
});
