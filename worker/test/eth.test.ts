import {
  encodeDeployData,
  encodeFunctionData,
  erc6492SignatureValidatorAbi,
  erc6492SignatureValidatorByteCode,
  getAddress,
  hashMessage,
  isErc6492Signature,
  parseAbi,
  serializeErc6492Signature,
  toHex,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount, publicKeyToAddress } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { hexToBytes } from "../src/bytes.ts";
import { ERC6492_VALIDATOR_BYTECODE } from "../src/erc6492-validator.ts";
import {
  addressFromPublicKey,
  decodeAddress,
  decodeUint,
  encodeL1FeeUpperBound,
  encodeOwnerOf,
  encodeTokenOfMessage,
  erc6492ValidatorCall,
  isErc6492,
  isValidatorYes,
  mintedTransfer,
  parseAddress,
  parseReceipt,
  personalMessageHash,
  recoverSigner,
  refusalOf,
  toChecksumAddress,
} from "../src/eth.ts";
import { signer } from "./helpers.ts";

const secp = signer();
const abi = parseAbi([
  "function tokenOfMessage(string messageId) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getL1FeeUpperBound(uint256 unsignedTxSize) view returns (uint256)",
]);

describe("addresses", () => {
  it("checksums as viem does, and parses every case it should", () => {
    for (let i = 0; i < 20; i++) {
      const address = privateKeyToAccount(generatePrivateKey()).address;
      const lower = address.toLowerCase() as Hex;
      expect(toChecksumAddress(lower)).toBe(getAddress(lower));
      expect(parseAddress(address)).toBe(lower);
      expect(parseAddress(lower)).toBe(lower);
      expect(parseAddress(`0x${lower.slice(2).toUpperCase()}`)).toBe(lower);
    }
  });

  it("refuses the zero address, a broken checksum and anything else", () => {
    const address = getAddress("0x9a8f2e4b7c6d5a3f1e0b9c8d7a6f5e4d3c2b1a09");
    const broken = address.replace(/[a-f]/, (c) => c.toUpperCase());
    expect(parseAddress(`0x${"00".repeat(20)}`)).toBeNull();
    expect(parseAddress(broken)).toBeNull();
    for (const bad of ["", "0x12", `${address}00`, address.slice(2), 42, null, undefined]) expect(parseAddress(bad)).toBeNull();
  });

  it("derives an address from a public key as viem does", () => {
    const key = hexToBytes(generatePrivateKey());
    const publicKey = secp.publicKey(key);
    expect(addressFromPublicKey(publicKey)).toBe(publicKeyToAddress(toHex(publicKey)).toLowerCase());
  });
});

describe("personal_sign", () => {
  it("hashes as viem does, and recovers the signer for v 27, 28, 0 and 1", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    for (const message of ["", "Link this wallet to BottleCast", "🌊\nline two"]) {
      expect(toHex(personalMessageHash(message))).toBe(hashMessage(message));
      const signature = hexToBytes(await account.signMessage({ message }));
      const hash = personalMessageHash(message);
      expect(recoverSigner(secp, hash, signature)).toBe(account.address.toLowerCase());
      const zeroOne = signature.slice();
      zeroOne[64] -= 27;
      expect(recoverSigner(secp, hash, zeroOne)).toBe(account.address.toLowerCase());
      const otherV = signature.slice();
      otherV[64] = signature[64] === 27 ? 28 : 27;
      expect(recoverSigner(secp, hash, otherV)).not.toBe(account.address.toLowerCase());
      const badV = signature.slice();
      badV[64] = 29;
      expect(recoverSigner(secp, hash, badV)).toBeNull();
      expect(recoverSigner(secp, hash, signature.subarray(0, 64))).toBeNull();
    }
  });
});

describe("contract calls", () => {
  it("encode tokenOfMessage, ownerOf and the L1 fee bound as viem does", () => {
    for (const id of ["", "Vb3kQm9TzR2xLp8sWn4E", "x".repeat(33)]) {
      expect(encodeTokenOfMessage(id)).toBe(encodeFunctionData({ abi, functionName: "tokenOfMessage", args: [id] }));
    }
    expect(encodeOwnerOf(142n)).toBe(encodeFunctionData({ abi, functionName: "ownerOf", args: [142n] }));
    expect(encodeL1FeeUpperBound(900)).toBe(encodeFunctionData({ abi, functionName: "getL1FeeUpperBound", args: [900n] }));
  });

  it("decode a uint and an address word, and read no code as 0", () => {
    expect(decodeUint(`0x${"00".repeat(31)}2a`)).toBe(42n);
    expect(decodeUint("0x")).toBe(0n);
    expect(decodeUint(`0x${"00".repeat(31)}01${"ff".repeat(32)}`)).toBe(1n);
    expect(decodeAddress(`0x${"00".repeat(12)}9a8f2e4b7c6d5a3f1e0b9c8d7a6f5e4d3c2b1a09`)).toBe("0x9a8f2e4b7c6d5a3f1e0b9c8d7a6f5e4d3c2b1a09");
    expect(() => decodeUint("nope")).toThrow();
  });
});

describe("ERC-6492", () => {
  it("carries viem's copy of the validator", () => {
    expect(ERC6492_VALIDATOR_BYTECODE).toBe(erc6492SignatureValidatorByteCode);
  });

  it("encodes the validator call as viem's encodeDeployData does", () => {
    const signer = "0x9a8f2e4b7c6d5a3f1e0b9c8d7a6f5e4d3c2b1a09";
    const hash = hashMessage("hello");
    for (const signature of [`0x${"11".repeat(65)}`, `0x${"22".repeat(300)}`] as const) {
      expect(erc6492ValidatorCall(signer, hexToBytes(hash), hexToBytes(signature))).toBe(
        encodeDeployData({
          abi: erc6492SignatureValidatorAbi,
          args: [signer, hash, signature],
          bytecode: erc6492SignatureValidatorByteCode,
        }),
      );
    }
  });

  it("spots a wrapped signature as viem does", () => {
    const plain: Hex = `0x${"11".repeat(65)}`;
    const wrapped = serializeErc6492Signature({
      address: "0x9a8f2e4b7c6d5a3f1e0b9c8d7a6f5e4d3c2b1a09",
      data: "0xdeadbeef",
      signature: plain,
    });
    expect(isErc6492(hexToBytes(plain))).toBe(isErc6492Signature(plain));
    expect(isErc6492(hexToBytes(wrapped))).toBe(true);
    expect(isErc6492Signature(wrapped)).toBe(true);
  });

  it("reads only a validator's 1 as yes", () => {
    expect(isValidatorYes("0x01")).toBe(true);
    expect(isValidatorYes(`0x${"00".repeat(31)}01`)).toBe(true);
    for (const answer of ["0x00", "0x", "0x02", undefined, null, 1]) expect(isValidatorYes(answer)).toBe(false);
  });
});

describe("receipts", () => {
  const contract = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
  const to = "0x9a8f2e4b7c6d5a3f1e0b9c8d7a6f5e4d3c2b1a09";
  const transfer = {
    address: contract.toUpperCase().replace("0X", "0x"),
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      `0x${"00".repeat(32)}`,
      `0x${"00".repeat(12)}${to.slice(2)}`,
      `0x${"00".repeat(31)}8e`,
    ],
  };

  it("finds the keepsake a receipt minted, from the contract's Transfer from zero", () => {
    const receipt = parseReceipt({ transactionHash: `0x${"AB".repeat(32)}`, status: "0x1", logs: [{ address: to, topics: [] }, transfer] })!;
    expect(receipt.status).toBe(1);
    expect(receipt.transactionHash).toBe(`0x${"ab".repeat(32)}`);
    expect(mintedTransfer(receipt, contract)).toEqual({ tokenId: 142n, to });
  });

  it("ignores another contract's Transfer, or one that isn't a mint", () => {
    const fromSomeone = { ...transfer, topics: [transfer.topics[0], transfer.topics[2], transfer.topics[2], transfer.topics[3]] };
    const elsewhere = { ...transfer, address: to };
    const receipt = parseReceipt({ transactionHash: "0x01", status: "0x1", logs: [fromSomeone, elsewhere] })!;
    expect(mintedTransfer(receipt, contract)).toBeNull();
  });

  it("reads a missing receipt as null and a malformed one as an error", () => {
    expect(parseReceipt(null)).toBeNull();
    expect(() => parseReceipt({ status: "0x1" })).toThrow();
  });

  it("names the contract's refusals from a JSON-RPC error's data, wherever the node puts it", () => {
    expect(refusalOf({ data: "0xe2517d3f0000" })).toBe("no_minter_role");
    expect(refusalOf({ data: { data: "0x0f1a9ab5" } })).toBe("too_long");
    expect(refusalOf({ data: "0x8cb0bca7" })).toBe("too_long");
    expect(refusalOf({ data: "0x64a0ae92" })).toBe("bad_recipient");
    expect(refusalOf({ data: "0x08c379a0" })).toBe("reverted");
    expect(refusalOf({})).toBe("reverted");
  });
});
