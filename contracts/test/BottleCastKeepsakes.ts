import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { network } from "hardhat";
import {
  encodeFunctionData,
  getAddress,
  keccak256,
  maxUint256,
  toHex,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
} from "viem";

import BottleCastKeepsakesModule, { DEFAULT_IMAGE_BASE } from "../ignition/modules/BottleCastKeepsakes.js";

/** A keepsake's metadata, as `tokenURI` encodes it. */
interface Metadata {
  name: string;
  description: string;
  image: string;
  attributes: { trait_type: string; value: string | number; display_type?: string }[];
}

interface Mint {
  messageId: string;
  text: string;
  castAt: bigint;
  penName: string;
  writerMark: Hex;
  glass: number;
}

// The Keepsake-Detail screenshot test's bottle (KeepsakeScreenScreenshotTest), cast 2026-10-12.
const SAMPLE: Mint = {
  messageId: "prettycool0000000000",
  text: "Hey, that's pretty cool",
  castAt: 1_791_763_200n,
  penName: "Driftwood",
  writerMark: keccak256(toHex("a verified account")),
  glass: 0,
};

const MINTER_ROLE = keccak256(toHex("MINTER_ROLE"));
const DEFAULT_ADMIN_ROLE = zeroHash;

/** Decodes a `data:application/json;base64,` URI, refusing anything that isn't valid UTF-8 and valid JSON. */
function decodeJson<T>(uri: string): T {
  const prefix = "data:application/json;base64,";
  assert.ok(uri.startsWith(prefix), uri.slice(0, 40));
  const payload = uri.slice(prefix.length);
  const bytes = Buffer.from(payload, "base64");
  // Buffer skips characters that aren't base64, so check it round-trips, as stricter decoders need.
  assert.equal(bytes.toString("base64"), payload);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as T;
}

function trait(metadata: Metadata, traitType: string) {
  return metadata.attributes.find((attribute) => attribute.trait_type === traitType)?.value;
}

describe("BottleCastKeepsakes", async () => {
  const { viem, ignition, networkHelpers } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [admin, minter, finder, stranger] = await viem.getWalletClients();

  async function deployKeepsakes() {
    return viem.deployContract("BottleCastKeepsakes", [
      admin.account.address,
      minter.account.address,
      DEFAULT_IMAGE_BASE,
    ]);
  }

  async function deployWithOneKeepsake() {
    const keepsakes = await deployKeepsakes();
    await keepsakes.write.mint(mintArgs(finder.account.address), { account: minter.account });
    return keepsakes;
  }

  function mintArgs(to: Address, overrides: Partial<Mint> = {}) {
    const m = { ...SAMPLE, ...overrides };
    return [to, m.messageId, m.text, m.castAt, m.penName, m.writerMark, m.glass] as const;
  }

  /** Seals one bottle and returns its decoded metadata. */
  async function sealedMetadata(overrides: Partial<Mint> = {}): Promise<Metadata> {
    const keepsakes = await networkHelpers.loadFixture(deployKeepsakes);
    await keepsakes.write.mint(mintArgs(finder.account.address, overrides), { account: minter.account });
    return decodeJson<Metadata>(await keepsakes.read.tokenURI([1n]));
  }

  describe("roles", () => {
    it("names the minter role as the Worker will", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployKeepsakes);

      assert.equal(await keepsakes.read.MINTER_ROLE(), MINTER_ROLE);
      assert.equal(await keepsakes.read.hasRole([DEFAULT_ADMIN_ROLE, admin.account.address]), true);
      assert.equal(await keepsakes.read.hasRole([MINTER_ROLE, minter.account.address]), true);
      assert.equal(await keepsakes.read.hasRole([MINTER_ROLE, admin.account.address]), false);
    });

    it("lets only the minter mint", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployKeepsakes);

      for (const account of [stranger, admin, finder]) {
        await viem.assertions.revertWithCustomErrorWithArgs(
          keepsakes.write.mint(mintArgs(finder.account.address), { account: account.account }),
          keepsakes,
          "AccessControlUnauthorizedAccount",
          [getAddress(account.account.address), MINTER_ROLE],
        );
      }
    });

    it("lets the admin grant the minter role and take it back", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployKeepsakes);

      await keepsakes.write.grantRole([MINTER_ROLE, stranger.account.address]);
      await keepsakes.write.mint(mintArgs(finder.account.address), { account: stranger.account });
      await keepsakes.write.revokeRole([MINTER_ROLE, stranger.account.address]);

      assert.equal(await keepsakes.read.balanceOf([finder.account.address]), 1n);
      await viem.assertions.revertWithCustomError(
        keepsakes.write.mint(mintArgs(finder.account.address, { messageId: "another" }), { account: stranger.account }),
        keepsakes,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("doesn't let the minter grant roles or move the pictures", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployKeepsakes);

      await viem.assertions.revertWithCustomErrorWithArgs(
        keepsakes.write.grantRole([MINTER_ROLE, stranger.account.address], { account: minter.account }),
        keepsakes,
        "AccessControlUnauthorizedAccount",
        [getAddress(minter.account.address), DEFAULT_ADMIN_ROLE],
      );
      await viem.assertions.revertWithCustomErrorWithArgs(
        keepsakes.write.setImageBase(["https://example.com/"], { account: minter.account }),
        keepsakes,
        "AccessControlUnauthorizedAccount",
        [getAddress(minter.account.address), DEFAULT_ADMIN_ROLE],
      );
    });
  });

  describe("mint", () => {
    it("counts token ids up from 1", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployKeepsakes);

      const first = await keepsakes.simulate.mint(mintArgs(finder.account.address), {
        account: minter.account.address,
      });
      await keepsakes.write.mint(mintArgs(finder.account.address), { account: minter.account });
      const second = await keepsakes.simulate.mint(mintArgs(finder.account.address, { messageId: "lighthouse0000000000" }), {
        account: minter.account.address,
      });

      assert.equal(first.result, 1n);
      assert.equal(second.result, 2n);
      assert.equal(await keepsakes.read.ownerOf([1n]), getAddress(finder.account.address));
    });

    it("returns the token a bottle already has, without minting or moving anything", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployWithOneKeepsake);

      // given: the same bottle again, even to another wallet
      const again = mintArgs(stranger.account.address, { text: "Something else" });
      const { result } = await keepsakes.simulate.mint(again, { account: minter.account.address });

      // when
      const hash = await keepsakes.write.mint(again, { account: minter.account });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // then
      assert.equal(result, 1n);
      assert.equal(receipt.status, "success");
      assert.equal(receipt.logs.length, 0);
      assert.equal(await keepsakes.read.ownerOf([1n]), getAddress(finder.account.address));
      assert.equal(await keepsakes.read.balanceOf([finder.account.address]), 1n);
      assert.equal(await keepsakes.read.balanceOf([stranger.account.address]), 0n);
      assert.equal((await keepsakes.read.keepsake([1n])).text, SAMPLE.text);
    });

    it("keeps the record it was sealed with", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployWithOneKeepsake);

      assert.deepEqual(await keepsakes.read.keepsake([1n]), {
        messageId: SAMPLE.messageId,
        text: SAMPLE.text,
        penName: SAMPLE.penName,
        writerMark: SAMPLE.writerMark,
        castAt: SAMPLE.castAt,
        glass: SAMPLE.glass,
      });
      assert.equal(await keepsakes.read.tokenOfMessage([SAMPLE.messageId]), 1n);
    });

    it("emits a mint to the finder's wallet", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployKeepsakes);

      await viem.assertions.emitWithArgs(
        keepsakes.write.mint(mintArgs(finder.account.address), { account: minter.account }),
        keepsakes,
        "Transfer",
        [zeroAddress, getAddress(finder.account.address), 1n],
      );
    });

    it("refuses the zero address", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployKeepsakes);

      await viem.assertions.revertWithCustomErrorWithArgs(
        keepsakes.write.mint(mintArgs(zeroAddress), { account: minter.account }),
        keepsakes,
        "ERC721InvalidReceiver",
        [zeroAddress],
      );
    });
  });

  describe("limits", () => {
    async function assertMints(overrides: Partial<Mint>) {
      const keepsakes = await networkHelpers.loadFixture(deployKeepsakes);
      await keepsakes.write.mint(mintArgs(finder.account.address, overrides), { account: minter.account });
      assert.equal(await keepsakes.read.balanceOf([finder.account.address]), 1n);
    }

    it("takes a text of up to 280 bytes", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployKeepsakes);

      for (const text of ["a".repeat(280), "🌊".repeat(70)]) {
        assert.equal(Buffer.byteLength(text), 280);
        await assertMints({ text });
        await viem.assertions.revertWithCustomErrorWithArgs(
          keepsakes.write.mint(mintArgs(finder.account.address, { text: `${text}a` }), { account: minter.account }),
          keepsakes,
          "TextTooLong",
          [281n],
        );
      }
    });

    it("takes a pen name of up to 20 UTF-16 units, counting an emoji as two", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployKeepsakes);

      // ASCII, emoji (4 UTF-8 bytes, 2 units each) and CJK (3 bytes, 1 unit each), as the app's
      // isValidPenName counts them: by String.length.
      for (const penName of ["a".repeat(20), "🌊".repeat(10), "海".repeat(20), "🌊".repeat(9) + "ab"]) {
        assert.equal(penName.length, 20);
        await assertMints({ penName });
        await viem.assertions.revertWithCustomErrorWithArgs(
          keepsakes.write.mint(mintArgs(finder.account.address, { penName: `${penName}a` }), { account: minter.account }),
          keepsakes,
          "PenNameTooLong",
          [21n],
        );
      }
    });

    it("still bounds a malformed pen name: at least a unit for every 3 bytes", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployKeepsakes);

      // JavaScript strings always encode to well-formed UTF-8, so this patches the calldata: it
      // encodes a pen name of `count` x's, then swaps their bytes for `byte`.
      function mintWithPenNameBytes(byte: string, count: number) {
        const data = encodeFunctionData({
          abi: keepsakes.abi,
          functionName: "mint",
          args: mintArgs(finder.account.address, { penName: "x".repeat(count) }),
        });
        const patched = data.replace("78".repeat(count), byte.repeat(count)) as Hex;
        assert.notEqual(patched, data);
        return minter.sendTransaction({ account: minter.account, to: keepsakes.address, data: patched });
      }

      // Stray continuation bytes count a unit each; 3-byte leads without their tails, a unit per 3 bytes.
      await viem.assertions.revertWithCustomErrorWithArgs(mintWithPenNameBytes("bf", 21), keepsakes, "PenNameTooLong", [
        21n,
      ]);
      await viem.assertions.revertWithCustomErrorWithArgs(mintWithPenNameBytes("e0", 63), keepsakes, "PenNameTooLong", [
        21n,
      ]);
      await mintWithPenNameBytes("e0", 60);
      assert.equal(await keepsakes.read.balanceOf([finder.account.address]), 1n);
    });

    it("takes the three glasses and refuses a fourth", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployKeepsakes);

      await assertMints({ glass: 2 });
      for (const glass of [3, 255]) {
        await viem.assertions.revertWithCustomErrorWithArgs(
          keepsakes.write.mint(mintArgs(finder.account.address, { glass }), { account: minter.account }),
          keepsakes,
          "UnknownGlass",
          [glass],
        );
      }
    });

    it("needs a messageId", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployKeepsakes);

      await viem.assertions.revertWithCustomError(
        keepsakes.write.mint(mintArgs(finder.account.address, { messageId: "" }), { account: minter.account }),
        keepsakes,
        "EmptyMessageId",
      );
    });

    it("takes an unsigned bottle", async () => {
      await assertMints({ penName: "" });
    });
  });

  describe("tokenURI", () => {
    it("builds the keepsake's metadata from its record", async () => {
      const metadata = await sealedMetadata();

      assert.deepEqual(metadata, {
        name: "BottleCast #1",
        description: "Hey, that's pretty cool",
        image: "https://bottling-messages.web.app/keepsakes/flask-seaglass.png",
        attributes: [
          { trait_type: "Shape", value: "Flask" },
          { trait_type: "Glass", value: "Sea glass" },
          { trait_type: "Cast", display_type: "date", value: 1_791_763_200 },
          { trait_type: "Pen name", value: "Driftwood" },
          { trait_type: "Writer", value: "A verified account" },
        ],
      });
    });

    it("leaves the pen name out of an unsigned bottle", async () => {
      const metadata = await sealedMetadata({ penName: "" });

      assert.deepEqual(
        metadata.attributes.map((attribute) => attribute.trait_type),
        ["Shape", "Glass", "Cast", "Writer"],
      );
    });

    it("carries any text through JSON unchanged", async () => {
      const controls = Array.from({ length: 32 }, (_, code) => String.fromCharCode(code)).join("");
      const texts = [
        'She said "hello" and left',
        "C:\\shore\\bottles \\n is not a newline",
        "Line one\nline two\r\nand\ta tab",
        `Every control character: ${controls}\u007f`,
        "Waves 🌊, a toast 🍾 and a family 👩‍👩‍👧",
        "مرحبا بالعالم · שלום עולם \u200f(mixed) direction",
        "Separators \u2028 and \u2029 stay",
        '\\"}],"name":"not injected',
      ];

      for (const text of texts) {
        const metadata = await sealedMetadata({ text });
        assert.equal(metadata.description, text);
        assert.equal(metadata.name, "BottleCast #1");
      }
    });

    it("carries a 280-byte text made only of characters that need escaping", async () => {
      for (const text of ['"'.repeat(280), "\\".repeat(280), "\u0001".repeat(280), "\n".repeat(280)]) {
        const metadata = await sealedMetadata({ text });
        assert.equal(metadata.description, text);
      }
    });

    it("escapes the pen name", async () => {
      const penName = 'Mr "Q" \\ the 2nd';
      const metadata = await sealedMetadata({ penName });

      assert.equal(trait(metadata, "Pen name"), penName);
    });

    it("refuses a token that doesn't exist", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployWithOneKeepsake);

      await viem.assertions.revertWithCustomErrorWithArgs(
        keepsakes.read.tokenURI([2n]),
        keepsakes,
        "ERC721NonexistentToken",
        [2n],
      );
    });
  });

  describe("shape and glass", () => {
    // Byte 0 of SHA-256(messageId), mod 3, in BottleSilhouette's order, as bottleLookFor seeds it
    // (android/…/common/components/bottle/BottleLook.kt). The first three are the screenshot
    // fixtures' bottles; the last three are BottleLookTest's own vectors.
    const vectors = [
      { messageId: "prettycool0000000000", byte0: 0x0a, file: "flask", name: "Flask" },
      { messageId: "lighthouse0000000000", byte0: 0xad, file: "gourd", name: "Gourd" },
      { messageId: "smallwins00000000000", byte0: 0x8c, file: "gourd", name: "Gourd" },
      { messageId: "abc", byte0: 0xba, file: "classic", name: "Classic" },
      { messageId: "bottle-2", byte0: 0xa0, file: "flask", name: "Flask" },
      { messageId: "bottle-1", byte0: 0xc8, file: "gourd", name: "Gourd" },
    ];

    it("seeds the shape as the app does", async () => {
      for (const vector of vectors) {
        assert.equal(createHash("sha256").update(vector.messageId, "utf8").digest()[0], vector.byte0, vector.messageId);

        const metadata = await sealedMetadata({ messageId: vector.messageId });

        assert.equal(metadata.image, `${DEFAULT_IMAGE_BASE}${vector.file}-seaglass.png`, vector.messageId);
        assert.equal(trait(metadata, "Shape"), vector.name, vector.messageId);
      }
    });

    it("names each glass's picture and trait", async () => {
      const glasses = [
        { glass: 0, file: "seaglass", name: "Sea glass" },
        { glass: 1, file: "amber", name: "Amber glass" },
        { glass: 2, file: "moonglass", name: "Moonglass" },
      ];

      for (const { glass, file, name } of glasses) {
        const metadata = await sealedMetadata({ messageId: "abc", glass });

        assert.equal(metadata.image, `${DEFAULT_IMAGE_BASE}classic-${file}.png`);
        assert.equal(trait(metadata, "Glass"), name);
      }
    });
  });

  describe("image base", () => {
    it("lets the admin move the pictures, and tells marketplaces to refresh them", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployWithOneKeepsake);
      const newBase = "https://keepsakes.example.org/art/";

      const hash = await keepsakes.write.setImageBase([newBase]);
      await viem.assertions.emitWithArgs(hash, keepsakes, "BatchMetadataUpdate", [1n, maxUint256]);
      await viem.assertions.emit(hash, keepsakes, "ContractURIUpdated");

      assert.equal(await keepsakes.read.imageBase(), newBase);
      assert.equal(decodeJson<Metadata>(await keepsakes.read.tokenURI([1n])).image, `${newBase}flask-seaglass.png`);
      assert.equal(
        decodeJson<{ image: string }>(await keepsakes.read.contractURI()).image,
        `${newBase}classic-seaglass.png`,
      );
    });

    it("needs a base that ends in a slash", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployKeepsakes);

      for (const base of ["https://keepsakes.example.org/art", ""]) {
        await viem.assertions.revertWithCustomErrorWithArgs(
          keepsakes.write.setImageBase([base]),
          keepsakes,
          "ImageBaseWithoutSlash",
          [base],
        );
      }
      await viem.assertions.revertWithCustomError(
        viem.deployContract("BottleCastKeepsakes", [admin.account.address, minter.account.address, "https://x.org"]),
        keepsakes,
        "ImageBaseWithoutSlash",
      );
    });

    it("doesn't let anyone else move them", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployKeepsakes);

      await viem.assertions.revertWithCustomErrorWithArgs(
        keepsakes.write.setImageBase(["https://example.com/"], { account: stranger.account }),
        keepsakes,
        "AccessControlUnauthorizedAccount",
        [getAddress(stranger.account.address), DEFAULT_ADMIN_ROLE],
      );
    });
  });

  describe("contractURI", () => {
    it("describes the collection", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployKeepsakes);

      assert.deepEqual(decodeJson(await keepsakes.read.contractURI()), {
        name: "BottleCast keepsakes",
        description:
          "Messages found in bottles on BottleCast and sealed by their finders. Keepsakes are mementos, not money.",
        image: "https://bottling-messages.web.app/keepsakes/classic-seaglass.png",
        external_link: "https://play.google.com/store/apps/details?id=com.bottlecast.app",
      });
      assert.equal(await keepsakes.read.name(), "BottleCast keepsakes");
      assert.equal(await keepsakes.read.symbol(), "BOTTLE");
    });
  });

  describe("interfaces", () => {
    it("supports ERC-721, its metadata, ERC-4906, AccessControl and ERC-165", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployKeepsakes);
      const supported = {
        "ERC-721": "0x80ac58cd",
        "ERC-721 Metadata": "0x5b5e139f",
        "ERC-4906": "0x49064906",
        AccessControl: "0x7965db0b",
        "ERC-165": "0x01ffc9a7",
      } as const;

      for (const [name, id] of Object.entries(supported)) {
        assert.equal(await keepsakes.read.supportsInterface([id]), true, name);
      }
      assert.equal(await keepsakes.read.supportsInterface(["0xffffffff"]), false);
    });
  });

  describe("transfers", () => {
    it("lets the owner pass a keepsake on, with its record", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployWithOneKeepsake);
      const before = await keepsakes.read.tokenURI([1n]);

      await keepsakes.write.transferFrom([finder.account.address, stranger.account.address, 1n], {
        account: finder.account,
      });

      assert.equal(await keepsakes.read.ownerOf([1n]), getAddress(stranger.account.address));
      assert.equal(await keepsakes.read.tokenURI([1n]), before);
      assert.equal(await keepsakes.read.tokenOfMessage([SAMPLE.messageId]), 1n);
    });

    it("doesn't let anyone else move it, the minter and admin included", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployWithOneKeepsake);

      for (const account of [stranger, minter, admin]) {
        await viem.assertions.revertWithCustomErrorWithArgs(
          keepsakes.write.transferFrom([finder.account.address, account.account.address, 1n], {
            account: account.account,
          }),
          keepsakes,
          "ERC721InsufficientApproval",
          [getAddress(account.account.address), 1n],
        );
      }
    });
  });

  describe("lookups", () => {
    it("knows no token for a bottle that isn't sealed", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployWithOneKeepsake);

      assert.equal(await keepsakes.read.tokenOfMessage(["lighthouse0000000000"]), 0n);
      assert.equal(await keepsakes.read.tokenOfMessage([""]), 0n);
      await viem.assertions.revertWithCustomErrorWithArgs(
        keepsakes.read.keepsake([2n]),
        keepsakes,
        "ERC721NonexistentToken",
        [2n],
      );
    });
  });

  describe("deploying", () => {
    it("refuses a zero admin, who could never be replaced", async () => {
      const keepsakes = await networkHelpers.loadFixture(deployKeepsakes);

      await viem.assertions.revertWithCustomError(
        viem.deployContract("BottleCastKeepsakes", [zeroAddress, minter.account.address, DEFAULT_IMAGE_BASE]),
        keepsakes,
        "ZeroAdmin",
      );
    });
  });

  describe("Ignition module", () => {
    it("deploys with the minter it's given, the deployer as admin and the hosted pictures", async () => {
      const { keepsakes } = await ignition.deploy(BottleCastKeepsakesModule, {
        parameters: { BottleCastKeepsakes: { minter: minter.account.address } },
      });

      assert.equal(await keepsakes.read.hasRole([DEFAULT_ADMIN_ROLE, admin.account.address]), true);
      assert.equal(await keepsakes.read.hasRole([MINTER_ROLE, minter.account.address]), true);
      assert.equal(await keepsakes.read.imageBase(), DEFAULT_IMAGE_BASE);
    });
  });
});
