// "Prove it's yours" (spec §1.7, §3.9a): the Sign-In with Ethereum (EIP-4361) message the Worker
// writes for /wallet/nonce and checks in /wallet/link. Only messages this Worker would write pass:
// the parser reads exactly its layout, and the caller rebuilds the message from the fields and
// compares the whole text. The nonce is an HMAC over the account, the address and the issue time,
// so nothing is stored, and a message only works for the account that asked for it.
import { bytesToHex, utf8, type Hex } from "./bytes.ts";
import { toChecksumAddress } from "./eth.ts";

export const SIWE_STATEMENT = "Link this wallet to BottleCast";
export const SIWE_LIFETIME_MS = 10 * 60 * 1000;

export interface SiweMessage {
  domain: string;
  /** EIP-55, as SIWE requires. */
  address: Hex;
  statement: string;
  uri: string;
  chainId: number;
  nonce: string;
  /** RFC 3339, as `Date.prototype.toISOString` writes it. */
  issuedAt: string;
  expirationTime: string;
}

export function buildSiweMessage(m: SiweMessage): string {
  return [
    `${m.domain} wants you to sign in with your Ethereum account:`,
    m.address,
    "",
    m.statement,
    "",
    `URI: ${m.uri}`,
    "Version: 1",
    `Chain ID: ${m.chainId}`,
    `Nonce: ${m.nonce}`,
    `Issued At: ${m.issuedAt}`,
    `Expiration Time: ${m.expirationTime}`,
  ].join("\n");
}

const LINES = [
  /^(\S+) wants you to sign in with your Ethereum account:$/,
  /^(0x[0-9a-fA-F]{40})$/,
  /^$/,
  /^([^\n]+)$/,
  /^$/,
  /^URI: (\S+)$/,
  /^Version: 1$/,
  /^Chain ID: ([1-9][0-9]{0,15})$/,
  /^Nonce: ([0-9a-f]{32})$/,
  /^Issued At: (\S+)$/,
  /^Expiration Time: (\S+)$/,
];

/** The fields of a message in this Worker's layout, or null. It checks layout, not meaning. */
export function parseSiweMessage(text: unknown): SiweMessage | null {
  if (typeof text !== "string" || text.length > 1024) return null;
  const lines = text.split("\n");
  if (lines.length !== LINES.length) return null;
  const captured: string[] = [];
  for (const [index, pattern] of LINES.entries()) {
    const match = pattern.exec(lines[index]);
    if (!match) return null;
    captured[index] = match[1];
  }
  const address = captured[1] as Hex;
  if (toChecksumAddress(address.toLowerCase() as Hex) !== address) return null;
  return {
    domain: captured[0],
    address,
    statement: captured[3],
    uri: captured[5],
    chainId: Number(captured[7]),
    nonce: captured[8],
    issuedAt: captured[9],
    expirationTime: captured[10],
  };
}

/** The nonce for `uid` linking `address` (lowercase) at `issuedAt`: 16 bytes of HMAC-SHA256, in hex. */
export async function siweNonce(key: CryptoKey, uid: string, address: Hex, issuedAt: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", key, utf8.encode(`${uid}\n${address}\n${issuedAt}`));
  return bytesToHex(new Uint8Array(mac, 0, 16)).slice(2);
}

/** A canonical RFC 3339 time as `toISOString` writes it, in milliseconds, or NaN. */
export function parseIsoTime(text: string): number {
  const time = Date.parse(text);
  return Number.isFinite(time) && new Date(time).toISOString() === text ? time : NaN;
}
