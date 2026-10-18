import { describe, expect, it } from "vitest";
import type { Receipt } from "../src/eth.ts";
import {
  classifySend,
  CONSUMED_WAIT_MS,
  GAP_MS,
  planFinish,
  planMint,
  recheck,
  STUCK_MS,
  type Bottle,
  type ChainView,
  type Claim,
  type FinishView,
  type InFlight,
} from "../src/minter-decide.ts";

const TO = "0x9a8f2e4b7c6d5a3f1e0b9c8d7a6f5e4d3c2b1a09";
const claim: Claim = { id: "Vb3kQm9TzR2xLp8sWn4E", keeperUid: "keeper", status: "cooling", to: TO, delayedSince: null };
const bottle: Bottle = {
  status: "kept",
  keptAt: new Date(0),
  sealable: true,
  userId: "writer",
  text: "Leave the porch light on.",
  penName: "Driftwood",
  createdAt: new Date(0),
};

describe("recheck", () => {
  it("seals a kept, sealable bottle to the wallet asked for", () => {
    expect(recheck(claim, bottle, true, false)).toEqual({ kind: "seal", to: TO });
  });

  it("still seals for a keeper who deleted their account, to the wallet they named", () => {
    expect(recheck(claim, bottle, false, true)).toEqual({ kind: "seal", to: TO });
  });

  it("seals for a writer who deleted their account after the ask", () => {
    expect(recheck(claim, { ...bottle, userId: null, penName: null }, true, false)).toEqual({ kind: "seal", to: TO });
  });

  it("waits out a review, and never seals a removed or missing bottle", () => {
    expect(recheck(claim, { ...bottle, status: "under_review" }, true, false)).toEqual({ kind: "defer" });
    expect(recheck(claim, { ...bottle, status: "removed" }, true, false)).toEqual({ kind: "fail", error: "removed" });
    expect(recheck(claim, null, true, false)).toEqual({ kind: "fail", error: "gone" });
  });

  it("fails what the contract would refuse, with a reason", () => {
    expect(recheck(claim, { ...bottle, status: "found" }, true, false)).toEqual({ kind: "fail", error: "not_kept" });
    expect(recheck(claim, { ...bottle, keptAt: null }, true, false)).toEqual({ kind: "fail", error: "not_kept" });
    expect(recheck(claim, { ...bottle, sealable: false }, true, false)).toEqual({ kind: "fail", error: "not_sealable" });
    expect(recheck(claim, { ...bottle, text: "é".repeat(141) }, true, false)).toEqual({ kind: "fail", error: "too_long" });
    expect(recheck(claim, { ...bottle, text: "é".repeat(140) }, true, false).kind).toBe("seal");
    expect(recheck(claim, { ...bottle, penName: "🌊".repeat(11) }, true, false)).toEqual({ kind: "fail", error: "too_long" });
    expect(recheck(claim, { ...bottle, penName: "🌊".repeat(10) }, true, false).kind).toBe("seal");
  });

  it("sends a seal whose wallet was unlinked back to the chest", () => {
    expect(recheck(claim, bottle, false, false)).toEqual({ kind: "unlinked" });
    expect(recheck({ ...claim, to: null }, bottle, false, false)).toEqual({ kind: "unlinked" });
  });
});

describe("planMint", () => {
  const chain: ChainView = {
    minedNonce: 5n,
    nextBaseFee: 1_000_000n,
    tip: 100n,
    balance: 10n ** 18n,
    tokenOfMessage: 0n,
    estimate: { gas: 400_000n },
    l1Fee: 50_000n,
  };

  it("sends at the mined nonce, with room on gas and fees", () => {
    expect(planMint(chain, 0)).toEqual({ kind: "send", nonce: 5, gas: 480_000n, maxFeePerGas: 2_000_100n, maxPriorityFeePerGas: 100n });
  });

  it("never reuses a nonce the last recorded mint used, whatever a lagging node says", () => {
    expect(planMint({ ...chain, minedNonce: 3n }, 6)).toMatchObject({ kind: "send", nonce: 6 });
  });

  it("pays at least 1 wei of tip", () => {
    expect(planMint({ ...chain, tip: 0n }, 0)).toMatchObject({ maxPriorityFeePerGas: 1n, maxFeePerGas: 2_000_001n });
  });

  it("records a bottle that's already sealed", () => {
    expect(planMint({ ...chain, tokenOfMessage: 9n }, 0)).toEqual({ kind: "already", tokenId: 9n });
  });

  it("delays everyone when the minter lost its role or can't pay, L1 fee included", () => {
    expect(planMint({ ...chain, estimate: { refusal: "no_minter_role" } }, 0)).toEqual({ kind: "delay" });
    const cost = 480_000n * 2_000_100n + 50_000n;
    expect(planMint({ ...chain, balance: cost - 1n }, 0)).toEqual({ kind: "delay" });
    expect(planMint({ ...chain, balance: cost }, 0).kind).toBe("send");
  });

  it("fails a claim the contract refuses for its own reasons", () => {
    expect(planMint({ ...chain, estimate: { refusal: "too_long" } }, 0)).toEqual({ kind: "fail", error: "too_long" });
    expect(planMint({ ...chain, estimate: { refusal: "reverted" } }, 0)).toEqual({ kind: "fail", error: "reverted" });
  });
});

describe("planFinish", () => {
  const now = 10_000_000;
  const flight: InFlight = {
    messageId: claim.id,
    keeperUid: "keeper",
    to: TO,
    nonce: 5,
    txHashes: ["0xaa", "0xbb"],
    raw: "0x02",
    maxFeePerGas: 2_000_000n,
    maxPriorityFeePerGas: 100n,
    gas: 480_000n,
    sentAt: now - 1_000,
    consumedSince: null,
    cancelled: false,
  };
  const view: FinishView = { receipts: [null, null], minedNonce: 5n, tokenOfMessage: 0n, nextBaseFee: 900_000n, tip: 100n };
  const receipt = (status: number, hash = "0xbb"): Receipt => ({ transactionHash: hash as `0x${string}`, status, logs: [] });

  it("records a mined mint, from whichever transaction landed", () => {
    expect(planFinish(flight, { ...view, receipts: [receipt(1, "0xaa"), null] }, false, now)).toEqual({ kind: "minted", receipt: receipt(1, "0xaa") });
    expect(planFinish(flight, { ...view, receipts: [receipt(0, "0xaa"), receipt(1)] }, false, now)).toEqual({ kind: "minted", receipt: receipt(1) });
  });

  it("fails a reverted mint unless the bottle was sealed anyway", () => {
    expect(planFinish(flight, { ...view, receipts: [null, receipt(0)] }, false, now)).toEqual({ kind: "reverted" });
    expect(planFinish(flight, { ...view, receipts: [null, receipt(0)], tokenOfMessage: 3n }, false, now)).toEqual({ kind: "sealed", tokenId: 3n });
  });

  it("knows a cancellation that landed from a mint", () => {
    const cancelled = { ...flight, cancelled: true };
    expect(planFinish(cancelled, { ...view, receipts: [null, receipt(1)] }, true, now)).toEqual({ kind: "cancelled" });
    expect(planFinish(cancelled, { ...view, receipts: [receipt(1, "0xaa"), null], tokenOfMessage: 3n }, true, now).kind).toBe("minted");
  });

  it("waits while the transaction is pending, then replaces it once fees pass it", () => {
    expect(planFinish(flight, view, false, now)).toEqual({ kind: "wait" });
    const stuck = { ...flight, sentAt: now - STUCK_MS - 1 };
    expect(planFinish(stuck, view, false, now)).toEqual({ kind: "wait" });
    const risen = { ...view, nextBaseFee: 1_500_000n };
    expect(planFinish(stuck, risen, false, now)).toEqual({
      kind: "replace",
      maxFeePerGas: 3_000_100n,
      maxPriorityFeePerGas: 113n,
      cancel: false,
    });
  });

  it("replaces a stuck mint of a removed bottle with a cancellation", () => {
    const stuck = { ...flight, sentAt: now - STUCK_MS - 1 };
    expect(planFinish(stuck, view, true, now)).toMatchObject({ kind: "replace", cancel: true });
    expect(planFinish(stuck, view, false, now)).toEqual({ kind: "wait" });
  });

  it("gives a used nonce time for its receipt, then records the seal or starts over", () => {
    const used = { ...view, minedNonce: 6n };
    expect(planFinish(flight, used, false, now)).toEqual({ kind: "consumed" });
    const noted = { ...flight, consumedSince: now - 1_000 };
    expect(planFinish(noted, used, false, now)).toEqual({ kind: "wait" });
    const waited = { ...flight, consumedSince: now - CONSUMED_WAIT_MS - 1 };
    expect(planFinish(waited, used, false, now)).toEqual({ kind: "requeue", resetNonce: false });
    expect(planFinish(waited, { ...used, tokenOfMessage: 4n }, false, now)).toEqual({ kind: "sealed", tokenId: 4n });
  });

  it("starts over behind a gap that doesn't fill", () => {
    const ahead = { ...view, minedNonce: 4n };
    expect(planFinish({ ...flight, sentAt: now - GAP_MS + 1_000 }, ahead, false, now).kind).not.toBe("requeue");
    expect(planFinish({ ...flight, sentAt: now - GAP_MS - 1 }, ahead, false, now)).toEqual({ kind: "requeue", resetNonce: true });
  });
});

describe("classifySend", () => {
  it("counts only a definite refusal as not sent", () => {
    expect(classifySend(undefined)).toBe("sent");
    expect(classifySend({ message: "already known" })).toBe("sent");
    expect(classifySend({ message: "insufficient funds for gas * price + value + l1Fee" })).toBe("no_funds");
    expect(classifySend({ message: "nonce too low: next nonce 6, tx nonce 5" })).toBe("nonce_used");
    expect(classifySend({ message: "max fee per gas less than block base fee" })).toBe("fees");
    expect(classifySend({ message: "intrinsic gas too low" })).toBe("fees");
    expect(classifySend({ message: "replacement transaction underpriced" })).toBe("maybe");
    expect(classifySend({ message: "upstream timed out" })).toBe("maybe");
  });
});
