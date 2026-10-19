import { hashMessage, serializeErc6492Signature, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hexToBytes } from "../src/bytes.ts";
import type { Config } from "../src/config.ts";
import type { Firestore } from "../src/firestore.ts";
import { HttpError } from "../src/http.ts";
import { SIWE_LIFETIME_MS } from "../src/siwe.ts";
import { planLink, planUnlink, signatureIsValid, verifyWalletProof, walletNonce, type WalletServices } from "../src/wallets.ts";
import { signer } from "./helpers.ts";

afterEach(() => vi.unstubAllGlobals());

const config = {
  chainId: 84532,
  rpcUrl: "https://rpc.example",
  siweDomain: "bottling-messages.web.app",
  siweUri: "https://bottling-messages.web.app",
} as Config;
const services: WalletServices = {
  config,
  secp: signer(),
  firestore: null as unknown as Firestore,
  nonceKey: crypto.subtle.importKey("raw", new Uint8Array(32).fill(5), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
};
const UID = "kT7wq2Xr9mZp4LsVb8NcYe3HdQ1a";

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    if (error instanceof HttpError) return error.code;
    throw error;
  }
}

/** A chain whose answers to the code and validator calls are fixed, counting requests. */
function chain(code: string, verdict: { result?: string; error?: object }) {
  const requests: unknown[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { id: number }[];
    requests.push(body);
    return Response.json([
      { jsonrpc: "2.0", id: body[0].id, result: code },
      { jsonrpc: "2.0", id: body[1].id, ...verdict },
    ]);
  });
  return requests;
}

describe("the wallet proof", () => {
  it("accepts a message issued to this account, signed by the wallet, with no request to the chain", async () => {
    const requests = chain("0x", { result: "0x00" });
    const wallet = privateKeyToAccount(generatePrivateKey());
    const now = Date.now();
    const { message, expiresAt } = await walletNonce(services, UID, { address: wallet.address }, now);
    expect(Date.parse(expiresAt) - now).toBe(SIWE_LIFETIME_MS);
    expect(message).toContain(`\n${wallet.address}\n`);
    const signature = await wallet.signMessage({ message });
    expect(await verifyWalletProof(services, UID, message, signature, now + 1_000)).toBe(wallet.address.toLowerCase());
    expect(requests).toHaveLength(0);
  });

  it("refuses a message for another account, another site or chain, or one that's been altered", async () => {
    const wallet = privateKeyToAccount(generatePrivateKey());
    const now = Date.now();
    const { message } = await walletNonce(services, UID, { address: wallet.address }, now);
    const signed = async (text: string) => wallet.signMessage({ message: text });
    expect(await code(verifyWalletProof(services, "someoneElse", message, await signed(message), now))).toBe("bad_message");
    for (const altered of [
      message.replace("bottling-messages.web.app wants", "evil.example wants"),
      message.replace("URI: https://bottling-messages.web.app", "URI: https://evil.example"),
      message.replace("Chain ID: 84532", "Chain ID: 8453"),
      message.replace("Link this wallet to BottleCast", "Link this wallet"),
      message.replace(/Expiration Time: .*/, `Expiration Time: ${new Date(now + 2 * SIWE_LIFETIME_MS).toISOString()}`),
      `${message} `,
    ]) {
      expect(await code(verifyWalletProof(services, UID, altered, await signed(altered), now)), altered).toBe("bad_message");
    }
  });

  it("says when the message has expired, and refuses one from the future", async () => {
    const wallet = privateKeyToAccount(generatePrivateKey());
    const now = Date.now();
    const { message } = await walletNonce(services, UID, { address: wallet.address }, now);
    const signature = await wallet.signMessage({ message });
    expect(await code(verifyWalletProof(services, UID, message, signature, now + SIWE_LIFETIME_MS))).toBe("nonce_expired");
    expect(await code(verifyWalletProof(services, UID, message, signature, now - 120_000))).toBe("bad_message");
  });

  it("refuses a signature by anyone but the wallet", async () => {
    chain("0x", { result: "0x01" });
    const wallet = privateKeyToAccount(generatePrivateKey());
    const now = Date.now();
    const { message } = await walletNonce(services, UID, { address: wallet.address }, now);
    const stranger = privateKeyToAccount(generatePrivateKey());
    expect(await code(verifyWalletProof(services, UID, message, await stranger.signMessage({ message }), now))).toBe("bad_signature");
    expect(await code(verifyWalletProof(services, UID, message, "0x1234", now))).toBe("bad_signature");
    expect(await code(verifyWalletProof(services, UID, message, "not hex", now))).toBe("bad_request");
  });

  it("refuses the zero address and malformed ones when the nonce is asked for", async () => {
    for (const address of [`0x${"00".repeat(20)}`, "0x12", 7]) {
      expect(await code(walletNonce(services, UID, { address }, Date.now()))).toBe("bad_request");
    }
  });
});

describe("smart wallets", () => {
  const address: Hex = "0x9a8f2e4b7c6d5a3f1e0b9c8d7a6f5e4d3c2b1a09";
  const hash = hexToBytes(hashMessage("hello"));
  const longSignature = hexToBytes(`0x${"11".repeat(130)}`);
  const wrapped = hexToBytes(serializeErc6492Signature({ address: "0x00000000000000000000000000000000fac70121", data: "0xdead", signature: `0x${"11".repeat(65)}` }));

  it("asks ERC-6492's validator once, with the wallet's code, in one request", async () => {
    const requests = chain("0x6080", { result: "0x01" });
    expect(await signatureIsValid(config, services.secp, address, hash, longSignature)).toBe(true);
    expect(requests).toHaveLength(1);
    const batch = requests[0] as { method: string; params: unknown[] }[];
    expect(batch.map((call) => call.method)).toEqual(["eth_getCode", "eth_call"]);
  });

  it("trusts the validator for a wallet that isn't deployed only with the 6492 suffix", async () => {
    chain("0x", { result: "0x01" });
    expect(await signatureIsValid(config, services.secp, address, hash, wrapped)).toBe(true);
    // Without code or the suffix, a yes could be ecrecover steered to the zero address.
    expect(await signatureIsValid(config, services.secp, address, hash, longSignature)).toBe(false);
  });

  it("refuses a no, or a validator that reverts", async () => {
    chain("0x6080", { result: "0x00" });
    expect(await signatureIsValid(config, services.secp, address, hash, longSignature)).toBe(false);
    chain("0x6080", { error: { code: 3, message: "execution reverted" } });
    expect(await signatureIsValid(config, services.secp, address, hash, longSignature)).toBe(false);
  });
});

describe("who receives", () => {
  const w = (n: number, receiving: boolean, linkedAt = n) => ({ address: `0x${String(n).repeat(40)}` as Hex, receiving, linkedAt });

  it("makes the first wallet receive, and a new one only if asked", () => {
    expect(planLink([], w(1, false).address, false)).toEqual({ receiving: true, clear: [] });
    expect(planLink([w(1, true)], w(2, false).address, false)).toEqual({ receiving: false, clear: [] });
    expect(planLink([w(1, true)], w(2, false).address, true)).toEqual({ receiving: true, clear: [w(1, true).address] });
  });

  it("keeps a re-linked wallet's role, and heals two receiving or none", () => {
    expect(planLink([w(1, true), w(2, false)], w(1, true).address, false)).toEqual({ receiving: true, clear: [] });
    expect(planLink([w(1, false), w(2, false)], w(3, false).address, false)).toEqual({ receiving: true, clear: [] });
    expect(planLink([w(1, true, 1), w(2, true, 2)], w(3, false).address, false)).toEqual({ receiving: false, clear: [w(1, true).address] });
  });

  it("moves receiving to the newest wallet left when the receiving one is unlinked", () => {
    expect(planUnlink([w(1, true)], w(1, true).address)).toEqual({ receiving: null, set: [], clear: [] });
    expect(planUnlink([w(1, true, 1), w(2, false, 2), w(3, false, 3)], w(1, true).address)).toEqual({
      receiving: w(3, false).address,
      set: [w(3, false).address],
      clear: [],
    });
    expect(planUnlink([w(1, false), w(2, true)], w(1, false).address)).toEqual({ receiving: w(2, true).address, set: [], clear: [] });
  });
});
