// The Ethereum pieces the Worker needs, by hand: addresses (EIP-55), what `personal_sign` signs,
// the few contract calls it makes, receipts and the Transfer log, the contract's refusals, and
// ERC-6492's validator call for smart wallets. Tests check each against viem.
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, concatBytes, hexToBigInt, hexToBytes, utf8, type Hex } from "./bytes.ts";
import { ERC6492_VALIDATOR_BYTECODE } from "./erc6492-validator.ts";
import type { Secp256k1Wasm } from "./secp256k1-wasm.ts";

export function keccak256(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return keccak_256(bytes) as Uint8Array<ArrayBuffer>;
}

const ZERO_ADDRESS = `0x${"00".repeat(20)}`;

/**
 * A wallet address as the Worker stores it: lowercase, never the zero address. Mixed case must be a
 * valid EIP-55 checksum, since a typo there is what the checksum is for. Null for anything else.
 */
export function parseAddress(input: unknown): Hex | null {
  if (typeof input !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(input)) return null;
  const lower = input.toLowerCase() as Hex;
  if (lower === ZERO_ADDRESS) return null;
  const body = input.slice(2);
  if (body !== body.toLowerCase() && body !== body.toUpperCase() && toChecksumAddress(lower) !== input) return null;
  return lower;
}

/** EIP-55: each letter is capitalised where the matching nibble of keccak(the lowercase hex) is 8 or more. */
export function toChecksumAddress(lower: Hex): Hex {
  const body = lower.slice(2);
  const hash = keccak256(utf8.encode(body));
  let out = "0x";
  for (let i = 0; i < 40; i++) {
    const nibble = (hash[i >> 1] >> (i % 2 === 0 ? 4 : 0)) & 15;
    out += nibble >= 8 ? body[i].toUpperCase() : body[i];
  }
  return out as Hex;
}

/** The address an uncompressed public key (65 bytes, 0x04 first) signs for: the last 20 bytes of keccak(x ‖ y). */
export function addressFromPublicKey(publicKey: Uint8Array): Hex {
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new TypeError("Expected an uncompressed public key");
  return bytesToHex(keccak256(publicKey.subarray(1)).subarray(12));
}

/** What `personal_sign` signs (EIP-191): keccak of the prefix, the message's byte length, and the message. */
export function personalMessageHash(message: string): Uint8Array<ArrayBuffer> {
  const bytes = utf8.encode(message);
  return keccak256(concatBytes(utf8.encode(`\x19Ethereum Signed Message:\n${bytes.length}`), bytes));
}

/** Who made a 65-byte r ‖ s ‖ v signature over `hash` (v 27 or 28, or 0 or 1), or null if nobody did. */
export function recoverSigner(secp: Secp256k1Wasm, hash: Uint8Array, signature: Uint8Array): Hex | null {
  if (signature.length !== 65) return null;
  const v = signature[64];
  const recoveryId = v >= 27 ? v - 27 : v;
  if (recoveryId !== 0 && recoveryId !== 1) return null;
  const publicKey = secp.recover(hash, signature.subarray(0, 64), recoveryId);
  return publicKey ? addressFromPublicKey(publicKey) : null;
}

// ---------- ABI ----------

const WORD = 32;

/** A uint as a 32-byte big-endian word. */
export function uintWord(value: bigint): Uint8Array<ArrayBuffer> {
  if (value < 0n || value >= 1n << 256n) throw new RangeError(`Doesn't fit uint256: ${value}`);
  const out = new Uint8Array(WORD);
  for (let i = WORD - 1, v = value; v > 0n; i--, v >>= 8n) out[i] = Number(v & 0xffn);
  return out;
}

function addressWord(address: Hex): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(WORD);
  out.set(hexToBytes(address), WORD - 20);
  return out;
}

/** `bytes` or `string` in a tail: its length, then its bytes padded to whole words. */
function dynamic(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(WORD + Math.ceil(bytes.length / WORD) * WORD);
  out.set(uintWord(BigInt(bytes.length)));
  out.set(bytes, WORD);
  return out;
}

const SELECTORS = {
  tokenOfMessage: hexToBytes("0xc78c649e"), // tokenOfMessage(string)
  ownerOf: hexToBytes("0x6352211e"), // ownerOf(uint256)
  getL1FeeUpperBound: hexToBytes("0xf1c7a58b"), // getL1FeeUpperBound(uint256)
};

/** `tokenOfMessage(messageId)`: the keepsake a bottle was sealed as, or 0. */
export function encodeTokenOfMessage(messageId: string): Hex {
  return bytesToHex(concatBytes(SELECTORS.tokenOfMessage, uintWord(32n), dynamic(utf8.encode(messageId))));
}

export function encodeOwnerOf(tokenId: bigint): Hex {
  return bytesToHex(concatBytes(SELECTORS.ownerOf, uintWord(tokenId)));
}

/** OP Stack's GasPriceOracle (0x42…0F on Base): the most the L1 data fee can be for a transaction this size. */
export const GAS_PRICE_ORACLE: Hex = "0x420000000000000000000000000000000000000f";

export function encodeL1FeeUpperBound(unsignedTxSize: number): Hex {
  return bytesToHex(concatBytes(SELECTORS.getL1FeeUpperBound, uintWord(BigInt(unsignedTxSize))));
}

/** The first word of a call's return data as a number; "0x" (no code there) is 0. */
export function decodeUint(data: unknown): bigint {
  if (typeof data === "string" && data.length > 2 + 64) return hexToBigInt(data.slice(0, 2 + 64));
  return hexToBigInt(data);
}

/** The first word of a call's return data as a lowercase address. */
export function decodeAddress(data: unknown): Hex {
  const value = decodeUint(data);
  if (value >= 1n << 160n) throw new RangeError("Not an address word");
  return `0x${value.toString(16).padStart(40, "0")}`;
}

// ---------- ERC-6492 and EIP-1271 ----------

/** The 32 bytes a counterfactual wallet's signature ends with (ERC-6492). */
const ERC6492_SUFFIX = hexToBytes(`0x${"6492".repeat(16)}`);

export function isErc6492(signature: Uint8Array): boolean {
  if (signature.length < ERC6492_SUFFIX.length) return false;
  const tail = signature.subarray(signature.length - ERC6492_SUFFIX.length);
  return tail.every((byte, i) => byte === ERC6492_SUFFIX[i]);
}

/** The data of an `eth_call` (no `to`) that runs ERC-6492's validator on `signature` by `signer` over `hash`. */
export function erc6492ValidatorCall(signer: Hex, hash: Uint8Array, signature: Uint8Array): Hex {
  if (hash.length !== WORD) throw new RangeError("Expected a 32-byte hash");
  return bytesToHex(
    concatBytes(hexToBytes(ERC6492_VALIDATOR_BYTECODE), addressWord(signer), hash, uintWord(3n * 32n), dynamic(signature)),
  );
}

/** The validator answers one byte, 1 for valid; leading zeros don't matter, and anything else is no. */
export function isValidatorYes(data: unknown): boolean {
  return typeof data === "string" && /^0x0*1$/.test(data);
}

// ---------- Receipts and refusals ----------

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_TOPIC = `0x${"00".repeat(32)}`;

export interface Receipt {
  transactionHash: Hex;
  /** 1 mined and ran, 0 reverted. */
  status: number;
  logs: { address: Hex; topics: Hex[] }[];
}

/** An `eth_getTransactionReceipt` result, or null while there isn't one. Throws if it's malformed. */
export function parseReceipt(result: unknown): Receipt | null {
  if (result === null || result === undefined) return null;
  const receipt = result as { transactionHash?: unknown; status?: unknown; logs?: unknown };
  if (typeof receipt.transactionHash !== "string" || !Array.isArray(receipt.logs)) throw new TypeError("Malformed receipt");
  return {
    transactionHash: receipt.transactionHash.toLowerCase() as Hex,
    status: Number(hexToBigInt(receipt.status)),
    logs: receipt.logs.map((log: { address?: unknown; topics?: unknown }) => ({
      address: String(log.address).toLowerCase() as Hex,
      topics: Array.isArray(log.topics) ? log.topics.map((topic) => String(topic).toLowerCase() as Hex) : [],
    })),
  };
}

/** The keepsake a receipt minted: the contract's Transfer from the zero address, with its recipient and id. */
export function mintedTransfer(receipt: Receipt, contract: Hex): { tokenId: bigint; to: Hex } | null {
  for (const log of receipt.logs) {
    const [topic, from, to, tokenId] = log.topics;
    if (log.address === contract && topic === TRANSFER_TOPIC && from === ZERO_TOPIC && to && tokenId) {
      return { tokenId: hexToBigInt(tokenId), to: `0x${to.slice(-40)}` };
    }
  }
  return null;
}

/** Why the contract refused a mint, as a claim's `error` code, or the minter lost its role. */
export type MintRefusal = "no_minter_role" | "too_long" | "bad_recipient" | "reverted";

const REFUSALS: Record<string, MintRefusal> = {
  "0xe2517d3f": "no_minter_role", // AccessControlUnauthorizedAccount(address,bytes32)
  "0x0f1a9ab5": "too_long", // TextTooLong(uint256)
  "0x8cb0bca7": "too_long", // PenNameTooLong(uint256)
  "0x64a0ae92": "bad_recipient", // ERC721InvalidReceiver(address)
};

/** Reads a JSON-RPC error's revert data (node clients put it at `data` or `data.data`). */
export function refusalOf(error: { data?: unknown }): MintRefusal {
  const data = typeof error.data === "string" ? error.data : (error.data as { data?: unknown } | undefined)?.data;
  if (typeof data !== "string" || data.length < 10) return "reverted";
  return REFUSALS[data.slice(0, 10).toLowerCase()] ?? "reverted";
}
