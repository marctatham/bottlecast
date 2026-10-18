// The local end-to-end run (README.md): wallets linked through the Worker, seals asked for through
// firebase/'s rules, the cron fired, and the keepsakes read back from the chain. It runs a Hardhat
// node with the contract deployed by its Ignition module, the Firestore emulator and `wrangler dev`,
// on this machine with throwaway keys, and stops them all when it's done.
//   cd worker && npm run e2e
import { strict as assert } from "node:assert";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  keccak256,
  parseEther,
  toHex,
  type Abi,
  type Hex,
  type LocalAccount,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { base64UrlEncode, utf8 } from "../src/bytes.ts";
import { DELETE_FIELD, Firestore, setWrite, updateWrite, type Doc } from "../src/firestore.ts";
import { CONTRACTS, EMULATOR_HOST, HARDHAT_URL, PROJECT_ID, Stack } from "./stack.ts";
import { counterfactualAddress, FACTORY_RUNTIME, walletRuntime, wrap6492 } from "./test-wallet.ts";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const WORKER_PORT = 8799;
const WRITER = "writerE2e000000000000000001";
const KEEPER = "keeperE2e00000000000000001";
const OTHER = "otherE2e000000000000000001";
// Hardhat's first account: public, and the contract's admin when Ignition deploys to the node.
const HARDHAT_ADMIN_KEY: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEXT = "Leave the porch light on for the people still finding their way home. 🌊";
const MINTER_ROLE = keccak256(toHex("MINTER_ROLE"));

const stack = new Stack();
let failed = false;
try {
  await main();
  console.log("\nThe end-to-end run passed.");
} catch (error) {
  failed = true;
  console.error(error);
  console.error(`\nThe services' output is in ${stack.scratch}`);
} finally {
  await stack.stop();
}
process.exit(failed ? 1 : 0);

async function main(): Promise<void> {
  const minterKey = generatePrivateKey();
  const minter = privateKeyToAccount(minterKey);
  const markKey = randomHex(32);
  const idKeys = await generateKeyPair("RS256", { extractable: true });

  step("Starting a Hardhat node");
  await stack.startHardhat();
  const chain = createPublicClient({ chain: hardhat, transport: http(HARDHAT_URL) });
  const admin = createWalletClient({ chain: hardhat, transport: http(HARDHAT_URL), account: privateKeyToAccount(HARDHAT_ADMIN_KEY) });
  const hardhatRequest = (method: string, params: unknown[]) =>
    (chain.request as (args: { method: string; params: unknown[] }) => Promise<unknown>)({ method, params });
  await hardhatRequest("hardhat_setBalance", [minter.address, toHex(parseEther("10"))]);

  step("Deploying the contract with its Ignition module");
  const contract = await stack.deployContract(minter.address);
  const abi = (JSON.parse(readFileSync(join(CONTRACTS, "artifacts/contracts/BottleCastKeepsakes.sol/BottleCastKeepsakes.json"), "utf8")) as { abi: Abi }).abi;
  const read = (functionName: string, args: unknown[]) => chain.readContract({ address: contract, abi, functionName, args });

  step("Starting the Firestore emulator, with firebase/'s rules");
  await stack.startEmulator();
  const jwksUrl = await stack.serveJwks({ keys: [{ ...(await exportJWK(idKeys.publicKey)), kid: "e2e", alg: "RS256", use: "sig" }] });

  step("Starting the Worker under wrangler dev");
  const worker = await stack.startWorker(WORKER_PORT, {
    CHAIN_ID: "31337",
    RPC_URL: HARDHAT_URL,
    CONTRACT_ADDRESS: contract,
    FIRESTORE_EMULATOR_HOST: EMULATOR_HOST,
    JWKS_URL: jwksUrl,
    FIREBASE_PROJECT_ID: PROJECT_ID,
    RECEIPT_WAIT_MS: "1500",
    MINTER_KEY: minterKey,
    SIGNER_SEED: randomHex(32),
    MARK_KEY: markKey,
    NONCE_KEY: randomHex(32),
  });

  const owner = new Firestore(PROJECT_ID, async () => "owner", async () => undefined, EMULATOR_HOST);
  const asUser = (uid: string) => new Firestore(PROJECT_ID, async () => mockToken(uid), async () => undefined, EMULATOR_HOST);
  const doc = async (...path: string[]): Promise<Doc | null> => {
    const name = owner.path(...path);
    return (await owner.batchGet([name])).docs.get(name) ?? null;
  };

  const idToken = (uid: string) =>
    new SignJWT({ auth_time: Math.floor(Date.now() / 1000) - 60, firebase: { sign_in_provider: "google.com", identities: { "google.com": ["1"] } } })
      .setProtectedHeader({ alg: "RS256", kid: "e2e", typ: "JWT" })
      .setIssuer(`https://securetoken.google.com/${PROJECT_ID}`)
      .setAudience(PROJECT_ID)
      .setSubject(uid)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(idKeys.privateKey);

  async function post(path: string, uid: string, body: object): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await fetch(`${worker}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await idToken(uid)}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  /** Links `address` for `uid`, signing the Worker's message with `sign`. */
  async function link(uid: string, address: Hex, sign: (message: string) => Promise<Hex>, extra: object = {}) {
    const nonce = await post("/wallet/nonce", uid, { address });
    assert.equal(nonce.status, 200, JSON.stringify(nonce.body));
    const message = nonce.body.message as string;
    return post("/wallet/link", uid, { message, signature: await sign(message), ...extra });
  }
  const signer = (account: LocalAccount) => (message: string) => account.signMessage({ message });

  async function cron(): Promise<void> {
    const response = await fetch(`${worker}/__scheduled?cron=*+*+*+*+*`);
    assert.equal(response.status, 200, `The cron run failed: ${await response.text()}; see ${stack.log("wrangler")}`);
  }

  /** A sealable bottle cast `age` ago by WRITER and kept by `keeper`, its claim pending_wallet. */
  async function seedKept(id: string, { age = 2 * DAY, keeper = KEEPER, penName = "Driftwood" as string | null } = {}) {
    const createdAt = Date.now() - age;
    const keptAt = new Date(Date.now() - 10 * 60 * 1000);
    await owner.commit([
      setWrite(owner.path("messages", id), {
        id,
        messageContent: TEXT,
        userId: WRITER,
        createdAt: new Date(createdAt),
        lang: "en",
        status: "kept",
        rand: 0.5,
        penName,
        sealable: true,
        reportCount: 0,
        findCount: 1,
        foundAt: new Date(Date.now() - HOUR),
        keptAt,
      }),
      setWrite(owner.path("claims", id), { messageId: id, keeperUid: keeper, status: "pending_wallet", keptAt }),
    ]);
    return createdAt;
  }

  /** The keeper's own write, through the rules, as the app makes it. */
  async function askToSeal(id: string, to: Hex, createdAt: number, keeper = KEEPER, sealAfter = createdAt + DAY) {
    await asUser(keeper).commit([
      updateWrite(
        owner.path("claims", id),
        { status: "cooling", sealAfter: new Date(sealAfter), to: to.toLowerCase(), error: DELETE_FIELD },
        { exists: true },
      ),
    ]);
  }

  async function clearLease(): Promise<void> {
    await owner.commit([updateWrite(owner.path("minter", "state"), { leaseUntil: new Date(0) }, { exists: true })]);
  }

  async function expectMinted(id: string, tokenId: number, to: Hex, writerUid: string, penName: string | null) {
    const claim = await doc("claims", id);
    assert.equal(claim?.data.status, "minted", `claim ${id}: ${JSON.stringify(claim?.data)}`);
    assert.equal(claim.data.tokenId, tokenId);
    assert.equal(claim.data.to, to.toLowerCase());
    assert.match(String(claim.data.txHash), /^0x[0-9a-f]{64}$/);
    assert.ok(claim.data.mintedAt instanceof Date);
    assert.equal(claim.data.delayedSince, undefined);
    assert.ok((await doc("messages", id))?.data.sealedAt instanceof Date, "the bottle's sealedAt");
    assert.equal(getAddress((await read("ownerOf", [BigInt(tokenId)])) as Hex), getAddress(to));
    assert.equal(await read("tokenOfMessage", [id]), BigInt(tokenId));
    const keepsake = (await read("keepsake", [BigInt(tokenId)])) as { writerMark: Hex; penName: string; glass: number };
    const mark = createHmac("sha256", Buffer.from(markKey.slice(2), "hex")).update(`${writerUid}:${id}`).digest("hex");
    assert.equal(keepsake.writerMark, `0x${mark}`, "the verified mark");
    assert.equal(keepsake.penName, penName ?? "");
    assert.equal(keepsake.glass, 0);
  }

  // ---------- 1. An ordinary wallet ----------
  step("1. Linking a wallet, asking to seal through the rules, firing the cron");
  const wallet1 = privateKeyToAccount(generatePrivateKey());
  const linked = await link(KEEPER, wallet1.address, signer(wallet1), { walletName: "Rainbow" });
  assert.equal(linked.status, 200, JSON.stringify(linked.body));
  assert.deepEqual(linked.body, { address: wallet1.address, receiving: true });
  const walletDoc = await doc("users", KEEPER, "wallets", wallet1.address.toLowerCase());
  assert.deepEqual(
    { address: walletDoc?.data.address, receiving: walletDoc?.data.receiving, walletName: walletDoc?.data.walletName },
    { address: wallet1.address, receiving: true, walletName: "Rainbow" },
  );
  assert.equal((await doc("walletIndex", wallet1.address.toLowerCase()))?.data.uid, KEEPER);

  const m1 = "e2eBottle00000000001";
  const cast1 = await seedKept(m1);
  await assert.rejects(askToSeal(m1, wallet1.address, cast1, KEEPER, cast1 + DAY - 1000), /PERMISSION_DENIED/, "a wrong sealAfter");
  await assert.rejects(askToSeal(m1, wallet1.address, cast1, OTHER), /PERMISSION_DENIED/, "someone else's claim");
  await askToSeal(m1, wallet1.address, cast1);
  await cron();
  await expectMinted(m1, 1, wallet1.address, WRITER, "Driftwood");
  const metadata = JSON.parse(
    Buffer.from(String(await read("tokenURI", [1n])).replace("data:application/json;base64,", ""), "base64").toString("utf8"),
  ) as { name: string; description: string; image: string; attributes: { trait_type: string; value: unknown }[] };
  const shape = ["classic", "flask", "gourd"][createHash("sha256").update(m1).digest()[0] % 3];
  assert.equal(metadata.name, "BottleCast #1");
  assert.equal(metadata.description, TEXT);
  assert.equal(metadata.image, `https://bottling-messages.web.app/keepsakes/${shape}-seaglass.png`);
  const traits = Object.fromEntries(metadata.attributes.map((trait) => [trait.trait_type, trait.value]));
  assert.deepEqual(traits, {
    Shape: shape[0].toUpperCase() + shape.slice(1),
    Glass: "Sea glass",
    Cast: Math.floor(cast1 / 1000),
    "Pen name": "Driftwood",
    Writer: "A verified account",
  });
  const state = await doc("minter", "state");
  assert.equal(state?.data.nextNonce, 1);
  assert.equal(state?.data.inFlight, undefined);
  await cron(); // nothing due: idle
  ok("minted #1 to the wallet, with its words, picture, cast date, pen name and mark");

  // ---------- 2. A writer who deleted their account after the ask ----------
  step("2. A writer who deletes their account after the ask");
  const m2 = "e2eBottle00000000002";
  const cast2 = await seedKept(m2);
  await askToSeal(m2, wallet1.address, cast2);
  await owner.commit([updateWrite(owner.path("messages", m2), { userId: null, penName: null }, { exists: true })]);
  await cron();
  await expectMinted(m2, 2, wallet1.address, "(deleted)", null);
  ok("sealed with the stand-in mark and no pen name");

  // ---------- 3. A minter that can't pay ----------
  step("3. The minter runs dry, then is topped up");
  const m3 = "e2eBottle00000000003";
  const cast3 = await seedKept(m3);
  await askToSeal(m3, wallet1.address, cast3);
  await hardhatRequest("hardhat_setBalance", [minter.address, "0x0"]);
  await cron();
  let claim3 = await doc("claims", m3);
  assert.equal(claim3?.data.status, "cooling");
  assert.ok(claim3.data.delayedSince instanceof Date, "delayedSince");
  await hardhatRequest("hardhat_setBalance", [minter.address, toHex(parseEther("10"))]);
  await cron();
  await expectMinted(m3, 3, wallet1.address, WRITER, "Driftwood");
  ok("delayed while the minter was empty, sealed once it was topped up");

  // ---------- 4. Mints that aren't mined at once ----------
  step("4. A mint that isn't mined at once, and one the node drops");
  await hardhatRequest("evm_setAutomine", [false]);
  const m4 = "e2eBottle00000000004";
  const cast4 = await seedKept(m4);
  await askToSeal(m4, wallet1.address, cast4);
  await cron();
  const claim4 = await doc("claims", m4);
  assert.equal(claim4?.data.status, "minting");
  const inFlight = (await doc("minter", "state"))?.data.inFlight as { messageId?: string } | undefined;
  assert.equal(inFlight?.messageId, m4);
  await cron(); // the lease holds: nothing happens
  assert.equal((await doc("claims", m4))?.data.status, "minting");
  await hardhatRequest("evm_mine", []);
  await clearLease();
  await cron();
  await expectMinted(m4, 4, wallet1.address, WRITER, "Driftwood");

  const m5 = "e2eBottle00000000005";
  const cast5 = await seedKept(m5);
  await askToSeal(m5, wallet1.address, cast5);
  await cron();
  const txHash5 = (await doc("claims", m5))?.data.txHash as Hex;
  assert.equal(await hardhatRequest("hardhat_dropTransaction", [txHash5]), true, "the node dropped the mint");
  await clearLease();
  await cron(); // rebroadcasts it
  await hardhatRequest("evm_mine", []);
  await clearLease();
  await cron();
  await expectMinted(m5, 5, wallet1.address, WRITER, "Driftwood");
  await hardhatRequest("evm_setAutomine", [true]);
  ok("finished a mint mined late, and rebroadcast one the node dropped");

  // ---------- 5. Unlinking ----------
  step("5. Unlinking re-points a seal, then sends it back to the chest");
  const wallet2 = privateKeyToAccount(generatePrivateKey());
  const second = await link(KEEPER, wallet2.address, signer(wallet2));
  assert.deepEqual(second.body, { address: wallet2.address, receiving: false });
  const m6 = "e2eBottle00000000006";
  const cast6 = await seedKept(m6, { age: HOUR }); // its safety check runs another 23 hours
  await askToSeal(m6, wallet1.address, cast6);
  await cron();
  assert.equal((await doc("claims", m6))?.data.status, "cooling", "not due yet");
  const unlinked = await post("/wallet/unlink", KEEPER, { address: wallet1.address });
  assert.deepEqual(unlinked.body, { receiving: wallet2.address });
  assert.equal(await doc("users", KEEPER, "wallets", wallet1.address.toLowerCase()), null);
  assert.equal(await doc("walletIndex", wallet1.address.toLowerCase()), null);
  assert.equal((await doc("users", KEEPER, "wallets", wallet2.address.toLowerCase()))?.data.receiving, true);
  assert.equal((await doc("claims", m6))?.data.to, wallet2.address.toLowerCase());
  const last = await post("/wallet/unlink", KEEPER, { address: wallet2.address });
  assert.deepEqual(last.body, { receiving: null });
  const claim6 = await doc("claims", m6);
  assert.equal(claim6?.data.status, "pending_wallet");
  assert.equal(claim6.data.to, undefined);
  assert.equal(claim6.data.sealAfter, undefined);
  ok("re-pointed to the receiving wallet, then back to pending_wallet when none was left");

  // ---------- 6. Refusals ----------
  step("6. A wallet another account holds, and a signature that isn't the wallet's");
  const wallet3 = privateKeyToAccount(generatePrivateKey());
  assert.equal((await link(KEEPER, wallet3.address, signer(wallet3))).status, 200);
  const taken = await link(OTHER, wallet3.address, signer(wallet3));
  assert.deepEqual([taken.status, taken.body], [409, { error: "wallet_taken" }]);
  const stranger = privateKeyToAccount(generatePrivateKey());
  const forged = await link(OTHER, privateKeyToAccount(generatePrivateKey()).address, signer(stranger));
  assert.deepEqual([forged.status, forged.body], [400, { error: "bad_signature" }]);
  const noToken = await fetch(`${worker}/wallet/nonce`, { method: "POST", body: "{}" });
  assert.equal(noToken.status, 401);
  ok("refused with wallet_taken, bad_signature and unauthenticated");

  // ---------- 7. Smart wallets ----------
  step("7. Smart wallets: one deployed (EIP-1271), one not yet (ERC-6492)");
  const smartOwner = privateKeyToAccount(generatePrivateKey());
  const deployed: Hex = "0x00000000000000000000000000000000b0771c11";
  await hardhatRequest("hardhat_setCode", [deployed, walletRuntime(smartOwner.address)]);
  const smart = await link(OTHER, deployed, signer(smartOwner));
  assert.deepEqual([smart.status, smart.body], [200, { address: getAddress(deployed), receiving: true }]);
  const factory: Hex = "0x00000000000000000000000000000000fac70121";
  await hardhatRequest("hardhat_setCode", [factory, FACTORY_RUNTIME]);
  const counterfactual = counterfactualAddress(factory, smartOwner.address);
  assert.equal(await chain.getCode({ address: counterfactual }), undefined, "the wallet isn't deployed");
  const later = await link(OTHER, counterfactual, async (message) =>
    wrap6492(factory, smartOwner.address, await smartOwner.signMessage({ message })),
  );
  assert.deepEqual([later.status, later.body], [200, { address: counterfactual, receiving: false }]);
  const notTheOwner = await link(OTHER, deployed, signer(stranger));
  assert.deepEqual([notTheOwner.status, notTheOwner.body], [400, { error: "bad_signature" }]);
  ok("linked both, and refused a signature from someone else");

  // ---------- 8. A minter without its role ----------
  step("8. The minter loses its role, then gets it back");
  const wallet4 = privateKeyToAccount(generatePrivateKey());
  await link(KEEPER, wallet4.address, signer(wallet4));
  const m7 = "e2eBottle00000000007";
  const cast7 = await seedKept(m7, { penName: null });
  await askToSeal(m7, wallet4.address, cast7);
  await chain.waitForTransactionReceipt({
    hash: await admin.writeContract({ address: contract, abi, functionName: "revokeRole", args: [MINTER_ROLE, minter.address] }),
  });
  await cron();
  const claim7 = await doc("claims", m7);
  assert.equal(claim7?.data.status, "cooling");
  assert.ok(claim7.data.delayedSince instanceof Date, "delayedSince");
  await chain.waitForTransactionReceipt({
    hash: await admin.writeContract({ address: contract, abi, functionName: "grantRole", args: [MINTER_ROLE, minter.address] }),
  });
  await cron();
  await expectMinted(m7, 6, wallet4.address, WRITER, null);
  ok("delayed without its role, sealed once it was granted again");
}

function mockToken(uid: string): string {
  const segment = (json: object) => base64UrlEncode(utf8.encode(JSON.stringify(json)));
  const now = Math.floor(Date.now() / 1000);
  return `${segment({ alg: "none", typ: "JWT" })}.${segment({
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    iat: now,
    exp: now + 3600,
    auth_time: now,
    sub: uid,
    user_id: uid,
    firebase: { sign_in_provider: "google.com", identities: { "google.com": ["1"] } },
  })}.`;
}

function randomHex(bytes: number): Hex {
  return `0x${randomBytes(bytes).toString("hex")}`;
}

function step(text: string): void {
  console.log(`\n${text}`);
}

function ok(text: string): void {
  console.log(`  ✓ ${text}`);
}
