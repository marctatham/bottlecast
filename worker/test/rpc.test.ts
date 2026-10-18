import { afterEach, describe, expect, it, vi } from "vitest";
import { matchAnswers, resultOf, rpcBatch, RpcUnavailable } from "../src/rpc.ts";

afterEach(() => vi.unstubAllGlobals());

const calls = [
  { method: "eth_getTransactionCount", params: ["0x01", "latest"] },
  { method: "eth_gasPrice", params: [] },
  { method: "eth_call", params: [{ to: "0x02", data: "0x" }, "latest"] },
];

function node(answer: (body: unknown) => unknown) {
  const bodies: unknown[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as unknown;
    bodies.push(body);
    const reply = answer(body);
    return typeof reply === "string" ? new Response(reply, { status: 503 }) : Response.json(reply);
  });
  return bodies;
}

describe("rpcBatch", () => {
  it("sends one batch and matches answers to calls by id, whatever their order", async () => {
    const bodies = node(() => [
      { jsonrpc: "2.0", id: 3, error: { code: 3, message: "execution reverted", data: "0xe2517d3f" } },
      { jsonrpc: "2.0", id: 1, result: "0x2a" },
      { jsonrpc: "2.0", id: 2, result: "0x3b9aca00" },
    ]);
    const answers = await rpcBatch("https://rpc.example", calls);
    expect(bodies).toHaveLength(1);
    expect(answers[0]).toEqual({ result: "0x2a" });
    expect(answers[1]).toEqual({ result: "0x3b9aca00" });
    expect(answers[2]).toEqual({ error: { code: 3, message: "execution reverted", data: "0xe2517d3f" } });
  });

  it("sends the calls one by one when the batch is refused", async () => {
    const bodies = node((body) =>
      Array.isArray(body) ? { jsonrpc: "2.0", id: null, error: { code: -32600, message: "batch refused" } } : { jsonrpc: "2.0", id: 1, result: "0x1" },
    );
    const answers = await rpcBatch("https://rpc.example", calls);
    expect(bodies).toHaveLength(4);
    expect(answers).toEqual([{ result: "0x1" }, { result: "0x1" }, { result: "0x1" }]);
  });

  it("refuses to split a batch whose answers must come together", async () => {
    node(() => ({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "batch refused" } }));
    await expect(rpcBatch("https://rpc.example", calls, { together: true })).rejects.toBeInstanceOf(RpcUnavailable);
  });

  it("treats a missing or repeated answer as a refused batch", () => {
    expect(matchAnswers([{ id: 1, result: "0x1" }], 2)).toBeNull();
    expect(matchAnswers([{ id: 1, result: "0x1" }, { id: 1, result: "0x2" }], 2)).toBeNull();
    expect(matchAnswers([{ id: 1, result: "0x1" }, { id: 2 }], 2)).toBeNull();
  });

  it("calls an answer that isn't JSON unavailable", async () => {
    node(() => "<html>busy</html>");
    await expect(rpcBatch("https://rpc.example", calls)).rejects.toBeInstanceOf(RpcUnavailable);
  });

  it("throws a call's own error from resultOf", () => {
    expect(resultOf({ result: "0x1" }, "x")).toBe("0x1");
    expect(() => resultOf({ error: { code: -32000, message: "nope" } }, "x")).toThrow(RpcUnavailable);
  });
});
