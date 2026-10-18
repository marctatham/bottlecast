// Requests and answers. Every answer is JSON and never cached; a refusal is `{ "error": "<code>" }`,
// which the app maps to the spec's copy (README.md lists the codes).

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function errorResponse(error: HttpError): Response {
  return json({ error: error.code }, error.status);
}

const MAX_BODY_BYTES = 16 * 1024;

/** A JSON object body of at most 16 KB, or `bad_request`. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "bad_request");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "bad_request");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new HttpError(400, "bad_request");
  return body as Record<string, unknown>;
}

/** The bearer token, or `unauthenticated`. */
export function bearerToken(request: Request): string {
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(header);
  if (!match) throw new HttpError(401, "unauthenticated");
  return match[1];
}
