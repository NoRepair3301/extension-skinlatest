import { storageGet, storageRemove, storageSet } from "../extension/api.ts";
import type { BackendConfig } from "./config.ts";
import { backendCall, type BackendError, type BackendResult, type FetchLike } from "./http.ts";

/**
 * Plus sign-in by email code (Supabase Auth email OTP; docs/backend/supabase.md). No passwords. The session lives only in
 * storage.local `auth`, is refreshed shortly before it expires and is wiped on sign-out. It never reaches a content script, a page,
 * a log or an error message.
 */
export const AUTH_KEY = "auth";
export const REFRESH_EARLY_MS = 60_000;

export interface Session {
  v: 1;
  access: string;
  refresh: string;
  /** Milliseconds since the epoch. */
  expiresAt: number;
  userId: string;
  /** Shown in Settings so the user knows which account is signed in. Stays on this device. */
  email: string;
}

export interface AuthDeps {
  fetch?: FetchLike;
  online?: () => boolean;
  now?: () => number;
}

const EMAIL = /^[^\s@"<>]{1,64}@[A-Za-z0-9.-]{1,185}\.[A-Za-z]{2,24}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9._-]{10,4096}$/;

export const isEmail = (s: string): boolean => s.length <= 254 && EMAIL.test(s);
export const isCode = (s: string): boolean => /^[0-9]{6,10}$/.test(s);

export function parseSession(raw: unknown): Session | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (r["v"] !== 1 || typeof r["access"] !== "string" || !TOKEN.test(r["access"]) || typeof r["refresh"] !== "string" || !TOKEN.test(r["refresh"])) return undefined;
  if (typeof r["expiresAt"] !== "number" || !Number.isFinite(r["expiresAt"]) || typeof r["userId"] !== "string" || !UUID.test(r["userId"]) || typeof r["email"] !== "string" || !isEmail(r["email"])) return undefined;
  return { v: 1, access: r["access"], refresh: r["refresh"], expiresAt: r["expiresAt"], userId: r["userId"], email: r["email"] };
}

/** A session from an Auth token response (`access_token`, `refresh_token`, `expires_in`, `user`). */
export function sessionFrom(body: unknown, now: number, fallbackEmail?: string): Session | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const b = body as Record<string, unknown>;
  const user = typeof b["user"] === "object" && b["user"] !== null ? (b["user"] as Record<string, unknown>) : {};
  const expiresIn = typeof b["expires_in"] === "number" && b["expires_in"] > 0 && b["expires_in"] < 7 * 86400 ? b["expires_in"] : undefined;
  if (expiresIn === undefined) return undefined;
  return parseSession({ v: 1, access: b["access_token"], refresh: b["refresh_token"], expiresAt: now + expiresIn * 1000, userId: user["id"], email: typeof user["email"] === "string" ? user["email"] : fallbackEmail });
}

export async function loadSession(): Promise<Session | undefined> {
  try {
    return parseSession(await storageGet(AUTH_KEY));
  } catch {
    return undefined;
  }
}

const saveSession = (s: Session): Promise<void> => storageSet(AUTH_KEY, s);

/** Step 1: Supabase emails a six-digit code. The address goes to Supabase Auth only. */
export async function sendCode(cfg: BackendConfig, email: string, deps: AuthDeps = {}): Promise<BackendResult<void>> {
  const e = email.trim().toLowerCase();
  if (!isEmail(e)) return { ok: false, error: "invalid" };
  const r = await backendCall(cfg, "/auth/v1/otp", { method: "POST", body: { email: e, create_user: true } }, deps);
  return r.ok ? { ok: true, value: undefined } : r;
}

/** Step 2: the code from the email becomes a session. */
export async function verifyCode(cfg: BackendConfig, email: string, code: string, deps: AuthDeps = {}): Promise<BackendResult<Session>> {
  const e = email.trim().toLowerCase();
  const c = code.replace(/\s/g, "");
  if (!isEmail(e) || !isCode(c)) return { ok: false, error: "invalid" };
  const r = await backendCall(cfg, "/auth/v1/verify", { method: "POST", body: { email: e, token: c, type: "email" } }, deps);
  if (!r.ok) return r.error === "invalid" ? { ok: false, error: "auth" } : r;
  const s = sessionFrom(r.value, (deps.now ?? Date.now)(), e);
  if (!s) return { ok: false, error: "server" };
  await saveSession(s);
  return { ok: true, value: s };
}

let refreshing: Promise<Session | undefined> | undefined;

/**
 * The current session, refreshed when it expires within a minute. One refresh at a time (a refresh token is single use).
 * A refused refresh signs the user out locally; a network problem keeps the old session for the next try.
 */
export async function currentSession(cfg: BackendConfig, deps: AuthDeps = {}): Promise<{ session?: Session; error?: BackendError }> {
  const now = (deps.now ?? Date.now)();
  const s = await loadSession();
  if (!s) return {};
  if (s.expiresAt - now > REFRESH_EARLY_MS) return { session: s };
  let error: BackendError | undefined;
  refreshing ??= (async () => {
    const r = await backendCall(cfg, "/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: s.refresh } }, deps);
    if (!r.ok) {
      error = r.error;
      if (r.error === "auth" || r.error === "invalid") await wipeAccount();
      return undefined;
    }
    const next = sessionFrom(r.value, now, s.email);
    if (!next || next.userId !== s.userId) {
      error = "server";
      return undefined;
    }
    await saveSession(next);
    return next;
  })().finally(() => {
    refreshing = undefined;
  });
  const next = await refreshing;
  return next ? { session: next } : error ? { error } : {};
}

/** Removes the session, the cached entitlement and the plan flag (Free from now on). Local themes, sites and assets stay. */
export async function wipeAccount(): Promise<void> {
  await storageRemove(AUTH_KEY).catch(() => undefined);
  await storageRemove("entitlement").catch(() => undefined);
  await storageSet("plan", { v: 1, plan: "free", until: 0 }).catch(() => undefined);
}

/** Sign out: tells Supabase (best effort) and wipes the account data on this device either way. */
export async function signOut(cfg: BackendConfig, deps: AuthDeps = {}): Promise<void> {
  const s = await loadSession();
  if (s) await backendCall(cfg, "/auth/v1/logout", { method: "POST", bearer: s.access }, deps).catch(() => undefined);
  await wipeAccount();
}
