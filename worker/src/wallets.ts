// /wallet/nonce, /wallet/link and /wallet/unlink (spec §1.7, §3.9; decisions.md, 2026-10-18). A wallet
// is linked once it signs the Worker's "Prove it's yours" message. Each link or unlink is one
// Firestore transaction over the account's wallets, the address's index entry and, for unlink, the
// account's claims still cooling for that address. Nothing goes on users/{uid}, whose keys the rules
// pin.
import { hexToBytes, timingSafeEqual, utf8, type Hex } from "./bytes.ts";
import type { Config } from "./config.ts";
import {
  erc6492ValidatorCall,
  isErc6492,
  isValidatorYes,
  parseAddress,
  personalMessageHash,
  recoverSigner,
  toChecksumAddress,
} from "./eth.ts";
import {
  and,
  DELETE_FIELD,
  deleteWrite,
  SERVER_TIME,
  setWrite,
  updateWrite,
  where,
  type Doc,
  type Firestore,
  type Write,
} from "./firestore.ts";
import { HttpError } from "./http.ts";
import { rpcBatch, RpcUnavailable } from "./rpc.ts";
import type { Secp256k1Wasm } from "./secp256k1-wasm.ts";
import { buildSiweMessage, parseIsoTime, parseSiweMessage, SIWE_LIFETIME_MS, SIWE_STATEMENT, siweNonce } from "./siwe.ts";

export interface WalletServices {
  config: Config;
  secp: Secp256k1Wasm;
  firestore: Firestore;
  nonceKey: Promise<CryptoKey>;
}

/** A message issued this far in the future still passes, for clocks a little apart. */
const SKEW_MS = 60_000;
const MAX_SIGNATURE_BYTES = 4096;
const MAX_WALLET_NAME = 40;
/** Claims a single unlink re-points; a commit holds 500 writes. */
const MAX_CLAIMS_PER_UNLINK = 400;

/** POST /wallet/nonce `{address}`: the message for the wallet to sign. Stores nothing. */
export async function walletNonce(
  services: WalletServices,
  uid: string,
  body: Record<string, unknown>,
  now: number,
): Promise<{ message: string; expiresAt: string }> {
  const address = parseAddress(body.address);
  if (!address) throw new HttpError(400, "bad_request");
  const { config } = services;
  const issuedAt = new Date(now).toISOString();
  const expirationTime = new Date(now + SIWE_LIFETIME_MS).toISOString();
  const message = buildSiweMessage({
    domain: config.siweDomain,
    address: toChecksumAddress(address),
    statement: SIWE_STATEMENT,
    uri: config.siweUri,
    chainId: config.chainId,
    nonce: await siweNonce(await services.nonceKey, uid, address, issuedAt),
    issuedAt,
    expirationTime,
  });
  return { message, expiresAt: expirationTime };
}

/** POST /wallet/link `{message, signature, receiving?, walletName?}`. */
export async function walletLink(
  services: WalletServices,
  uid: string,
  body: Record<string, unknown>,
  now: number,
): Promise<{ address: Hex; receiving: boolean }> {
  if (body.receiving !== undefined && typeof body.receiving !== "boolean") throw new HttpError(400, "bad_request");
  const walletName = parseWalletName(body.walletName);
  const address = await verifyWalletProof(services, uid, body.message, body.signature, now);
  const checksum = toChecksumAddress(address);
  const fs = services.firestore;
  const indexName = fs.path("walletIndex", address);
  const tombstoneName = fs.path("deletions", uid);
  const walletDoc = walletPath(fs, uid, address);
  const read = await fs.batchGet([indexName, tombstoneName], { newTransaction: true });
  const transaction = read.transaction!;
  try {
    if (read.docs.get(tombstoneName)) throw new HttpError(403, "account_closing");
    const writes: Write[] = [];
    const holder = read.docs.get(indexName)?.data.uid;
    if (typeof holder === "string" && holder !== uid) {
      // Another account holds it. Only one being deleted gives it up, and its copy goes too, so its
      // eraser never meets an index entry it no longer owns.
      const theirTombstone = fs.path("deletions", holder);
      const theirs = await fs.batchGet([theirTombstone], { transaction });
      if (!theirs.docs.get(theirTombstone)) throw new HttpError(409, "wallet_taken");
      writes.push(deleteWrite(walletPath(fs, holder, address)));
    }
    const wallets = await accountWallets(fs, uid, transaction);
    const plan = planLink(wallets, address, body.receiving === true);
    const existing = wallets.find((wallet) => wallet.address === address);
    writes.push(
      existing
        ? updateWrite(
            walletDoc,
            { address: checksum, receiving: plan.receiving, ...(walletName ? { walletName } : {}) },
            { exists: true },
          )
        : setWrite(walletDoc, {
            address: checksum,
            receiving: plan.receiving,
            linkedAt: SERVER_TIME,
            ...(walletName ? { walletName } : {}),
          }),
    );
    for (const other of plan.clear) writes.push(updateWrite(walletPath(fs, uid, other), { receiving: false }, { exists: true }));
    if (holder !== uid) writes.push(setWrite(indexName, { uid, linkedAt: SERVER_TIME }));
    await fs.commit(writes, transaction);
    return { address: checksum, receiving: plan.receiving };
  } catch (error) {
    await fs.rollback(transaction);
    throw error;
  }
}

/** POST /wallet/unlink `{address}`. Unlinking a wallet that isn't linked changes nothing and succeeds. */
export async function walletUnlink(
  services: WalletServices,
  uid: string,
  body: Record<string, unknown>,
): Promise<{ receiving: Hex | null }> {
  const address = parseAddress(body.address);
  if (!address) throw new HttpError(400, "bad_request");
  const fs = services.firestore;
  const walletDoc = walletPath(fs, uid, address);
  const indexName = fs.path("walletIndex", address);
  const read = await fs.batchGet([walletDoc, indexName], { newTransaction: true });
  const transaction = read.transaction!;
  try {
    const wallets = await accountWallets(fs, uid, transaction);
    const plan = planUnlink(wallets, address);
    const writes: Write[] = [];
    if (read.docs.get(walletDoc)) writes.push(deleteWrite(walletDoc));
    if (read.docs.get(indexName)?.data.uid === uid) writes.push(deleteWrite(indexName));
    if (!writes.length) {
      await fs.rollback(transaction);
      const receiving = wallets.find((wallet) => wallet.receiving)?.address;
      return { receiving: receiving ? toChecksumAddress(receiving) : null };
    }
    for (const other of plan.set) writes.push(updateWrite(walletPath(fs, uid, other), { receiving: true }, { exists: true }));
    for (const other of plan.clear) writes.push(updateWrite(walletPath(fs, uid, other), { receiving: false }, { exists: true }));
    // Seals asked for to this wallet that haven't started go to the receiving wallet instead, or wait
    // in the chest again if there's none. One already minting finishes where it was going.
    const cooling = await fs.runQuery(
      fs.root,
      {
        from: [{ collectionId: "claims" }],
        where: and(where("keeperUid", "EQUAL", uid), where("status", "EQUAL", "cooling"), where("to", "EQUAL", address)),
        limit: MAX_CLAIMS_PER_UNLINK,
      },
      { transaction },
    );
    for (const claim of cooling.docs) {
      writes.push(
        plan.receiving
          ? updateWrite(claim.name, { to: plan.receiving }, { exists: true })
          : updateWrite(
              claim.name,
              { status: "pending_wallet", to: DELETE_FIELD, sealAfter: DELETE_FIELD, delayedSince: DELETE_FIELD },
              { exists: true },
            ),
      );
    }
    await fs.commit(writes, transaction);
    return { receiving: plan.receiving ? toChecksumAddress(plan.receiving) : null };
  } catch (error) {
    await fs.rollback(transaction);
    throw error;
  }
}

/**
 * Checks "Prove it's yours" and returns the wallet's lowercase address. The message must be one this
 * Worker issued to `uid` in the last 10 minutes, byte for byte, and the signature the wallet's.
 */
export async function verifyWalletProof(
  services: WalletServices,
  uid: string,
  message: unknown,
  signature: unknown,
  now: number,
): Promise<Hex> {
  const { config } = services;
  const fields = parseSiweMessage(message);
  if (!fields || buildSiweMessage(fields) !== message) throw new HttpError(400, "bad_message");
  if (
    fields.domain !== config.siweDomain ||
    fields.uri !== config.siweUri ||
    fields.chainId !== config.chainId ||
    fields.statement !== SIWE_STATEMENT
  ) {
    throw new HttpError(400, "bad_message");
  }
  const issued = parseIsoTime(fields.issuedAt);
  const expires = parseIsoTime(fields.expirationTime);
  if (!(expires - issued === SIWE_LIFETIME_MS) || issued > now + SKEW_MS) throw new HttpError(400, "bad_message");
  const address = fields.address.toLowerCase() as Hex;
  const expected = await siweNonce(await services.nonceKey, uid, address, fields.issuedAt);
  if (!timingSafeEqual(utf8.encode(expected), utf8.encode(fields.nonce))) throw new HttpError(400, "bad_message");
  if (now >= expires) throw new HttpError(400, "nonce_expired");
  const signatureBytes = parseSignature(signature);
  const valid = await signatureIsValid(config, services.secp, address, personalMessageHash(message as string), signatureBytes);
  if (!valid) throw new HttpError(400, "bad_signature");
  return address;
}

/**
 * Whether `signature` is `address`'s over `hash`. An ordinary wallet's 65 bytes are recovered here.
 * Anything else takes one batched request: the address's code, and ERC-6492's validator, which
 * checks EIP-1271 (deploying a counterfactual wallet inside the call first). Its answer only counts
 * for a wallet with code or a 6492 signature, since it falls back to ecrecover, and a forged
 * signature can recover the zero address.
 */
export async function signatureIsValid(
  config: Config,
  secp: Secp256k1Wasm,
  address: Hex,
  hash: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  const counterfactual = isErc6492(signature);
  if (signature.length === 65 && !counterfactual && recoverSigner(secp, hash, signature) === address) return true;
  const [code, verdict] = await rpcBatch(config.rpcUrl, [
    { method: "eth_getCode", params: [address, "latest"] },
    { method: "eth_call", params: [{ data: erc6492ValidatorCall(address, hash, signature) }, "latest"] },
  ]);
  if (code.error) throw new RpcUnavailable(`eth_getCode failed: ${code.error.message.slice(0, 120)}`);
  const hasCode = typeof code.result === "string" && !/^0x0*$/.test(code.result);
  return (counterfactual || hasCode) && !verdict.error && isValidatorYes(verdict.result);
}

export interface WalletSummary {
  address: Hex;
  receiving: boolean;
  linkedAt: number;
}

/**
 * Who receives after linking `address`: it does if asked, if it's the only wallet, if it already did,
 * or if no other wallet does. Any other wallet still marked receiving is cleared, except, when this
 * one doesn't receive, the most recently linked of them, so exactly one ends up receiving.
 */
export function planLink(wallets: WalletSummary[], address: Hex, ask: boolean): { receiving: boolean; clear: Hex[] } {
  const others = wallets.filter((wallet) => wallet.address !== address);
  const self = wallets.find((wallet) => wallet.address === address);
  const receivingOthers = others.filter((wallet) => wallet.receiving).sort(newestFirst);
  const receiving = ask || others.length === 0 || (self?.receiving ?? false) || receivingOthers.length === 0;
  return { receiving, clear: (receiving ? receivingOthers : receivingOthers.slice(1)).map((wallet) => wallet.address) };
}

/**
 * Who receives after unlinking `address`: a wallet that already does, or else the most recently
 * linked one left, or nobody when none is left.
 */
export function planUnlink(wallets: WalletSummary[], address: Hex): { receiving: Hex | null; set: Hex[]; clear: Hex[] } {
  const rest = wallets.filter((wallet) => wallet.address !== address).sort(newestFirst);
  if (!rest.length) return { receiving: null, set: [], clear: [] };
  const receiving = rest.filter((wallet) => wallet.receiving);
  const keep = receiving[0] ?? rest[0];
  return {
    receiving: keep.address,
    set: keep.receiving ? [] : [keep.address],
    clear: receiving.slice(1).map((wallet) => wallet.address),
  };
}

function newestFirst(a: WalletSummary, b: WalletSummary): number {
  return b.linkedAt - a.linkedAt;
}

async function accountWallets(fs: Firestore, uid: string, transaction: string): Promise<WalletSummary[]> {
  const { docs } = await fs.runQuery(fs.path("users", uid), { from: [{ collectionId: "wallets" }] }, { transaction });
  return docs.flatMap(toWalletSummary);
}

function toWalletSummary(doc: Doc): WalletSummary[] {
  const address = parseAddress(doc.id);
  if (!address) return [];
  const linkedAt = doc.data.linkedAt instanceof Date ? doc.data.linkedAt.getTime() : 0;
  return [{ address, receiving: doc.data.receiving === true, linkedAt }];
}

function walletPath(fs: Firestore, uid: string, address: Hex): string {
  return fs.path("users", uid, "wallets", address);
}

function parseSignature(signature: unknown): Uint8Array<ArrayBuffer> {
  if (typeof signature !== "string" || signature.length > 2 + MAX_SIGNATURE_BYTES * 2) throw new HttpError(400, "bad_request");
  try {
    const bytes = hexToBytes(signature);
    if (bytes.length < 65) throw new HttpError(400, "bad_signature");
    return bytes;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "bad_request");
  }
}

/** The wallet app's name, as AppKit gives it ("Rainbow"), for the Wallets screen; null if not sent. */
function parseWalletName(name: unknown): string | null {
  if (name === undefined || name === null) return null;
  if (typeof name !== "string") throw new HttpError(400, "bad_request");
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_WALLET_NAME || /[\p{Cc}\p{Cf}]/u.test(trimmed)) throw new HttpError(400, "bad_request");
  return trimmed;
}
