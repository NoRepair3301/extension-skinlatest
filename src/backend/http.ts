import { isOnline } from "../ui/online.ts";
import type { BackendConfig } from "./config.ts";

/**
 * The one place the Plus client calls the network: the Supabase project from the build config, nothing else. Never a page URL, origin,
 * site list, key or page data in a request. Tokens go in headers only, never in a URL. Errors are fixed kinds, never server text.
 */
export type BackendError = "offline" | "network" | "timeout" | "auth" | "rate" | "invalid" | "unavailable" | "server";
export type BackendResult<T> = { ok: true; value: T } | { ok: false; error: BackendError };

export const BACKEND_TIMEOUT_MS = 15_000;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const kindOf = (status: number): BackendError =>
  status === 401 || status === 403 ? "auth" : status === 429 ? "rate" : status === 400 || status === 404 || status === 422 ? "invalid" : status === 503 ? "unavailable" : "server";

export async function backendCall(
  cfg: BackendConfig,
  path: `/auth/v1/${string}` | `/functions/v1/${string}` | `/rest/v1/${string}`,
  init: { method: "GET" | "POST"; body?: unknown; bearer?: string | undefined },
  deps: { fetch?: FetchLike; online?: () => boolean; timeoutMs?: number } = {},
): Promise<BackendResult<unknown>> {
  if (!(deps.online ?? isOnline)()) return { ok: false, error: "offline" };
  const f: FetchLike = deps.fetch ?? ((u, i) => fetch(u, i));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? BACKEND_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { apikey: cfg.anonKey, "content-type": "application/json" };
    if (init.bearer) headers["authorization"] = `Bearer ${init.bearer}`;
    const res = await f(`${cfg.url}${path}`, { method: init.method, headers, signal: ctrl.signal, ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }), credentials: "omit", cache: "no-store" });
    if (!res.ok) return { ok: false, error: kindOf(res.status) };
    if (res.status === 204) return { ok: true, value: undefined };
    const text = await res.text();
    if (text.length > 65_536) return { ok: false, error: "server" };
    try {
      return { ok: true, value: text === "" ? undefined : (JSON.parse(text) as unknown) };
    } catch {
      return { ok: false, error: "server" };
    }
  } catch {
    return { ok: false, error: ctrl.signal.aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}
