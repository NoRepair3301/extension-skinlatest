import type { ErrorKind, GenerateRequest, Result } from "./types.ts";

export type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export interface HttpDeps {
  fetchFn?: FetchFn;
  timeoutMs?: number;
  /** Used between the first try and the single retry. */
  sleep?: (ms: number) => Promise<void>;
}

/** Used only when an adapter passes no timeout; the real limits are PROVIDER_TIMEOUTS in src/config.ts. */
export const CALL_TIMEOUT_MS = 25_000;
export const MAX_RETRY_AFTER_MS = 5_000;

const defaultFetch: FetchFn = (url, init) => fetch(url, init);
const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Maps an HTTP status (and optionally an error message) to an ErrorKind. Docs: docs/providers/*.md. */
export function kindForStatus(status: number, message = ""): ErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return /quota/i.test(message) ? "quota" : "rate";
  if (status === 499) return "aborted";
  if (status === 408) return "timeout";
  if (status >= 500 || status === 498) return "server"; // 498: Groq flex tier at capacity
  return "bad-output"; // 400, 404, 413, 422, 424 and anything else unexpected
}

/** retry-after is documented in seconds. Returns milliseconds, or undefined when absent or unreadable. */
export function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const s = Number(value);
  return Number.isFinite(s) && s >= 0 ? Math.round(s * 1000) : undefined;
}

/** Pulls error.message out of a provider error body without trusting its shape. */
function errorMessage(body: string): string {
  try {
    const m = (JSON.parse(body) as { error?: { message?: unknown } }).error?.message;
    return typeof m === "string" ? m.slice(0, 200) : "";
  } catch {
    return "";
  }
}

/** Parses a model answer into JSON, tolerating code fences and surrounding prose. Returns undefined if none found. */
export function parseJsonAnswer(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

export interface Call {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  /** Turns the parsed response JSON into the model's answer text, or undefined if it is not found. */
  extractText(response: unknown): string | undefined;
}

/**
 * One request with the provider's call timeout and at most one retry (429 or 5xx with a retry-after of 5 s or less).
 * Never throws, and never puts the URL, headers or any error text into the result.
 */
export async function callJson(call: Call, req: GenerateRequest, deps: HttpDeps = {}): Promise<Result> {
  const doFetch = deps.fetchFn ?? defaultFetch;
  const sleep = deps.sleep ?? defaultSleep;
  const timeoutMs = deps.timeoutMs ?? CALL_TIMEOUT_MS;

  const attempt = async (): Promise<Result> => {
    if (req.signal?.aborted) return { ok: false, error: { kind: "aborted" } };
    const ctl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
    }, timeoutMs);
    const onAbort = () => ctl.abort();
    req.signal?.addEventListener("abort", onAbort);
    try {
      const res = await doFetch(call.url, { method: "POST", headers: call.headers, body: JSON.stringify(call.body), signal: ctl.signal });
      const text = await res.text();
      if (res.status < 200 || res.status >= 300) {
        const kind = kindForStatus(res.status, errorMessage(text));
        const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
        return retryAfterMs === undefined ? { ok: false, error: { kind } } : { ok: false, error: { kind, retryAfterMs } };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { ok: false, error: { kind: "bad-output" } };
      }
      const answer = call.extractText(parsed);
      const json = answer === undefined ? undefined : parseJsonAnswer(answer);
      return json === undefined ? { ok: false, error: { kind: "bad-output" } } : { ok: true, json };
    } catch {
      if (req.signal?.aborted) return { ok: false, error: { kind: "aborted" } };
      return { ok: false, error: { kind: timedOut ? "timeout" : "network" } };
    } finally {
      clearTimeout(timer);
      req.signal?.removeEventListener("abort", onAbort);
    }
  };

  const first = await attempt();
  if (first.ok) return first;
  const { kind, retryAfterMs } = first.error;
  const retryable = kind === "rate" || kind === "quota" || kind === "server";
  if (retryable && retryAfterMs !== undefined && retryAfterMs <= MAX_RETRY_AFTER_MS) {
    await sleep(retryAfterMs);
    return attempt();
  }
  return first;
}
