// The hand-encoded mint against viem's general-purpose encoder, byte for byte, and the WebAssembly
// signer against noble: the oracles slice 5's bench used, kept as tests.
import { secp256k1 } from "@noble/curves/secp256k1";
import { encodeFunctionData, hexToBytes, parseAbi, serializeTransaction, toHex, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { keccak256 } from "../src/eth.ts";
import { encodeMintCall, serializeEip1559, signEip1559 } from "../src/mint-tx.ts";
import { signer } from "./helpers.ts";

const mintAbi = parseAbi([
  "function mint(address to, string messageId, string text, uint64 castAt, string penName, bytes32 writerMark, uint8 glass) returns (uint256)",
]);
const recipient: Hex = "0x9a8f2e4b7c6d5a3f1e0b9c8d7a6f5e4d3c2b1a09";
const mark: Hex = `0x${"ab".repeat(32)}`;
const secp = signer();

const calls = [
  { messageId: "", text: "", penName: "", castAt: 0n, glass: 0 },
  { messageId: "a".repeat(32), text: "b".repeat(33), penName: "c".repeat(31), castAt: 2n ** 64n - 1n, glass: 2 },
  { messageId: "Vb3kQm9TzR2xLp8sWn4E", text: "🌊".repeat(70), penName: "Driftwood", castAt: 1_791_763_200n, glass: 255 },
  { messageId: "Vb3kQm9TzR2xLp8sWn4E", text: "Hoy el mar me devolvió algo que creía perdido.", penName: "", castAt: 1n, glass: 1 },
];

describe("encodeMintCall", () => {
  it.each(calls)("matches viem for %#", (call) => {
    const viem = encodeFunctionData({
      abi: mintAbi,
      functionName: "mint",
      args: [recipient, call.messageId, call.text, call.castAt, call.penName, mark, call.glass],
    });
    expect(toHex(encodeMintCall({ ...call, to: hexToBytes(recipient), writerMark: hexToBytes(mark) }))).toBe(viem);
  });

  it("refuses what viem refuses, rather than encoding it wrongly", () => {
    const good = { ...calls[0], to: hexToBytes(recipient), writerMark: hexToBytes(mark) };
    expect(() => encodeMintCall({ ...good, to: new Uint8Array(21) })).toThrow(RangeError);
    expect(() => encodeMintCall({ ...good, writerMark: new Uint8Array(33) })).toThrow(RangeError);
    expect(() => encodeMintCall({ ...good, castAt: 2n ** 64n })).toThrow(RangeError);
    expect(() => encodeMintCall({ ...good, castAt: -1n })).toThrow(RangeError);
    expect(() => encodeMintCall({ ...good, glass: 256 })).toThrow(RangeError);
  });
});

describe("serializeEip1559", () => {
  const data = encodeMintCall({ ...calls[2], to: hexToBytes(recipient), writerMark: hexToBytes(mark) });
  for (const nonce of [0, 1, 127, 128, 255, 256, 65_535, 16_777_216]) {
    it(`matches viem at nonce ${nonce}, unsigned and signed`, () => {
      const fields = { chainId: 84532, nonce, maxPriorityFeePerGas: 1n, maxFeePerGas: 10n ** 12n, gas: 400_000n, value: 0n };
      const viemTx = { ...fields, type: "eip1559", to: recipient, data: toHex(data) } as const;
      const handTx = { ...fields, to: hexToBytes(recipient), data };
      expect(toHex(serializeEip1559(handTx))).toBe(serializeTransaction(viemTx));
      for (const [r, s, yParity] of [
        [`0x00${"ab".repeat(31)}`, `0x0000${"cd".repeat(30)}`, 0],
        [`0x${"7f".repeat(32)}`, `0x00${"01".repeat(31)}`, 1],
      ] as const) {
        const signed = toHex(serializeEip1559(handTx, { yParity, r: hexToBytes(r), s: hexToBytes(s) }));
        expect(signed).toBe(serializeTransaction(viemTx, { r, s, yParity }));
      }
    });
  }

  it("refuses a bad nonce, address or yParity", () => {
    const tx = { chainId: 84532, nonce: 0, maxPriorityFeePerGas: 1n, maxFeePerGas: 2n, gas: 1n, value: 0n, to: hexToBytes(recipient), data: new Uint8Array() };
    expect(() => serializeEip1559({ ...tx, nonce: -1 })).toThrow(RangeError);
    expect(() => serializeEip1559({ ...tx, to: new Uint8Array(32) })).toThrow(RangeError);
    expect(() => serializeEip1559(tx, { yParity: 2, r: new Uint8Array(32), s: new Uint8Array(32) })).toThrow(RangeError);
  });
});

describe("signEip1559", () => {
  it("signs what viem signs, byte for byte, and hashes it as the chain will", async () => {
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    const data = encodeMintCall({ ...calls[2], to: hexToBytes(account.address), writerMark: hexToBytes(mark) });
    for (let nonce = 0; nonce <= 20; nonce++) {
      const fields = { chainId: 84532, nonce, maxPriorityFeePerGas: 1_000_000n, maxFeePerGas: 1_200_000n, gas: 400_000n, value: 0n };
      const { raw, hash } = signEip1559(secp, hexToBytes(key), { ...fields, to: hexToBytes(recipient), data });
      const viem = await account.signTransaction({ ...fields, type: "eip1559", to: recipient, data: toHex(data) });
      expect(toHex(raw)).toBe(viem);
      expect(toHex(hash)).toBe(toHex(keccak256(hexToBytes(viem))));
    }
  });
});

describe("the WebAssembly signer", () => {
  it("signs, recovers and derives keys as noble does", () => {
    for (let i = 0; i < 20; i++) {
      const key = secp256k1.utils.randomPrivateKey();
      const hash = crypto.getRandomValues(new Uint8Array(32));
      const ours = secp.signRecoverable(hash, key);
      const noble = secp256k1.sign(hash, key, { lowS: true });
      expect(toHex(ours.signature)).toBe(toHex(noble.toCompactRawBytes()));
      expect(ours.recoveryId).toBe(noble.recovery);
      expect(toHex(secp.recover(hash, ours.signature, ours.recoveryId)!)).toBe(toHex(secp256k1.getPublicKey(key, false)));
      expect(toHex(secp.publicKey(key))).toBe(toHex(secp256k1.getPublicKey(key, false)));
    }
  });

  it("refuses a key outside [1, n), and a signature that recovers nothing", () => {
    const hash = new Uint8Array(32).fill(1);
    expect(() => secp.signRecoverable(hash, new Uint8Array(32))).toThrow(TypeError);
    expect(() => secp.signRecoverable(hash, new Uint8Array(32).fill(0xff))).toThrow(TypeError);
    expect(() => secp.publicKey(new Uint8Array(32))).toThrow(TypeError);
    expect(secp.recover(hash, new Uint8Array(64), 0)).toBeNull();
    expect(() => secp.recover(hash, new Uint8Array(64).fill(1), 2)).toThrow(TypeError);
  });

  it("draws its blinding from the seed, so it never needs random numbers at module scope", () => {
    const seeded = signer(new Uint8Array(32).fill(9));
    const key = secp256k1.utils.randomPrivateKey();
    const original = crypto.getRandomValues;
    crypto.getRandomValues = () => {
      throw new Error("no random numbers here");
    };
    try {
      expect(seeded.publicKey(key)).toHaveLength(65);
    } finally {
      crypto.getRandomValues = original;
    }
  });
});
