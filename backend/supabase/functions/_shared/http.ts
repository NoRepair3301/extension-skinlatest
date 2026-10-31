/**
 * Responses, CORS and logging for every function. Errors are generic (a fixed kind, never a stack, an email or a token).
 * Logs carry a request id and a kind only: no emails, tokens, bodies, headers or IPs.
 */
export type ErrorKind = "bad-request" | "unauthorized" | "forbidden" | "not-found" | "rate-limited" | "unavailable" | "server";

const STATUS: Record<ErrorKind, number> = { "bad-request": 400, unauthorized: 401, forbidden: 403, "not-found": 404, "rate-limited": 429, unavailable: 503, server: 500 };

export const ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";

/** ALLOWED_ORIGINS: comma-separated exact origins (the extension's chrome-extension://<id>). Nothing else is ever allowed. */
export function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^(?:chrome-extension:\/\/[a-p]{32}|https:\/\/[a-z0-9.-]+(?::\d{1,5})?)$/.test(s));
}

export function corsHeaders(req: Request, allowed: readonly string[]): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const h: Record<string, string> = { vary: "Origin" };
  if (allowed.includes(origin)) {
    h["access-control-allow-origin"] = origin;
    h["access-control-allow-headers"] = ALLOW_HEADERS;
    h["access-control-allow-methods"] = "POST, GET, OPTIONS";
    h["access-control-max-age"] = "600";
  }
  return h;
}

export function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export function fail(kind: ErrorKind, cors: Record<string, string>, retryAfterS?: number): Response {
  const res = json({ error: kind }, STATUS[kind], cors);
  if (retryAfterS !== undefined) res.headers.set("retry-after", String(Math.max(1, Math.ceil(retryAfterS))));
  return res;
}

export type Logger = (event: string, requestId: string) => void;

/** The only logger the functions use: an event word and a request id. */
export const consoleLogger: Logger = (event, requestId) => {
  // only the leading word of each: anything after it (an address, a token) is dropped, never cleaned up and kept
  const word = (s: string, fallback: string) => /^[a-z0-9-]{1,40}/.exec(s)?.[0] ?? fallback;
  console.log(JSON.stringify({ event: word(event, "event"), rid: word(requestId, "rid") }));
};

export const newRequestId = (): string => crypto.randomUUID();

/** Reads a JSON body of at most `max` bytes; undefined for anything else. */
export async function readJson(req: Request, max = 4096): Promise<unknown> {
  const text = await readText(req, max);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function readText(req: Request, max: number): Promise<string | undefined> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(len) && len > max) return undefined;
  const text = await req.text();
  return text.length > max ? undefined : text;
}

/** The bearer token of the caller, or undefined. */
export function bearer(req: Request): string | undefined {
  const m = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(req.headers.get("authorization") ?? "");
  return m?.[1];
}

/** Constant-time comparison of two strings (same length or not). */
export function safeEqual(a: string, b: string): boolean {
  const n = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
