// The cron's decisions, as pure functions over what a run read: the claim, its bottle, the wallet,
// the keeper's tombstone, the minter's state and the chain. src/minter.ts does the reading and the
// writing; test/minter-decide.test.ts walks every branch.
import { utf8, type Hex } from "./bytes.ts";
import type { MintRefusal, Receipt } from "./eth.ts";

/**
 * How long a run's lease lasts, from its first commit. A run takes well under this, and it ends before
 * the next minute's run starts, so a run that died can't block the one after it.
 */
export const LEASE_MS = 45_000;
/** A bottle under review is checked again after this, so it doesn't hold up the queue. */
export const DEFER_MS = 60 * 60 * 1000;
/** A transaction pending this long, with the network's fees past it, is replaced at the same nonce. */
export const STUCK_MS = 5 * 60 * 1000;
/** A nonce used by a transaction with no receipt of ours waits this long for the receipt. */
export const CONSUMED_WAIT_MS = 2 * 60 * 1000;
/** A transaction whose nonce stays above the mined one this long is behind a gap: start over. */
export const GAP_MS = 10 * 60 * 1000;

/** The contract's limits (BottleCastKeepsakes.sol), checked first so a claim fails with a reason. */
const MAX_TEXT_BYTES = 280;
const MAX_PEN_NAME_UNITS = 20;

/** A claim's `error` once it's `failed`. */
export type ClaimError = "reverted" | "removed" | "gone" | "not_kept" | "not_sealable" | "too_long" | "bad_recipient";

export interface Claim {
  id: string;
  keeperUid: string;
  status: string;
  to: Hex | null;
  delayedSince: Date | null;
}

export interface Bottle {
  status: string;
  keptAt: Date | null;
  sealable: boolean;
  /** Null once the writer has deleted their account. */
  userId: string | null;
  text: string;
  penName: string | null;
  createdAt: Date;
}

export type Recheck =
  | { kind: "seal"; to: Hex }
  | { kind: "defer" }
  | { kind: "fail"; error: ClaimError }
  /** The wallet was unlinked: back to the chest. */
  | { kind: "unlinked" };

/** Step 4: whether a due `cooling` claim may seal now. */
export function recheck(claim: Claim, bottle: Bottle | null, walletLinked: boolean, keeperGone: boolean): Recheck {
  if (!bottle) return { kind: "fail", error: "gone" };
  if (bottle.status === "under_review") return { kind: "defer" };
  if (bottle.status === "removed") return { kind: "fail", error: "removed" };
  if (bottle.status !== "kept" || !bottle.keptAt) return { kind: "fail", error: "not_kept" };
  if (!bottle.sealable) return { kind: "fail", error: "not_sealable" };
  if (utf8.encode(bottle.text).length > MAX_TEXT_BYTES || (bottle.penName ?? "").length > MAX_PEN_NAME_UNITS) {
    return { kind: "fail", error: "too_long" };
  }
  // A keeper who deleted their account still gets the seal they asked for, to the wallet they named.
  if (!claim.to || (!walletLinked && !keeperGone)) return { kind: "unlinked" };
  return { kind: "seal", to: claim.to };
}

export interface ChainView {
  /** The minter's mined transaction count: the next nonce the chain will accept. */
  minedNonce: bigint;
  nextBaseFee: bigint;
  tip: bigint;
  balance: bigint;
  tokenOfMessage: bigint;
  estimate: { gas: bigint } | { refusal: MintRefusal };
  /** Base's L1 data fee bound; 0 on a chain without one. */
  l1Fee: bigint;
}

export type MintPlan =
  | { kind: "already"; tokenId: bigint }
  /** The minter can't pay, or lost its role: the whole queue waits. */
  | { kind: "delay" }
  | { kind: "fail"; error: ClaimError }
  | { kind: "send"; nonce: number; gas: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };

/**
 * Step 5: what to do once the chain's been read. The nonce is the higher of the mined count and the
 * one after the last mint this Worker recorded, so a lagging node behind the public endpoint can't
 * hand out a nonce that's already used.
 */
export function planMint(chain: ChainView, nextNonce: number): MintPlan {
  if (chain.tokenOfMessage > 0n) return { kind: "already", tokenId: chain.tokenOfMessage };
  if ("refusal" in chain.estimate) {
    return chain.estimate.refusal === "no_minter_role" ? { kind: "delay" } : { kind: "fail", error: chain.estimate.refusal };
  }
  const gas = (chain.estimate.gas * 12n) / 10n;
  const maxPriorityFeePerGas = chain.tip > 0n ? chain.tip : 1n;
  const maxFeePerGas = 2n * chain.nextBaseFee + maxPriorityFeePerGas;
  if (chain.balance < gas * maxFeePerGas + chain.l1Fee) return { kind: "delay" };
  const nonce = chain.minedNonce > BigInt(nextNonce) ? Number(chain.minedNonce) : nextNonce;
  return { kind: "send", nonce, gas, maxFeePerGas, maxPriorityFeePerGas };
}

/** A mint under way, kept in minter/state until it's recorded. */
export interface InFlight {
  messageId: string;
  keeperUid: string;
  to: Hex;
  nonce: number;
  /** Every transaction sent for this nonce, newest last: a replacement doesn't stop an older one landing. */
  txHashes: Hex[];
  /** The newest one, signed, for rebroadcasting. */
  raw: Hex;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gas: bigint;
  /** When the newest one was signed. */
  sentAt: number;
  /** When the nonce was first seen used with no receipt of ours. */
  consumedSince: number | null;
  /** The newest one is a 0-value send to the minter, cancelling a mint whose bottle was removed. */
  cancelled: boolean;
}

export interface FinishView {
  /** Receipts for `txHashes`, in order, null where there's none yet. */
  receipts: (Receipt | null)[];
  minedNonce: bigint;
  tokenOfMessage: bigint;
  nextBaseFee: bigint;
  tip: bigint;
}

export type FinishPlan =
  /** A receipt with status 1: record what it minted. */
  | { kind: "minted"; receipt: Receipt }
  /** Sealed, but not through a receipt of ours (an older transaction landed after all). */
  | { kind: "sealed"; tokenId: bigint }
  | { kind: "reverted" }
  /** The cancellation landed: the bottle was removed and never sealed. */
  | { kind: "cancelled" }
  /** Back to cooling, to be signed afresh; `resetNonce` trusts the chain's count over the recorded one. */
  | { kind: "requeue"; resetNonce: boolean }
  /** Note when the nonce was first seen used, then wait for a receipt. */
  | { kind: "consumed" }
  /** Nothing to change: rebroadcast unless the nonce is used, and look for a receipt. */
  | { kind: "wait" }
  | { kind: "replace"; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; cancel: boolean };

/** Step 3: what a run does with a mint already under way. */
export function planFinish(flight: InFlight, view: FinishView, bottleRemoved: boolean, now: number): FinishPlan {
  const receipt = view.receipts.find((r) => r?.status === 1) ?? view.receipts.find((r) => r !== null) ?? null;
  if (receipt) {
    if (receipt.status === 1) {
      return flight.cancelled && view.tokenOfMessage === 0n ? { kind: "cancelled" } : { kind: "minted", receipt };
    }
    return view.tokenOfMessage > 0n ? { kind: "sealed", tokenId: view.tokenOfMessage } : { kind: "reverted" };
  }
  const nonce = BigInt(flight.nonce);
  if (view.minedNonce > nonce) {
    // Another transaction used the nonce, or the node hasn't caught up with our receipt yet.
    if (flight.consumedSince === null) return { kind: "consumed" };
    if (now - flight.consumedSince < CONSUMED_WAIT_MS) return { kind: "wait" };
    return view.tokenOfMessage > 0n ? { kind: "sealed", tokenId: view.tokenOfMessage } : { kind: "requeue", resetNonce: false };
  }
  if (nonce > view.minedNonce && now - flight.sentAt > GAP_MS) return { kind: "requeue", resetNonce: true };
  if (now - flight.sentAt > STUCK_MS) {
    const tip = view.tip > 0n ? view.tip : 1n;
    const needed = 2n * view.nextBaseFee + tip;
    if (needed > flight.maxFeePerGas || (bottleRemoved && !flight.cancelled)) {
      const bump = (fee: bigint) => fee + fee / 8n + 1n;
      const maxPriorityFeePerGas = max(tip, bump(flight.maxPriorityFeePerGas));
      return {
        kind: "replace",
        maxFeePerGas: max(needed, bump(flight.maxFeePerGas), maxPriorityFeePerGas),
        maxPriorityFeePerGas,
        cancel: bottleRemoved || flight.cancelled,
      };
    }
  }
  return { kind: "wait" };
}

/** How a first send of a nonce was answered. Only a definite refusal means it can't land. */
export type SendOutcome = "sent" | "no_funds" | "fees" | "nonce_used" | "maybe";

export function classifySend(error: { message: string } | undefined): SendOutcome {
  if (!error) return "sent";
  const message = error.message.toLowerCase();
  if (/already known|known transaction/.test(message)) return "sent";
  if (/insufficient funds/.test(message)) return "no_funds";
  if (/nonce too low/.test(message)) return "nonce_used";
  // A replacement refused means some transaction already holds the nonce: maybe one of ours.
  if (/replacement/.test(message)) return "maybe";
  if (/fee cap|feecap|base fee|underpriced|intrinsic gas too low|gas too low/.test(message)) return "fees";
  return "maybe";
}

function max(...values: bigint[]): bigint {
  return values.reduce((a, b) => (a > b ? a : b));
}
