import { storageGet, storageRemove, storageSet } from "../extension/api.ts";
import { savePlanRecord, type PlanRecord } from "../extension/planFlag.ts";
import type { PlanFlag } from "../core/entitlements.ts";
import { importVerifyKey, verifyEntitlement } from "../../backend/supabase/functions/_shared/token.ts";
import { currentSession, wipeAccount, type AuthDeps, type Session } from "./auth.ts";
import type { BackendConfig } from "./config.ts";
import { backendCall, type BackendError, type BackendResult } from "./http.ts";

/**
 * The signed entitlement (docs/PLUS_SPEC.md 2). Fetched on demand and at most daily, verified with WebCrypto (Ed25519) against the
 * public key baked into the build, cached in storage.local `entitlement`. Plus counts while the token is valid plus a 7-day offline
 * grace. A tampered, wrong-key, malformed, foreign (another user's) or too old token counts as Free. Only the derived flag
 * (`plan`, src/extension/planFlag.ts) is ever read by page scripts.
 */
export const ENTITLEMENT_KEY = "entitlement";
export const GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const DAILY_MS = 24 * 60 * 60 * 1000;

export type EntStatus = "none" | "active" | "cancelled" | "expired" | "refunded";

export interface EntitlementCache {
  v: 1;
  token: string;
  fetchedAt: number;
  status: EntStatus;
  /** Seconds since the epoch, when Plus renews or ends; null when not Plus. */
  renewsAt: number | null;
}

const STATUSES: readonly EntStatus[] = ["none", "active", "cancelled", "expired", "refunded"];

export function parseCache(raw: unknown): EntitlementCache | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (r["v"] !== 1 || typeof r["token"] !== "string" || r["token"].length > 2048 || typeof r["fetchedAt"] !== "number") return undefined;
  const status = STATUSES.find((s) => s === r["status"]) ?? "none";
  const renewsAt = typeof r["renewsAt"] === "number" && Number.isInteger(r["renewsAt"]) ? r["renewsAt"] : null;
  return { v: 1, token: r["token"], fetchedAt: r["fetchedAt"], status, renewsAt };
}

let verifier: Promise<{ key: CryptoKey; kid: string } | undefined> | undefined;
let verifierFor = "";
const verifyKey = (pubkey: string) => {
  if (!verifier || verifierFor !== pubkey) {
    verifierFor = pubkey;
    verifier = importVerifyKey(pubkey).catch(() => undefined);
  }
  return verifier;
};

/** The plan record a cached token gives right now (pure apart from WebCrypto). Free for anything that does not verify. */
export async function deriveRecord(cfg: BackendConfig, cache: EntitlementCache | undefined, session: Pick<Session, "userId"> | undefined, now: number): Promise<PlanRecord> {
  const free: PlanRecord = { v: 1, plan: "free", until: 0 };
  if (!cache || !session) return free;
  const k = await verifyKey(cfg.pubkey);
  if (!k) return free;
  const claims = await verifyEntitlement(cache.token, k.key, k.kid);
  if (!claims || claims.sub !== session.userId || claims.plan !== "plus") return free;
  const until = claims.exp * 1000 + GRACE_MS;
  return now < until && claims.iat * 1000 <= now + 5 * 60_000 ? { v: 1, plan: "plus", until } : free;
}

export async function loadCache(): Promise<EntitlementCache | undefined> {
  try {
    return parseCache(await storageGet(ENTITLEMENT_KEY));
  } catch {
    return undefined;
  }
}

export interface AccountState {
  signedIn: boolean;
  email?: string;
  plan: PlanFlag;
  status: EntStatus;
  renewsAt: number | null;
  error?: BackendError;
}

/** Recomputes the plan flag from what is stored (no network). Used on start, offline and after a failed refresh. */
export async function recompute(cfg: BackendConfig, deps: AuthDeps = {}): Promise<AccountState> {
  const now = (deps.now ?? Date.now)();
  const { session } = await currentSession(cfg, { ...deps, online: () => false });
  const cache = await loadCache();
  const rec = await deriveRecord(cfg, cache, session, now);
  await savePlanRecord(rec).catch(() => undefined);
  return { signedIn: !!session, ...(session ? { email: session.email } : {}), plan: rec.plan, status: cache?.status ?? "none", renewsAt: cache?.renewsAt ?? null };
}

/** Asks the server for a fresh signed token (Refresh purchase, after sign-in, after checkout, daily). Falls back to the cache. */
export async function refreshEntitlement(cfg: BackendConfig, deps: AuthDeps = {}): Promise<AccountState> {
  const now = (deps.now ?? Date.now)();
  const { session, error: authError } = await currentSession(cfg, deps);
  if (!session) {
    if (!authError) await wipeAccount();
    return { ...(await recompute(cfg, deps)), ...(authError ? { error: authError } : {}) };
  }
  const r = await backendCall(cfg, "/functions/v1/get-entitlement", { method: "POST", body: {}, bearer: session.access }, deps);
  if (!r.ok) return { ...(await recompute(cfg, deps)), error: r.error };
  const body = (typeof r.value === "object" && r.value !== null ? r.value : {}) as Record<string, unknown>;
  const cache = parseCache({ v: 1, token: body["token"], fetchedAt: now, status: body["status"], renewsAt: body["renewsAt"] });
  const rec = await deriveRecord(cfg, cache, session, now);
  // A token that does not verify is never stored (it would count as Free anyway); the old cache keeps its grace.
  if (!cache || (rec.plan === "free" && body["plan"] === "plus")) return { ...(await recompute(cfg, deps)), error: "invalid" };
  await storageSet(ENTITLEMENT_KEY, cache);
  await savePlanRecord(rec);
  return { signedIn: true, email: session.email, plan: rec.plan, status: cache.status, renewsAt: cache.renewsAt };
}

/** The daily check: refreshes when signed in and the cache is older than a day; otherwise only recomputes. */
export async function dailyCheck(cfg: BackendConfig, deps: AuthDeps = {}): Promise<AccountState> {
  const now = (deps.now ?? Date.now)();
  const cache = await loadCache();
  const { session } = await currentSession(cfg, { ...deps, online: () => false });
  if (session && (!cache || now - cache.fetchedAt >= DAILY_MS)) return refreshEntitlement(cfg, deps);
  return recompute(cfg, deps);
}

export interface PlanOffer {
  id: string;
  name: string;
  interval: "month" | "year";
  priceMinor: number;
  currency: string;
}

/** The active plans with their server price (never hardcoded). RLS returns only active plans to the public key. */
export async function loadOffers(cfg: BackendConfig, deps: AuthDeps = {}): Promise<BackendResult<PlanOffer[]>> {
  const r = await backendCall(cfg, "/rest/v1/plans?select=id,name,interval,price_minor,currency", { method: "GET" }, deps);
  if (!r.ok) return r;
  const out: PlanOffer[] = [];
  for (const p of Array.isArray(r.value) ? (r.value as Array<Record<string, unknown>>).slice(0, 10) : []) {
    const { id, name, interval, price_minor, currency } = p;
    if (typeof id !== "string" || !/^[a-z0-9-]{1,40}$/.test(id) || typeof name !== "string" || name.length > 60) continue;
    if ((interval !== "month" && interval !== "year") || typeof price_minor !== "number" || !Number.isInteger(price_minor) || price_minor < 0) continue;
    if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) continue;
    out.push({ id, name, interval, priceMinor: price_minor, currency });
  }
  return { ok: true, value: out };
}

/** A checkout link from the server (through its billing adapter). Only an https link is accepted. */
export async function startCheckout(cfg: BackendConfig, planId: string, deps: AuthDeps = {}): Promise<BackendResult<string>> {
  const { session, error } = await currentSession(cfg, deps);
  if (!session) return { ok: false, error: error ?? "auth" };
  const r = await backendCall(cfg, "/functions/v1/create-checkout", { method: "POST", body: { planId }, bearer: session.access }, deps);
  if (!r.ok) return r;
  const url = typeof r.value === "object" && r.value !== null ? (r.value as { url?: unknown }).url : undefined;
  if (typeof url !== "string" || url.length > 2048) return { ok: false, error: "server" };
  try {
    return new URL(url).protocol === "https:" ? { ok: true, value: url } : { ok: false, error: "server" };
  } catch {
    return { ok: false, error: "server" };
  }
}

/** Deletes the account on the server, then wipes the account data here. Local themes, sites and assets stay on this device. */
export async function deleteAccount(cfg: BackendConfig, deps: AuthDeps = {}): Promise<BackendResult<void>> {
  const { session, error } = await currentSession(cfg, deps);
  if (!session) return { ok: false, error: error ?? "auth" };
  const r = await backendCall(cfg, "/functions/v1/delete-account", { method: "POST", body: { confirm: "delete" }, bearer: session.access }, deps);
  if (!r.ok) return r;
  await wipeAccount();
  await storageRemove(ENTITLEMENT_KEY).catch(() => undefined);
  return { ok: true, value: undefined };
}
