// JSON-RPC to the chain: several calls as one batch, parsed by hand and matched by id, so a mint's
// reads cost one subrequest. Base Sepolia's public endpoint sometimes refuses a batch (decisions.md,
// 2026-10-16), and then the calls go one by one, unless the caller needs them answered together.

export interface RpcCall {
  method: string;
  params: unknown[];
}

export interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type RpcAnswer = { result: unknown; error?: undefined } | { result?: undefined; error: RpcError };

/** The endpoint couldn't be reached, timed out, or answered with something that isn't JSON-RPC. */
export class RpcUnavailable extends Error {}

const TIMEOUT_MS = 8_000;

/**
 * Sends the calls as one batch and returns their answers in order. A refused batch is sent again
 * one call at a time, unless `together` is set, which callers use when the answers must come from
 * the same node at the same moment; then a refusal throws RpcUnavailable.
 */
export async function rpcBatch(url: string, calls: RpcCall[], { together = false } = {}): Promise<RpcAnswer[]> {
  const body = calls.map((call, index) => ({ jsonrpc: "2.0", id: index + 1, method: call.method, params: call.params }));
  const answer = await post(url, body);
  const answers = Array.isArray(answer) ? matchAnswers(answer, calls.length) : null;
  if (answers) return answers;
  if (together) throw new RpcUnavailable(`The batch was refused: ${JSON.stringify(answer).slice(0, 160)}`);
  const singles: RpcAnswer[] = [];
  for (const call of calls) singles.push(await rpcCall(url, call));
  return singles;
}

export async function rpcCall(url: string, call: RpcCall): Promise<RpcAnswer> {
  const answer = await post(url, { jsonrpc: "2.0", id: 1, method: call.method, params: call.params });
  const parsed = toAnswer(answer);
  if (!parsed) throw new RpcUnavailable(`Not a JSON-RPC answer: ${JSON.stringify(answer).slice(0, 160)}`);
  return parsed;
}

/** A call's result, or throws with its error. */
export function resultOf(answer: RpcAnswer, what: string): unknown {
  if (answer.error) throw new RpcUnavailable(`${what} failed: ${answer.error.message.slice(0, 160)}`);
  return answer.result;
}

/** Answers in call order, or null unless every call has exactly one. */
export function matchAnswers(answer: unknown[], count: number): RpcAnswer[] | null {
  const byId = new Map<number, RpcAnswer>();
  for (const element of answer) {
    const id = (element as { id?: unknown })?.id;
    const parsed = toAnswer(element);
    if (typeof id !== "number" || !parsed || byId.has(id)) return null;
    byId.set(id, parsed);
  }
  const ordered: RpcAnswer[] = [];
  for (let id = 1; id <= count; id++) {
    const found = byId.get(id);
    if (!found) return null;
    ordered.push(found);
  }
  return ordered;
}

function toAnswer(element: unknown): RpcAnswer | null {
  if (typeof element !== "object" || element === null) return null;
  const { result, error } = element as { result?: unknown; error?: { code?: unknown; message?: unknown; data?: unknown } };
  if (error && typeof error === "object") {
    return { error: { code: Number(error.code), message: String(error.message ?? ""), data: error.data } };
  }
  if (!("result" in element)) return null;
  return { result };
}

async function post(url: string, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new RpcUnavailable(String(error));
  }
  // A JSON-RPC error can come with any HTTP status, so the body decides; one that isn't JSON can't.
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new RpcUnavailable(`HTTP ${response.status}: ${text.slice(0, 160)}`);
  }
}
