// Bytes, hex and base64url, written out so a cold isolate interprets a few small loops rather than a
// general-purpose library.

export type Hex = `0x${string}`;

const HEX_DIGITS = "0123456789abcdef";
const encoder = new TextEncoder();

/** UTF-8 bytes. TextEncoder always returns a fresh ArrayBuffer, whatever a lib's types say. */
export const utf8 = {
  encode: (text: string): Uint8Array<ArrayBuffer> => encoder.encode(text) as Uint8Array<ArrayBuffer>,
};

/** `0x`-prefixed hex, of even length, to bytes. Throws on anything else. */
export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (!/^0x([0-9a-fA-F]{2})*$/.test(hex)) throw new TypeError("Not even-length 0x hex");
  const bytes = new Uint8Array((hex.length - 2) / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16);
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): Hex {
  let hex = "0x";
  for (const byte of bytes) hex += HEX_DIGITS[byte >> 4] + HEX_DIGITS[byte & 15];
  return hex as Hex;
}

/** A JSON-RPC quantity: `0x`, no leading zeros, "0x0" for zero. */
export function quantity(value: bigint | number): Hex {
  return `0x${BigInt(value).toString(16)}`;
}

/** A JSON-RPC quantity or 32-byte word back to a number. Throws on anything but hex. */
export function hexToBigInt(hex: unknown): bigint {
  if (typeof hex !== "string" || !/^0x[0-9a-fA-F]*$/.test(hex)) throw new TypeError(`Not a hex quantity: ${String(hex).slice(0, 80)}`);
  return hex === "0x" ? 0n : BigInt(hex);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Compares in time that depends only on the lengths, for MACs. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Strict base64url without padding, as JWTs use it. Throws on anything else. */
export function base64UrlDecode(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new TypeError("Not base64url");
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
