// Firestore over REST, with only what the Worker needs: batchGet, runQuery, commit and rollback,
// preconditions, server-time transforms, and read-write transactions started by the first read
// (`newTransaction`), so a transaction costs no extra request. The Worker's service account isn't
// bound by firestore.rules. Against the emulator, `Bearer owner` does the same.
import { base64ToBytes, bytesToBase64 } from "./bytes.ts";

/** A field value as the Worker reads and writes it. Integers are numbers; timestamps are Dates. */
export type FieldValue =
  | null
  | boolean
  | number
  | bigint
  | string
  | Date
  | Uint8Array
  | FieldValue[]
  | { [key: string]: FieldValue };

/** Sets a field to the commit's time. */
export const SERVER_TIME = Symbol("server time");
/** Removes a field. */
export const DELETE_FIELD = Symbol("delete field");
export type WriteValue = FieldValue | typeof SERVER_TIME | typeof DELETE_FIELD;

export interface Doc {
  /** The full resource name. */
  name: string;
  id: string;
  data: Record<string, FieldValue>;
  updateTime: string;
}

export type Precondition = { exists: boolean } | { updateTime: string };

export type Write =
  | {
      update: { name: string; fields: Record<string, unknown> };
      updateMask?: { fieldPaths: string[] };
      updateTransforms?: { fieldPath: string; setToServerValue: "REQUEST_TIME" }[];
      currentDocument?: Precondition;
    }
  | { delete: string; currentDocument?: Precondition };

/** A read joins a transaction: starts one, or reads inside an open one. */
export type ReadIn = { newTransaction: true } | { transaction: string };

export class FirestoreError extends Error {
  readonly httpStatus: number;
  /** Google's status, such as ABORTED or FAILED_PRECONDITION; UNAVAILABLE for a timeout. */
  readonly status: string;

  constructor(httpStatus: number, status: string, message: string) {
    super(`Firestore ${status} (${httpStatus}): ${message.slice(0, 200)}`);
    this.httpStatus = httpStatus;
    this.status = status;
  }

  /** Another writer got there first, or the transaction was contended: fine to try again later. */
  get conflict(): boolean {
    return ["ABORTED", "FAILED_PRECONDITION", "ALREADY_EXISTS"].includes(this.status);
  }

  /**
   * Worth trying again later: a conflict, or Firestore unreachable, overloaded or out of quota for
   * the day (Spark's limits halt rather than bill).
   */
  get busy(): boolean {
    return (
      this.conflict ||
      ["UNAVAILABLE", "RESOURCE_EXHAUSTED", "DEADLINE_EXCEEDED"].includes(this.status) ||
      this.httpStatus === 429 ||
      this.httpStatus >= 500
    );
  }
}

const TIMEOUT_MS = 10_000;

export class Firestore {
  /** `projects/{p}/databases/(default)/documents` */
  readonly root: string;
  private readonly base: string;
  private readonly token: () => Promise<string>;
  private readonly dropToken: () => Promise<void>;

  constructor(projectId: string, token: () => Promise<string>, dropToken: () => Promise<void>, emulatorHost: string | null) {
    this.root = `projects/${projectId}/databases/(default)/documents`;
    this.base = emulatorHost ? `http://${emulatorHost}/v1` : "https://firestore.googleapis.com/v1";
    this.token = token;
    this.dropToken = dropToken;
  }

  /** A document's full name from its path segments. */
  path(...segments: string[]): string {
    return `${this.root}/${segments.join("/")}`;
  }

  /** The named documents, null where missing, and the transaction the read started, if it did. */
  async batchGet(names: string[], readIn?: ReadIn): Promise<{ docs: Map<string, Doc | null>; transaction?: string }> {
    const answers = streamed<{ found?: RawDoc; missing?: string; transaction?: string }>(
      await this.call(`${this.root}:batchGet`, { documents: names, ...readOptions(readIn) }),
    );
    const docs = new Map<string, Doc | null>(names.map((name) => [name, null]));
    let transaction: string | undefined;
    for (const answer of answers) {
      if (answer.transaction) transaction = answer.transaction;
      if (answer.found) docs.set(answer.found.name, decodeDoc(answer.found));
    }
    return { docs, transaction: started(readIn, transaction) };
  }

  /** A query under `parent` (the root, or a document for its subcollections). */
  async runQuery(parent: string, query: StructuredQuery, readIn?: ReadIn): Promise<{ docs: Doc[]; transaction?: string }> {
    const answers = streamed<{ document?: RawDoc; transaction?: string }>(
      await this.call(`${parent}:runQuery`, { structuredQuery: query, ...readOptions(readIn) }),
    );
    const docs: Doc[] = [];
    let transaction: string | undefined;
    for (const answer of answers) {
      if (answer.transaction) transaction = answer.transaction;
      if (answer.document) docs.push(decodeDoc(answer.document));
    }
    return { docs, transaction: started(readIn, transaction) };
  }

  /** Commits the writes, inside `transaction` if given. Returns each write's new update time. */
  async commit(writes: Write[], transaction?: string): Promise<{ commitTime: string; updateTimes: (string | undefined)[] }> {
    const answer = (await this.call(`${this.root}:commit`, { writes, ...(transaction ? { transaction } : {}) })) as {
      commitTime: string;
      writeResults?: { updateTime?: string }[];
    };
    return { commitTime: answer.commitTime, updateTimes: (answer.writeResults ?? []).map((result) => result.updateTime) };
  }

  /** Ends a transaction without writing, so its read locks don't wait for its timeout. Never throws. */
  async rollback(transaction: string | undefined): Promise<void> {
    if (!transaction) return;
    try {
      await this.call(`${this.root}:rollback`, { transaction });
    } catch {
      // It's gone already (committed, aborted or expired), which is all a rollback wants.
    }
  }

  private async call(resource: string, body: unknown, retried = false): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.base}/${resource}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await this.token()}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new FirestoreError(0, "UNAVAILABLE", String(error));
    }
    if (response.status === 401 && !retried) {
      await this.dropToken();
      return this.call(resource, body, true);
    }
    const answer = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) throw errorFrom(response.status, answer);
    // A streamed answer (batchGet, runQuery) can carry its error as an element.
    if (Array.isArray(answer)) {
      const failed = answer.find((element) => element && typeof element === "object" && "error" in element);
      if (failed) throw errorFrom(response.status, failed);
    }
    return answer;
  }
}

function readOptions(readIn: ReadIn | undefined): object {
  if (!readIn) return {};
  return "newTransaction" in readIn ? { newTransaction: { readWrite: {} } } : { transaction: readIn.transaction };
}

/** A read that was to start a transaction must have started one, or nothing after it is atomic. */
function started(readIn: ReadIn | undefined, transaction: string | undefined): string | undefined {
  if (readIn && "newTransaction" in readIn && !transaction) {
    throw new FirestoreError(0, "INTERNAL", "A read that should have started a transaction didn't");
  }
  return transaction;
}

function streamed<T>(answers: unknown): T[] {
  return Array.isArray(answers) ? (answers as T[]) : [answers as T];
}

function errorFrom(httpStatus: number, answer: unknown): FirestoreError {
  const error = (answer as { error?: { status?: string; message?: string } } | null)?.error;
  return new FirestoreError(httpStatus, error?.status ?? "UNKNOWN", error?.message ?? "");
}

// ---------- Writes ----------

/**
 * Changes only the given fields, keeping the rest: `SERVER_TIME` sets one to the commit's time and
 * `DELETE_FIELD` removes it. Unlike the SDKs, a REST update creates a missing document, so pass a
 * precondition wherever that matters.
 */
export function updateWrite(name: string, fields: Record<string, WriteValue>, currentDocument?: Precondition): Write {
  const encoded: Record<string, unknown> = {};
  const mask: string[] = [];
  const transforms: { fieldPath: string; setToServerValue: "REQUEST_TIME" }[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === SERVER_TIME) transforms.push({ fieldPath: key, setToServerValue: "REQUEST_TIME" });
    else {
      mask.push(key);
      if (value !== DELETE_FIELD) encoded[key] = encodeValue(value);
    }
  }
  return {
    update: { name, fields: encoded },
    updateMask: { fieldPaths: mask },
    ...(transforms.length ? { updateTransforms: transforms } : {}),
    ...(currentDocument ? { currentDocument } : {}),
  };
}

/** Replaces the whole document (or creates it). */
export function setWrite(name: string, fields: Record<string, FieldValue | typeof SERVER_TIME>, currentDocument?: Precondition): Write {
  const encoded: Record<string, unknown> = {};
  const transforms: { fieldPath: string; setToServerValue: "REQUEST_TIME" }[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === SERVER_TIME) transforms.push({ fieldPath: key, setToServerValue: "REQUEST_TIME" });
    else encoded[key] = encodeValue(value);
  }
  return {
    update: { name, fields: encoded },
    ...(transforms.length ? { updateTransforms: transforms } : {}),
    ...(currentDocument ? { currentDocument } : {}),
  };
}

export function deleteWrite(name: string, currentDocument?: Precondition): Write {
  return { delete: name, ...(currentDocument ? { currentDocument } : {}) };
}

// ---------- Queries ----------

export interface StructuredQuery {
  from: { collectionId: string }[];
  where?: unknown;
  orderBy?: { field: { fieldPath: string }; direction: "ASCENDING" | "DESCENDING" }[];
  limit?: number;
}

type Operator = "EQUAL" | "IN" | "LESS_THAN_OR_EQUAL";

export function where(fieldPath: string, op: Operator, value: FieldValue): unknown {
  return { fieldFilter: { field: { fieldPath }, op, value: encodeValue(value) } };
}

export function and(...filters: unknown[]): unknown {
  return { compositeFilter: { op: "AND", filters } };
}

// ---------- Values ----------

interface RawDoc {
  name: string;
  fields?: Record<string, RawValue>;
  updateTime: string;
}

type RawValue = Record<string, unknown>;

export function encodeValue(value: FieldValue): RawValue {
  if (value === null) return { nullValue: null };
  switch (typeof value) {
    case "boolean":
      return { booleanValue: value };
    case "bigint":
      return { integerValue: value.toString() };
    case "number":
      return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    case "string":
      return { stringValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (value instanceof Uint8Array) return { bytesValue: bytesToBase64(value) };
  if (Array.isArray(value)) return { arrayValue: value.length ? { values: value.map(encodeValue) } : {} };
  const fields: Record<string, RawValue> = {};
  for (const [key, field] of Object.entries(value)) fields[key] = encodeValue(field);
  return { mapValue: { fields } };
}

export function decodeValue(raw: RawValue): FieldValue {
  if ("nullValue" in raw) return null;
  if ("booleanValue" in raw) return raw.booleanValue as boolean;
  if ("integerValue" in raw) {
    const value = BigInt(raw.integerValue as string);
    return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
  }
  if ("doubleValue" in raw) return Number(raw.doubleValue);
  if ("timestampValue" in raw) return new Date(raw.timestampValue as string);
  if ("stringValue" in raw) return raw.stringValue as string;
  if ("bytesValue" in raw) return base64ToBytes(raw.bytesValue as string);
  if ("referenceValue" in raw) return raw.referenceValue as string;
  if ("arrayValue" in raw) {
    const values = (raw.arrayValue as { values?: RawValue[] }).values ?? [];
    return values.map(decodeValue);
  }
  if ("mapValue" in raw) return decodeFields((raw.mapValue as { fields?: Record<string, RawValue> }).fields ?? {});
  if ("geoPointValue" in raw) return decodeFields({});
  throw new TypeError(`An unknown Firestore value: ${Object.keys(raw).join(", ")}`);
}

function decodeFields(fields: Record<string, RawValue>): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const [key, value] of Object.entries(fields)) out[key] = decodeValue(value);
  return out;
}

export function decodeDoc(raw: RawDoc): Doc {
  return {
    name: raw.name,
    id: raw.name.slice(raw.name.lastIndexOf("/") + 1),
    data: decodeFields(raw.fields ?? {}),
    updateTime: raw.updateTime,
  };
}
