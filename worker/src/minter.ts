// The cron (decisions.md, 2026-10-18): every minute, one claim moves on, so there's one minter and its
// nonce never races. An idle run is one query. With work, every Firestore step is a read-write
// transaction, and `minter/state` holds the lease, the mint under way and the next nonce. The
// decisions are in src/minter-decide.ts; this file reads, writes, signs and sends.
import { bytesToHex, hexToBigInt, hexToBytes, utf8, type Hex } from "./bytes.ts";
import type { Config } from "./config.ts";
import {
  decodeAddress,
  decodeUint,
  encodeL1FeeUpperBound,
  encodeOwnerOf,
  encodeTokenOfMessage,
  GAS_PRICE_ORACLE,
  mintedTransfer,
  parseAddress,
  parseReceipt,
  refusalOf,
  type Receipt,
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
  type FieldValue,
  type Firestore,
  type StructuredQuery,
  type Write,
  type WriteValue,
} from "./firestore.ts";
import {
  classifySend,
  DEFER_MS,
  LEASE_MS,
  planFinish,
  planMint,
  recheck,
  type Bottle,
  type ChainView,
  type Claim,
  type ClaimError,
  type FinishView,
  type InFlight,
} from "./minter-decide.ts";
import { encodeMintCall, signEip1559, type Eip1559Transaction } from "./mint-tx.ts";
import { resultOf, rpcBatch, rpcCall, RpcUnavailable, type RpcAnswer } from "./rpc.ts";
import type { Secp256k1Wasm } from "./secp256k1-wasm.ts";

export interface MinterServices {
  config: Config;
  secp: Secp256k1Wasm;
  /** The minter's address, lowercase. */
  minter: Hex;
  firestore: Firestore;
  markKey: Promise<CryptoKey>;
  now(): number;
  sleep(ms: number): Promise<void>;
}

/**
 * The writer's uid stands in as this once they've deleted their account (decisions.md, 2026-10-18).
 * No Firebase uid can equal it, so the mark still links nothing.
 */
export const DELETED_WRITER = "(deleted)";
/** Every bottle is sea glass for now (`BottleLook.kt`: the choice comes later). */
const SEA_GLASS = 0;
const RECEIPT_POLL_MS = 1_500;

/** What a run did, for the log. */
export type Outcome = string;

export async function runMinter(services: MinterServices): Promise<Outcome> {
  const contract = services.config.contract;
  if (!contract) return "no_contract";
  const fs = services.firestore;
  const due = (await fs.runQuery(fs.root, dueQuery(new Date(services.now())))).docs[0];
  if (!due) return "idle";
  return new Run(services, contract, due).go();
}

/** The oldest claim that's due: cooling past its safety check, or minting (always past it). */
export function dueQuery(now: Date): StructuredQuery {
  return {
    from: [{ collectionId: "claims" }],
    where: and(where("status", "IN", ["cooling", "minting"]), where("sealAfter", "LESS_THAN_OR_EQUAL", now)),
    orderBy: [{ field: { fieldPath: "sealAfter" }, direction: "ASCENDING" }],
    limit: 1,
  };
}

/** The verified mark (spec §1.7): HMAC-SHA256 over the writer's uid and the messageId. */
export async function writerMark(key: CryptoKey, writerUid: string | null, messageId: string): Promise<Uint8Array<ArrayBuffer>> {
  const mac = await crypto.subtle.sign("HMAC", key, utf8.encode(`${writerUid ?? DELETED_WRITER}:${messageId}`));
  return new Uint8Array(mac);
}

interface MinterState {
  leaseUntil: number;
  inFlight: InFlight | null;
  nextNonce: number;
}

/** What one transaction read about a claim. */
interface Seen {
  stateDoc: Doc | null;
  state: MinterState;
  claimDoc: Doc | null;
  bottleDoc: Doc | null;
  keeperGone: boolean;
}

type Settlement =
  | { kind: "minted"; tokenId: bigint; to: Hex; txHash: Hex | null }
  | { kind: "failed"; error: ClaimError }
  | { kind: "requeue"; nextNonce?: number };

class Run {
  private readonly s: MinterServices;
  private readonly contract: Hex;
  private readonly due: Doc;
  private readonly fs: Firestore;
  /** The lease counts from the run's start, so it ends before the next minute's run, however slow this one was. */
  private readonly leaseUntil: Date;
  private transaction: string | undefined;

  constructor(services: MinterServices, contract: Hex, due: Doc) {
    this.s = services;
    this.contract = contract;
    this.due = due;
    this.fs = services.firestore;
    this.leaseUntil = new Date(services.now() + LEASE_MS);
  }

  async go(): Promise<Outcome> {
    const keeper = String(this.due.data.keeperUid ?? "");
    const to = parseAddress(this.due.data.to);
    const names = this.names(this.due.id, keeper);
    const walletName = to ? this.fs.path("users", keeper, "wallets", to) : null;
    const read = await this.fs.batchGet(
      [names.state, names.claim, names.bottle, names.tombstone, ...(walletName ? [walletName] : [])],
      { newTransaction: true },
    );
    this.transaction = read.transaction;
    try {
      const stateDoc = read.docs.get(names.state) ?? null;
      const state = decodeState(stateDoc);
      if (state.leaseUntil > this.s.now()) return await this.end("leased");
      if (state.inFlight) return await this.finish(state.inFlight, stateDoc, state, read.docs);
      const seen: Seen = {
        stateDoc,
        state,
        claimDoc: read.docs.get(names.claim) ?? null,
        bottleDoc: read.docs.get(names.bottle) ?? null,
        keeperGone: Boolean(read.docs.get(names.tombstone)),
      };
      const claim = seen.claimDoc ? decodeClaim(seen.claimDoc) : null;
      if (claim?.status === "minting") return await this.orphan(claim, seen);
      // Moved on, or re-pointed to another wallet since the query: the next run sees it as it is.
      if (claim?.status !== "cooling" || claim.to !== to) return await this.end("moved");
      const bottle = decodeBottle(seen.bottleDoc);
      const check = recheck(claim, bottle, Boolean(walletName && read.docs.get(walletName)), seen.keeperGone);
      switch (check.kind) {
        case "defer":
          await this.commit([updateWrite(seen.claimDoc!.name, { sealAfter: new Date(this.s.now() + DEFER_MS) }, { exists: true })]);
          return `deferred ${claim.id}`;
        case "fail":
          return await this.settle(seen, null, { kind: "failed", error: check.error });
        case "unlinked":
          await this.commit([
            updateWrite(
              seen.claimDoc!.name,
              { status: "pending_wallet", to: DELETE_FIELD, sealAfter: DELETE_FIELD, delayedSince: DELETE_FIELD },
              { exists: true },
            ),
          ]);
          return `unlinked ${claim.id}`;
        case "seal":
          return await this.mint(claim, bottle!, check.to, seen);
      }
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }

  // ---------- Step 5 and 6: a new mint ----------

  private async mint(claim: Claim, bottle: Bottle, to: Hex, seen: Seen): Promise<Outcome> {
    const calldata = encodeMintCall({
      to: hexToBytes(to),
      messageId: claim.id,
      text: bottle.text,
      castAt: BigInt(Math.floor(bottle.createdAt.getTime() / 1000)),
      penName: bottle.penName ?? "",
      writerMark: await writerMark(await this.s.markKey, bottle.userId, claim.id),
      glass: SEA_GLASS,
    });
    const plan = planMint(await this.readChainForMint(claim.id, calldata), seen.state.nextNonce);
    switch (plan.kind) {
      case "already": {
        const owner = await this.ownerOf(plan.tokenId);
        return await this.settle(seen, null, { kind: "minted", tokenId: plan.tokenId, to: owner, txHash: null });
      }
      case "delay":
        if (claim.delayedSince) return await this.end(`delayed ${claim.id}`);
        await this.commit([updateWrite(seen.claimDoc!.name, { delayedSince: SERVER_TIME }, { exists: true })]);
        return `delayed ${claim.id}`;
      case "fail":
        return await this.settle(seen, null, { kind: "failed", error: plan.error });
      case "send":
        break;
    }
    const tx: Eip1559Transaction = {
      chainId: this.s.config.chainId,
      nonce: plan.nonce,
      maxPriorityFeePerGas: plan.maxPriorityFeePerGas,
      maxFeePerGas: plan.maxFeePerGas,
      gas: plan.gas,
      to: hexToBytes(this.contract),
      value: 0n,
      data: calldata,
    };
    const signed = signEip1559(this.s.secp, this.s.config.minterKey, tx);
    const flight: InFlight = {
      messageId: claim.id,
      keeperUid: claim.keeperUid,
      to,
      nonce: plan.nonce,
      txHashes: [bytesToHex(signed.hash)],
      raw: bytesToHex(signed.raw),
      maxFeePerGas: plan.maxFeePerGas,
      maxPriorityFeePerGas: plan.maxPriorityFeePerGas,
      gas: plan.gas,
      sentAt: this.s.now(),
      consumedSince: null,
      cancelled: false,
    };
    // Recorded before it's sent, so a run that dies here leaves something to finish.
    await this.commit([
      updateWrite(
        seen.claimDoc!.name,
        { status: "minting", txHash: flight.txHashes[0], nonce: flight.nonce, delayedSince: DELETE_FIELD },
        { exists: true },
      ),
      this.stateWrite(seen.stateDoc, {
        inFlight: encodeFlight(flight),
        leaseUntil: this.leaseUntil,
        nextNonce: seen.state.nextNonce,
      }),
    ]);
    const sent = classifySend((await rpcCall(this.s.config.rpcUrl, { method: "eth_sendRawTransaction", params: [flight.raw] })).error);
    if (sent === "no_funds" || sent === "fees" || sent === "nonce_used") {
      return await this.afterRefusal(flight, sent !== "nonce_used");
    }
    return await this.afterSend(flight);
  }

  /** A first send the node definitely refused: the claim goes back to cooling, delayed unless only the nonce was stale. */
  private async afterRefusal(flight: InFlight, delayed: boolean): Promise<Outcome> {
    const seen = await this.readFor(flight);
    if (!sameFlight(seen.state.inFlight, flight)) return await this.end("moved");
    const writes: Write[] = [this.stateWrite(seen.stateDoc, { inFlight: DELETE_FIELD, leaseUntil: SERVER_TIME })];
    if (seen.claimDoc) {
      writes.push(
        updateWrite(
          seen.claimDoc.name,
          { status: "cooling", txHash: DELETE_FIELD, nonce: DELETE_FIELD, ...(delayed ? { delayedSince: SERVER_TIME } : {}) },
          { exists: true },
        ),
      );
    }
    await this.commit(writes);
    return `${delayed ? "delayed" : "requeued"} ${flight.messageId}`;
  }

  /** Waits a little for the newest transaction's receipt, and records it if it comes. */
  private async afterSend(flight: InFlight): Promise<Outcome> {
    const receipt = await this.awaitReceipt(flight.txHashes[flight.txHashes.length - 1]);
    if (!receipt) return `minting ${flight.messageId}`;
    const seen = await this.readFor(flight);
    if (!sameFlight(seen.state.inFlight, flight)) return await this.end("moved");
    return await this.settleReceipt(seen, flight, receipt);
  }

  // ---------- Step 3: a mint under way ----------

  private async finish(flight: InFlight, stateDoc: Doc | null, state: MinterState, docs: Map<string, Doc | null>): Promise<Outcome> {
    const names = this.names(flight.messageId, flight.keeperUid);
    let claimDoc = docs.get(names.claim);
    let bottleDoc = docs.get(names.bottle);
    let tombstone = docs.get(names.tombstone);
    if (claimDoc === undefined || bottleDoc === undefined || tombstone === undefined) {
      const more = await this.fs.batchGet([names.claim, names.bottle, names.tombstone], { transaction: this.transaction! });
      [claimDoc, bottleDoc, tombstone] = [more.docs.get(names.claim), more.docs.get(names.bottle), more.docs.get(names.tombstone)];
    }
    const seen: Seen = { stateDoc, state, claimDoc: claimDoc ?? null, bottleDoc: bottleDoc ?? null, keeperGone: Boolean(tombstone) };
    const bottle = decodeBottle(seen.bottleDoc);
    const view = await this.readChainForFinish(flight);
    const now = this.s.now();
    const plan = planFinish(flight, view, !bottle || bottle.status === "removed", now);
    switch (plan.kind) {
      case "minted":
        return await this.settleReceipt(seen, flight, plan.receipt);
      case "sealed": {
        const owner = await this.ownerOf(plan.tokenId);
        return await this.settle(seen, flight, { kind: "minted", tokenId: plan.tokenId, to: owner, txHash: null });
      }
      case "reverted":
        return await this.settle(seen, flight, { kind: "failed", error: "reverted" });
      case "cancelled":
        return await this.settle(seen, flight, { kind: "failed", error: "removed" });
      case "requeue":
        return await this.settle(seen, flight, {
          kind: "requeue",
          nextNonce: plan.resetNonce ? Number(view.minedNonce) : undefined,
        });
      case "consumed":
        await this.commit([this.stateWrite(stateDoc, { inFlight: encodeFlight({ ...flight, consumedSince: now }) })]);
        return `waiting ${flight.messageId}`;
      case "wait":
        await this.rollback();
        // The nonce is used: the receipt we're waiting for is the node's to catch up on, so the next run looks.
        if (view.minedNonce > BigInt(flight.nonce)) return `waiting ${flight.messageId}`;
        // Harmless if the node already has it; it may have dropped it.
        await rpcCall(this.s.config.rpcUrl, { method: "eth_sendRawTransaction", params: [flight.raw] }).catch(() => undefined);
        return await this.afterSend(flight);
      case "replace": {
        const replacement = await this.replacement(flight, plan, bottle);
        await this.commit([
          ...(seen.claimDoc && !plan.cancel
            ? [updateWrite(seen.claimDoc.name, { txHash: replacement.txHashes[replacement.txHashes.length - 1] }, { exists: true })]
            : []),
          this.stateWrite(stateDoc, { inFlight: encodeFlight(replacement), leaseUntil: this.leaseUntil }),
        ]);
        await rpcCall(this.s.config.rpcUrl, { method: "eth_sendRawTransaction", params: [replacement.raw] }).catch(() => undefined);
        return await this.afterSend(replacement);
      }
    }
  }

  /** The same nonce, signed again with higher fees: the mint, or a 0-value send to cancel it. */
  private async replacement(
    flight: InFlight,
    plan: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; cancel: boolean },
    bottle: Bottle | null,
  ): Promise<InFlight> {
    let to = hexToBytes(this.contract);
    let data: Uint8Array = new Uint8Array();
    let gas = 21_000n;
    if (!plan.cancel && bottle) {
      data = encodeMintCall({
        to: hexToBytes(flight.to),
        messageId: flight.messageId,
        text: bottle.text,
        castAt: BigInt(Math.floor(bottle.createdAt.getTime() / 1000)),
        penName: bottle.penName ?? "",
        writerMark: await writerMark(await this.s.markKey, bottle.userId, flight.messageId),
        glass: SEA_GLASS,
      });
      gas = flight.gas;
    } else {
      to = hexToBytes(this.s.minter);
    }
    const signed = signEip1559(this.s.secp, this.s.config.minterKey, {
      chainId: this.s.config.chainId,
      nonce: flight.nonce,
      maxPriorityFeePerGas: plan.maxPriorityFeePerGas,
      maxFeePerGas: plan.maxFeePerGas,
      gas,
      to,
      value: 0n,
      data,
    });
    return {
      ...flight,
      txHashes: [...flight.txHashes, bytesToHex(signed.hash)],
      raw: bytesToHex(signed.raw),
      maxFeePerGas: plan.maxFeePerGas,
      maxPriorityFeePerGas: plan.maxPriorityFeePerGas,
      gas,
      sentAt: this.s.now(),
      cancelled: plan.cancel || !bottle,
    };
  }

  /** A claim left minting with nothing in flight: sealed already, or back to cooling. */
  private async orphan(claim: Claim, seen: Seen): Promise<Outcome> {
    const answer = await rpcCall(this.s.config.rpcUrl, {
      method: "eth_call",
      params: [{ to: this.contract, data: encodeTokenOfMessage(claim.id) }, "latest"],
    });
    const tokenId = decodeUint(resultOf(answer, "tokenOfMessage"));
    if (tokenId > 0n) {
      return await this.settle(seen, null, { kind: "minted", tokenId, to: await this.ownerOf(tokenId), txHash: null });
    }
    return await this.settle(seen, null, { kind: "requeue" });
  }

  // ---------- Step 7: recording ----------

  private async settleReceipt(seen: Seen, flight: InFlight, receipt: Receipt): Promise<Outcome> {
    if (receipt.status !== 1) return await this.settle(seen, flight, { kind: "failed", error: "reverted" });
    const transfer = mintedTransfer(receipt, this.contract);
    if (transfer) {
      return await this.settle(seen, flight, { kind: "minted", ...transfer, txHash: receipt.transactionHash });
    }
    // It ran but minted nothing: a cancellation, or a mint of a bottle an older transaction had sealed.
    const answer = await rpcCall(this.s.config.rpcUrl, {
      method: "eth_call",
      params: [{ to: this.contract, data: encodeTokenOfMessage(flight.messageId) }, "latest"],
    });
    const tokenId = decodeUint(resultOf(answer, "tokenOfMessage"));
    if (tokenId === 0n) return await this.settle(seen, flight, { kind: "failed", error: flight.cancelled ? "removed" : "reverted" });
    return await this.settle(seen, flight, { kind: "minted", tokenId, to: await this.ownerOf(tokenId), txHash: null });
  }

  /**
   * Ends a claim's mint, or the attempt at one, in one commit: the claim, the bottle's sealedAt, and the
   * minter's state. A keeper who deleted their account has the claim deleted rather than finished, so
   * nothing keeps tying the old account to a wallet.
   */
  private async settle(seen: Seen, flight: InFlight | null, result: Settlement): Promise<Outcome> {
    const writes: Write[] = [];
    const claimName = seen.claimDoc?.name;
    const id = flight?.messageId ?? seen.claimDoc?.id ?? "?";
    if (claimName) {
      if (result.kind === "requeue") {
        writes.push(updateWrite(claimName, { status: "cooling", txHash: DELETE_FIELD, nonce: DELETE_FIELD }, { exists: true }));
      } else if (seen.keeperGone) {
        writes.push(deleteWrite(claimName));
      } else if (result.kind === "minted") {
        writes.push(
          updateWrite(
            claimName,
            {
              status: "minted",
              tokenId: result.tokenId,
              to: result.to,
              txHash: result.txHash ?? DELETE_FIELD,
              mintedAt: SERVER_TIME,
              delayedSince: DELETE_FIELD,
            },
            { exists: true },
          ),
        );
      } else {
        writes.push(
          updateWrite(
            claimName,
            { status: "failed", error: result.error, txHash: DELETE_FIELD, nonce: DELETE_FIELD, delayedSince: DELETE_FIELD },
            { exists: true },
          ),
        );
      }
    }
    if (result.kind === "minted" && seen.bottleDoc) {
      // Only if it's still there: a REST update would otherwise create it.
      writes.push(updateWrite(seen.bottleDoc.name, { sealedAt: SERVER_TIME }, { exists: true }));
    }
    if (flight) {
      const used = result.kind === "requeue" ? seen.state.nextNonce : Math.max(seen.state.nextNonce, flight.nonce + 1);
      writes.push(
        this.stateWrite(seen.stateDoc, {
          inFlight: DELETE_FIELD,
          leaseUntil: SERVER_TIME,
          nextNonce: result.kind === "requeue" && result.nextNonce !== undefined ? result.nextNonce : used,
        }),
      );
    }
    await this.commit(writes);
    switch (result.kind) {
      case "minted":
        return `minted ${id} #${result.tokenId}`;
      case "failed":
        return `failed ${id} ${result.error}`;
      case "requeue":
        return `requeued ${id}`;
    }
  }

  // ---------- Reads ----------

  private names(messageId: string, keeperUid: string) {
    return {
      state: this.fs.path("minter", "state"),
      claim: this.fs.path("claims", messageId),
      bottle: this.fs.path("messages", messageId),
      tombstone: this.fs.path("deletions", keeperUid || "-"),
    };
  }

  /** A fresh transaction's view of a mint's claim, bottle, keeper and the minter's state. */
  private async readFor(flight: InFlight): Promise<Seen> {
    const names = this.names(flight.messageId, flight.keeperUid);
    const read = await this.fs.batchGet([names.state, names.claim, names.bottle, names.tombstone], { newTransaction: true });
    this.transaction = read.transaction;
    const stateDoc = read.docs.get(names.state) ?? null;
    return {
      stateDoc,
      state: decodeState(stateDoc),
      claimDoc: read.docs.get(names.claim) ?? null,
      bottleDoc: read.docs.get(names.bottle) ?? null,
      keeperGone: Boolean(read.docs.get(names.tombstone)),
    };
  }

  /** Step 5's batch. A refused batch may go call by call: nothing here needs one node's single view. */
  private async readChainForMint(messageId: string, calldata: Uint8Array): Promise<ChainView> {
    const minter = this.s.minter;
    const [nonce, fees, tip, balance, token, estimate, l1Fee] = await rpcBatch(this.s.config.rpcUrl, [
      { method: "eth_getTransactionCount", params: [minter, "latest"] },
      { method: "eth_feeHistory", params: ["0x1", "latest", []] },
      { method: "eth_maxPriorityFeePerGas", params: [] },
      { method: "eth_getBalance", params: [minter, "latest"] },
      { method: "eth_call", params: [{ to: this.contract, data: encodeTokenOfMessage(messageId) }, "latest"] },
      // No fee fields, so a short balance can't pass for a revert.
      { method: "eth_estimateGas", params: [{ from: minter, to: this.contract, data: bytesToHex(calldata) }] },
      { method: "eth_call", params: [{ to: GAS_PRICE_ORACLE, data: encodeL1FeeUpperBound(calldata.length + 120) }, "latest"] },
    ]);
    return {
      minedNonce: hexToBigInt(resultOf(nonce, "eth_getTransactionCount")),
      nextBaseFee: nextBaseFee(resultOf(fees, "eth_feeHistory")),
      tip: hexToBigInt(resultOf(tip, "eth_maxPriorityFeePerGas")),
      balance: hexToBigInt(resultOf(balance, "eth_getBalance")),
      tokenOfMessage: decodeUint(resultOf(token, "tokenOfMessage")),
      estimate: estimateOf(estimate),
      // A chain without Base's oracle (a local node) has no L1 fee.
      l1Fee: l1Fee.error ? 0n : decodeUint(l1Fee.result),
    };
  }

  /** Step 3's batch, answered by one node at one moment, or not at all. */
  private async readChainForFinish(flight: InFlight): Promise<FinishView> {
    const answers = await rpcBatch(
      this.s.config.rpcUrl,
      [
        ...flight.txHashes.map((hash) => ({ method: "eth_getTransactionReceipt", params: [hash] })),
        { method: "eth_getTransactionCount", params: [this.s.minter, "latest"] },
        { method: "eth_call", params: [{ to: this.contract, data: encodeTokenOfMessage(flight.messageId) }, "latest"] },
        { method: "eth_feeHistory", params: ["0x1", "latest", []] },
        { method: "eth_maxPriorityFeePerGas", params: [] },
      ],
      { together: true },
    );
    const receipts = answers.slice(0, flight.txHashes.length).map((answer) => parseReceipt(resultOf(answer, "eth_getTransactionReceipt")));
    const [nonce, token, fees, tip] = answers.slice(flight.txHashes.length);
    return {
      receipts,
      minedNonce: hexToBigInt(resultOf(nonce, "eth_getTransactionCount")),
      tokenOfMessage: decodeUint(resultOf(token, "tokenOfMessage")),
      nextBaseFee: nextBaseFee(resultOf(fees, "eth_feeHistory")),
      tip: hexToBigInt(resultOf(tip, "eth_maxPriorityFeePerGas")),
    };
  }

  private async ownerOf(tokenId: bigint): Promise<Hex> {
    const answer = await rpcCall(this.s.config.rpcUrl, {
      method: "eth_call",
      params: [{ to: this.contract, data: encodeOwnerOf(tokenId) }, "latest"],
    });
    return decodeAddress(resultOf(answer, "ownerOf"));
  }

  private async awaitReceipt(hash: Hex): Promise<Receipt | null> {
    const deadline = this.s.now() + this.s.config.receiptWaitMs;
    for (;;) {
      const answer = await rpcCall(this.s.config.rpcUrl, { method: "eth_getTransactionReceipt", params: [hash] }).catch(
        () => null,
      );
      const receipt = answer && !answer.error ? parseReceipt(answer.result) : null;
      if (receipt) return receipt;
      if (this.s.now() + RECEIPT_POLL_MS > deadline) return null;
      await this.s.sleep(RECEIPT_POLL_MS);
    }
  }

  // ---------- Writes ----------

  /** minter/state, created by the first run that needs it. */
  private stateWrite(stateDoc: Doc | null, fields: Record<string, WriteValue>): Write {
    if (stateDoc) return updateWrite(stateDoc.name, fields, { exists: true });
    const created: Record<string, FieldValue | typeof SERVER_TIME> = { nextNonce: 0 };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== DELETE_FIELD) created[key] = value as FieldValue | typeof SERVER_TIME;
    }
    return setWrite(this.fs.path("minter", "state"), created, { exists: false });
  }

  private async commit(writes: Write[]): Promise<void> {
    const transaction = this.transaction;
    this.transaction = undefined;
    await this.fs.commit(writes, transaction);
  }

  private async rollback(): Promise<void> {
    const transaction = this.transaction;
    this.transaction = undefined;
    await this.fs.rollback(transaction);
  }

  private async end(outcome: Outcome): Promise<Outcome> {
    await this.rollback();
    return outcome;
  }
}

// ---------- Decoding ----------

function decodeState(doc: Doc | null): MinterState {
  const data = doc?.data ?? {};
  return {
    leaseUntil: data.leaseUntil instanceof Date ? data.leaseUntil.getTime() : 0,
    inFlight: decodeFlight(data.inFlight),
    nextNonce: typeof data.nextNonce === "number" ? data.nextNonce : 0,
  };
}

function decodeClaim(doc: Doc): Claim {
  const data = doc.data;
  return {
    id: doc.id,
    keeperUid: String(data.keeperUid ?? ""),
    status: String(data.status ?? ""),
    to: parseAddress(data.to),
    delayedSince: data.delayedSince instanceof Date ? data.delayedSince : null,
  };
}

function decodeBottle(doc: Doc | null): Bottle | null {
  if (!doc) return null;
  const data = doc.data;
  return {
    status: String(data.status ?? ""),
    keptAt: data.keptAt instanceof Date ? data.keptAt : null,
    sealable: data.sealable === true,
    userId: typeof data.userId === "string" && data.userId ? data.userId : null,
    text: typeof data.messageContent === "string" ? data.messageContent : "",
    penName: typeof data.penName === "string" && data.penName ? data.penName : null,
    createdAt: data.createdAt instanceof Date ? data.createdAt : new Date(0),
  };
}

/** Fees and gas are stored as decimal strings, so no number ever rounds them. */
export function encodeFlight(flight: InFlight): Record<string, FieldValue> {
  return {
    messageId: flight.messageId,
    keeperUid: flight.keeperUid,
    to: flight.to,
    nonce: flight.nonce,
    txHashes: flight.txHashes,
    raw: flight.raw,
    maxFeePerGas: flight.maxFeePerGas.toString(),
    maxPriorityFeePerGas: flight.maxPriorityFeePerGas.toString(),
    gas: flight.gas.toString(),
    sentAt: new Date(flight.sentAt),
    consumedSince: flight.consumedSince === null ? null : new Date(flight.consumedSince),
    cancelled: flight.cancelled,
  };
}

export function decodeFlight(value: FieldValue | undefined): InFlight | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Date || value instanceof Uint8Array) return null;
  const f = value as Record<string, FieldValue>;
  const to = parseAddress(f.to);
  if (typeof f.messageId !== "string" || !to || typeof f.nonce !== "number" || !Array.isArray(f.txHashes) || typeof f.raw !== "string") {
    return null;
  }
  return {
    messageId: f.messageId,
    keeperUid: String(f.keeperUid ?? ""),
    to,
    nonce: f.nonce,
    txHashes: f.txHashes.map((hash) => String(hash) as Hex),
    raw: f.raw as Hex,
    maxFeePerGas: BigInt(String(f.maxFeePerGas ?? "0")),
    maxPriorityFeePerGas: BigInt(String(f.maxPriorityFeePerGas ?? "0")),
    gas: BigInt(String(f.gas ?? "0")),
    sentAt: f.sentAt instanceof Date ? f.sentAt.getTime() : 0,
    consumedSince: f.consumedSince instanceof Date ? f.consumedSince.getTime() : null,
    cancelled: f.cancelled === true,
  };
}

function sameFlight(current: InFlight | null, flight: InFlight): boolean {
  return current?.messageId === flight.messageId && current.raw === flight.raw;
}

/** `eth_feeHistory`'s last base fee: the next block's. */
function nextBaseFee(history: unknown): bigint {
  const fees = (history as { baseFeePerGas?: unknown } | null)?.baseFeePerGas;
  if (!Array.isArray(fees) || fees.length === 0) throw new RpcUnavailable("eth_feeHistory answered without base fees");
  return hexToBigInt(fees[fees.length - 1]);
}

/**
 * The gas estimate, or the contract's refusal. Only an execution revert is a refusal: any other error
 * (a rate limit, say) must not fail a claim, so it throws and the next run tries again.
 */
function estimateOf(answer: RpcAnswer): ChainView["estimate"] {
  if (!answer.error) return { gas: hexToBigInt(answer.result) };
  if (answer.error.code === 3 || /revert/i.test(answer.error.message)) return { refusal: refusalOf(answer.error) };
  throw new RpcUnavailable(`eth_estimateGas failed: ${answer.error.message.slice(0, 160)}`);
}
