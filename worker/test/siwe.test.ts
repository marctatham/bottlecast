import { createSiweMessage, parseSiweMessage as viemParse, validateSiweMessage } from "viem/siwe";
import { getAddress, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { buildSiweMessage, parseIsoTime, parseSiweMessage, SIWE_STATEMENT, siweNonce, type SiweMessage } from "../src/siwe.ts";

const fields: SiweMessage = {
  domain: "bottling-messages.web.app",
  address: getAddress("0x9a8f2e4b7c6d5a3f1e0b9c8d7a6f5e4d3c2b1a09"),
  statement: SIWE_STATEMENT,
  uri: "https://bottling-messages.web.app",
  chainId: 84532,
  nonce: "8f2a91c40123456789abcdef01234567",
  issuedAt: "2026-10-18T12:00:00.000Z",
  expirationTime: "2026-10-18T12:10:00.000Z",
};

describe("the SIWE message", () => {
  it("is what viem writes for the same fields, and viem reads and accepts it", () => {
    const message = buildSiweMessage(fields);
    expect(message).toBe(
      createSiweMessage({
        domain: fields.domain,
        address: fields.address,
        statement: fields.statement,
        uri: fields.uri,
        version: "1",
        chainId: fields.chainId,
        nonce: fields.nonce,
        issuedAt: new Date(fields.issuedAt),
        expirationTime: new Date(fields.expirationTime),
      }),
    );
    const parsed = viemParse(message);
    expect(validateSiweMessage({ message: parsed, domain: fields.domain, nonce: fields.nonce, time: new Date("2026-10-18T12:05:00Z") })).toBe(true);
  });

  it("parses back to the same fields", () => {
    expect(parseSiweMessage(buildSiweMessage(fields))).toEqual(fields);
  });

  it("refuses anything but its own layout", () => {
    const message = buildSiweMessage(fields);
    const variants = [
      message.replace("\n", "\r\n"),
      `${message}\n`,
      message.replace(fields.address, fields.address.toLowerCase()),
      message.replace("Version: 1", "Version: 2"),
      message.replace(`Nonce: ${fields.nonce}`, "Nonce: short1234"),
      message.replace("Chain ID: 84532", "Chain ID: 084532"),
      message.replace(`URI: ${fields.uri}`, "URI: two words"),
      message.split("\n").slice(0, 10).join("\n"),
      "x".repeat(2000),
      42,
    ];
    for (const variant of variants) expect(parseSiweMessage(variant)).toBeNull();
  });
});

describe("the nonce", () => {
  it("is the same for the same account, address and time, and differs if any changes", async () => {
    const key = await crypto.subtle.importKey("raw", new Uint8Array(32).fill(3), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const address = fields.address.toLowerCase() as Hex;
    const nonce = await siweNonce(key, "uidA", address, fields.issuedAt);
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(await siweNonce(key, "uidA", address, fields.issuedAt)).toBe(nonce);
    expect(await siweNonce(key, "uidB", address, fields.issuedAt)).not.toBe(nonce);
    expect(await siweNonce(key, "uidA", `0x${"11".repeat(20)}`, fields.issuedAt)).not.toBe(nonce);
    expect(await siweNonce(key, "uidA", address, "2026-10-18T12:00:00.001Z")).not.toBe(nonce);
  });
});

describe("parseIsoTime", () => {
  it("takes only toISOString's own form", () => {
    expect(parseIsoTime("2026-10-18T12:00:00.000Z")).toBe(Date.UTC(2026, 9, 18, 12));
    for (const text of ["2026-10-18T12:00:00Z", "2026-10-18T12:00:00.000+00:00", "yesterday"]) expect(parseIsoTime(text)).toBeNaN();
  });
});
