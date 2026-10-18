import { afterEach, describe, expect, it, vi } from "vitest";
import {
  and,
  decodeDoc,
  decodeValue,
  DELETE_FIELD,
  deleteWrite,
  encodeValue,
  Firestore,
  FirestoreError,
  SERVER_TIME,
  setWrite,
  updateWrite,
  where,
  type FieldValue,
} from "../src/firestore.ts";

afterEach(() => vi.unstubAllGlobals());

describe("values", () => {
  it("round-trip through Firestore's JSON", () => {
    const values: FieldValue[] = [
      null,
      true,
      0,
      -7,
      2.5,
      "🌊",
      new Date("2026-10-18T12:00:00.123Z"),
      new Uint8Array([1, 2, 255]),
      [],
      [1, "two", [3]],
      { a: { b: [null, false] } },
    ];
    for (const value of values) expect(decodeValue(encodeValue(value))).toEqual(value);
    expect(encodeValue(9007199254740993n)).toEqual({ integerValue: "9007199254740993" });
    expect(decodeValue({ integerValue: "9007199254740993" })).toBe(9007199254740993n);
  });

  it("reads Firestore's microseconds, and refuses a value it doesn't know", () => {
    expect(decodeValue({ timestampValue: "2026-10-18T12:00:00.123456Z" })).toEqual(new Date("2026-10-18T12:00:00.123Z"));
    expect(() => decodeValue({ weirdValue: 1 })).toThrow(TypeError);
  });

  it("decodes a document with its id and update time", () => {
    const doc = decodeDoc({
      name: "projects/p/databases/(default)/documents/claims/abc",
      updateTime: "2026-10-18T12:00:00.000001Z",
      fields: { status: { stringValue: "cooling" } },
    });
    expect(doc).toEqual({ name: "projects/p/databases/(default)/documents/claims/abc", id: "abc", data: { status: "cooling" }, updateTime: "2026-10-18T12:00:00.000001Z" });
  });
});

describe("writes", () => {
  it("change only the named fields, with server times and deletes as transforms and mask entries", () => {
    expect(updateWrite("doc", { status: "minting", nonce: 3, txHash: DELETE_FIELD, mintedAt: SERVER_TIME }, { exists: true })).toEqual({
      update: { name: "doc", fields: { status: { stringValue: "minting" }, nonce: { integerValue: "3" } } },
      updateMask: { fieldPaths: ["status", "nonce", "txHash"] },
      updateTransforms: [{ fieldPath: "mintedAt", setToServerValue: "REQUEST_TIME" }],
      currentDocument: { exists: true },
    });
  });

  it("replace a whole document, or delete one, with a precondition", () => {
    expect(setWrite("doc", { uid: "a", linkedAt: SERVER_TIME }, { exists: false })).toEqual({
      update: { name: "doc", fields: { uid: { stringValue: "a" } } },
      updateTransforms: [{ fieldPath: "linkedAt", setToServerValue: "REQUEST_TIME" }],
      currentDocument: { exists: false },
    });
    expect(deleteWrite("doc", { updateTime: "t" })).toEqual({ delete: "doc", currentDocument: { updateTime: "t" } });
  });

  it("build query filters", () => {
    expect(and(where("status", "IN", ["cooling", "minting"]), where("sealAfter", "LESS_THAN_OR_EQUAL", new Date(0)))).toEqual({
      compositeFilter: {
        op: "AND",
        filters: [
          { fieldFilter: { field: { fieldPath: "status" }, op: "IN", value: { arrayValue: { values: [{ stringValue: "cooling" }, { stringValue: "minting" }] } } } },
          { fieldFilter: { field: { fieldPath: "sealAfter" }, op: "LESS_THAN_OR_EQUAL", value: { timestampValue: "1970-01-01T00:00:00.000Z" } } },
        ],
      },
    });
  });
});

describe("the client", () => {
  const root = "projects/demo/databases/(default)/documents";

  function client(answer: (url: string, body: Record<string, unknown>) => Response | Promise<Response>) {
    const calls: { url: string; body: Record<string, unknown>; auth: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      calls.push({ url, body, auth: (init.headers as Record<string, string>).Authorization });
      return answer(url, body);
    });
    let token = 0;
    let dropped = 0;
    const firestore = new Firestore("demo", async () => `token-${++token}`, async () => void dropped++, null);
    return { firestore, calls, dropped: () => dropped };
  }

  it("starts a transaction with its first read and reads missing documents as null", async () => {
    const { firestore, calls } = client(() =>
      Response.json([
        { transaction: "dHg=" },
        { found: { name: `${root}/claims/a`, updateTime: "u1", fields: { status: { stringValue: "cooling" } } } },
        { missing: `${root}/claims/b` },
      ]),
    );
    const read = await firestore.batchGet([`${root}/claims/a`, `${root}/claims/b`], { newTransaction: true });
    expect(calls[0].url).toBe(`https://firestore.googleapis.com/v1/${root}:batchGet`);
    expect(calls[0].body).toEqual({ documents: [`${root}/claims/a`, `${root}/claims/b`], newTransaction: { readWrite: {} } });
    expect(read.transaction).toBe("dHg=");
    expect(read.docs.get(`${root}/claims/a`)?.data).toEqual({ status: "cooling" });
    expect(read.docs.get(`${root}/claims/b`)).toBeNull();
  });

  it("queries a subcollection under its parent, inside a transaction", async () => {
    const { firestore, calls } = client(() => Response.json([{ readTime: "t" }]));
    const result = await firestore.runQuery(`${root}/users/u1`, { from: [{ collectionId: "wallets" }] }, { transaction: "dHg=" });
    expect(calls[0].url).toBe(`https://firestore.googleapis.com/v1/${root}/users/u1:runQuery`);
    expect(calls[0].body).toEqual({ structuredQuery: { from: [{ collectionId: "wallets" }] }, transaction: "dHg=" });
    expect(result.docs).toEqual([]);
  });

  it("commits in the transaction and returns each write's update time", async () => {
    const { firestore, calls } = client(() => Response.json({ commitTime: "c", writeResults: [{ updateTime: "u" }, {}] }));
    const result = await firestore.commit([deleteWrite("a"), deleteWrite("b")], "dHg=");
    expect(calls[0].body).toEqual({ writes: [{ delete: "a" }, { delete: "b" }], transaction: "dHg=" });
    expect(result).toEqual({ commitTime: "c", updateTimes: ["u", undefined] });
  });

  it("drops a refused token and tries once more with a new one", async () => {
    let first = true;
    const { firestore, calls, dropped } = client(() => {
      if (first) {
        first = false;
        return Response.json({ error: { status: "UNAUTHENTICATED" } }, { status: 401 });
      }
      return Response.json({ commitTime: "c" });
    });
    await firestore.commit([]);
    expect(dropped()).toBe(1);
    expect(calls.map((call) => call.auth)).toEqual(["Bearer token-1", "Bearer token-2"]);
  });

  it("names Google's status on an error, in an answer or in a stream, and calls contention a conflict", async () => {
    const { firestore } = client((url) =>
      url.endsWith(":commit")
        ? Response.json({ error: { code: 409, status: "ABORTED", message: "Too much contention" } }, { status: 409 })
        : Response.json([{ error: { code: 400, status: "FAILED_PRECONDITION", message: "index" } }]),
    );
    const commit = await firestore.commit([]).catch((error: unknown) => error);
    expect(commit).toBeInstanceOf(FirestoreError);
    expect((commit as FirestoreError).status).toBe("ABORTED");
    expect((commit as FirestoreError).conflict).toBe(true);
    const query = await firestore.runQuery(root, { from: [{ collectionId: "claims" }] }).catch((error: unknown) => error);
    expect((query as FirestoreError).status).toBe("FAILED_PRECONDITION");
  });

  it("calls an unreachable service UNAVAILABLE, and a rollback never throws", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("network down");
    });
    const firestore = new Firestore("demo", async () => "t", async () => undefined, "127.0.0.1:8180");
    const error = (await firestore.commit([]).catch((caught: unknown) => caught)) as FirestoreError;
    expect(error.status).toBe("UNAVAILABLE");
    await expect(firestore.rollback("dHg=")).resolves.toBeUndefined();
  });
});
