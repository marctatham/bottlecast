// BottleCast's Worker (slice 6, decisions.md 2026-10-18): wallet linking for the app, and a cron that
// seals kept bottles as keepsakes on Base. README.md has the routes, the data and the deploy steps.
//
// Everything that can happen once per isolate happens here, at module scope: reading the config,
// compiling and seeding the signer, and warming up every hot path (src/warm-up.ts), so the 10 ms of
// CPU each request or cron run gets on the Free plan go on its own work.
import { env as moduleEnv } from "cloudflare:workers";
import secp256k1Module from "../node_modules/tiny-secp256k1/lib/secp256k1.wasm";
import { FirebaseKeys, verifyIdToken } from "./auth.ts";
import { readConfig, type Config, type Env } from "./config.ts";
import { addressFromPublicKey } from "./eth.ts";
import { Firestore, FirestoreError } from "./firestore.ts";
import { AccessTokens } from "./google-token.ts";
import { bearerToken, errorResponse, HttpError, json, readJsonObject } from "./http.ts";
import { runMinter } from "./minter.ts";
import { RpcUnavailable } from "./rpc.ts";
import { instantiateSecp256k1 } from "./secp256k1-wasm.ts";
import { warmUp } from "./warm-up.ts";
import { walletLink, walletNonce, walletUnlink, type WalletServices } from "./wallets.ts";

interface Services extends WalletServices {
  minter: `0x${string}`;
  keys: FirebaseKeys;
  markKey: Promise<CryptoKey>;
}

const env = moduleEnv as unknown as Env;
const setup = readConfig(env);
const services = setup.config ? createServices(setup.config) : null;
if (setup.problems) console.error(`Not configured yet, missing or malformed: ${setup.problems.join(", ")}`);

function createServices(config: Config): Services {
  const secp = instantiateSecp256k1(secp256k1Module, config.signerSeed);
  const tokens = config.serviceAccount ? new AccessTokens(config.serviceAccount, env.CACHE) : null;
  const firestore = new Firestore(
    config.projectId,
    tokens ? () => tokens.get(Date.now()) : async () => "owner",
    tokens ? () => tokens.drop() : async () => undefined,
    config.emulatorHost,
  );
  const hmacKey = (raw: Uint8Array<ArrayBuffer>) =>
    crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const nonceKey = hmacKey(config.nonceKey);
  const markKey = hmacKey(config.markKey);
  // The first call into the signer draws its blinding seed, so it's this one, at module scope.
  const minter = addressFromPublicKey(secp.publicKey(config.minterKey));
  warmUp(secp, { nonceKey, markKey, tokens });
  return { config, secp, firestore, nonceKey, markKey, minter, keys: new FirebaseKeys(config.jwksUrl, env.CACHE) };
}

type Route = (services: Services, uid: string, body: Record<string, unknown>, now: number) => Promise<unknown>;

const ROUTES: Record<string, Route> = {
  "/wallet/nonce": walletNonce,
  "/wallet/link": walletLink,
  "/wallet/unlink": (services, uid, body) => walletUnlink(services, uid, body),
};

export default {
  async fetch(request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const route = Object.hasOwn(ROUTES, path) ? ROUTES[path] : undefined;
    if (!route) return json({ error: "not_found" }, 404);
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!services) return json({ error: "not_configured" }, 503);
    try {
      const now = Date.now();
      const uid = await verifyIdToken(bearerToken(request), services.config.projectId, services.keys, now);
      const body = await readJsonObject(request);
      return json(await route(services, uid, body, now));
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error);
      if (isBusy(error)) {
        console.warn(`${path} busy: ${String(error).slice(0, 200)}`);
        return json({ error: "busy" }, 503);
      }
      console.error(`${path} failed: ${error instanceof Error ? error.stack : String(error)}`);
      return json({ error: "internal" }, 500);
    }
  },

  async scheduled(): Promise<void> {
    if (!services) return;
    try {
      const outcome = await runMinter({
        ...services,
        now: () => Date.now(),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      });
      if (outcome !== "idle" && outcome !== "no_contract") console.log(`cron ${outcome}`);
    } catch (error) {
      // The next minute's run picks up where this one stopped.
      if (isBusy(error)) {
        console.warn(`cron busy: ${String(error).slice(0, 200)}`);
        return;
      }
      throw error;
    }
  },
} satisfies ExportedHandler;

/** A contended transaction or an unreachable service: the caller, or the next run, tries again. */
function isBusy(error: unknown): boolean {
  return error instanceof RpcUnavailable || (error instanceof FirestoreError && (error.conflict || error.status === "UNAVAILABLE"));
}
