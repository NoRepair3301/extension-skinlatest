import { buf, fromB64Url, fromUtf8, hex, toB64Url, utf8 } from "./b64.ts";
import { safeEqual } from "./http.ts";

/**
 * Billing adapter (docs/PLUS_SPEC.md 4). The only implementation shipped is the TEST provider, refused unless BILLING_MODE=test.
 * A real provider implements the same three methods; nothing else in the backend knows which provider is used.
 */
export const EVENT_TYPES = ["activated", "renewed", "cancelled", "expired", "refunded"] as const;
export type BillingEventType = (typeof EVENT_TYPES)[number];

export interface BillingEvent {
  /** The provider's unique event id (idempotency key, billing_events.provider_event_id). */
  id: string;
  type: BillingEventType;
  userId: string;
  planId: string;
  /** When the provider says the event happened (seconds). Older than the stored row's update means stale. */
  occurredAt: number;
  /** End of the paid period (seconds), for activated and renewed. */
  periodEnd?: number;
  customerRef?: string;
  subscriptionRef?: string;
}

export interface CheckoutRequest {
  userId: string;
  plan: { id: string; providerRef: string };
  nowS: number;
}

export interface BillingProvider {
  readonly id: string;
  createCheckout(req: CheckoutRequest): Promise<{ url: string }>;
  /** Signature and replay window over the raw body. Constant time. */
  verifyWebhook(headers: Headers, rawBody: string, nowS: number): Promise<boolean>;
  /** Strict parse of a verified body; undefined for anything unexpected. */
  parseEvent(rawBody: string): BillingEvent | undefined;
}

/** Webhooks older or newer than this (seconds) are refused (replay window). */
export const REPLAY_WINDOW_S = 300;
export const SIGNATURE_HEADER = "skinly-test-signature";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REF = /^[A-Za-z0-9_-]{1,120}$/;

async function hmacHex(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", buf(utf8(secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, buf(utf8(text)))));
}

/** `t=<seconds>,v1=<hex hmac of "t.body">`: the test provider's signature header (shape borrowed from common providers). */
export async function signTestWebhook(secret: string, rawBody: string, nowS: number): Promise<string> {
  return `t=${nowS},v1=${await hmacHex(secret, `${nowS}.${rawBody}`)}`;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const int = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0 && v < 4_102_444_800;

export function parseTestEvent(rawBody: string): BillingEvent | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(rawBody);
  } catch {
    return undefined;
  }
  if (!isObj(raw)) return undefined;
  const allowed = new Set(["id", "type", "userId", "planId", "occurredAt", "periodEnd", "customerRef", "subscriptionRef"]);
  if (Object.keys(raw).some((k) => !allowed.has(k))) return undefined;
  const { id, type, userId, planId, occurredAt, periodEnd, customerRef, subscriptionRef } = raw;
  if (typeof id !== "string" || !REF.test(id)) return undefined;
  if (typeof type !== "string" || !(EVENT_TYPES as readonly string[]).includes(type)) return undefined;
  if (typeof userId !== "string" || !UUID.test(userId)) return undefined;
  if (typeof planId !== "string" || !/^[a-z0-9-]{1,40}$/.test(planId)) return undefined;
  if (!int(occurredAt)) return undefined;
  if (periodEnd !== undefined && !int(periodEnd)) return undefined;
  if ((type === "activated" || type === "renewed") && periodEnd === undefined) return undefined;
  if (customerRef !== undefined && (typeof customerRef !== "string" || !REF.test(customerRef))) return undefined;
  if (subscriptionRef !== undefined && (typeof subscriptionRef !== "string" || !REF.test(subscriptionRef))) return undefined;
  return {
    id,
    type: type as BillingEventType,
    userId,
    planId,
    occurredAt,
    ...(periodEnd !== undefined ? { periodEnd: periodEnd as number } : {}),
    ...(customerRef !== undefined ? { customerRef: customerRef as string } : {}),
    ...(subscriptionRef !== undefined ? { subscriptionRef: subscriptionRef as string } : {}),
  };
}

/** A signed, short-lived checkout session for the test checkout function (no database row needed). */
export const SESSION_TTL_S = 15 * 60;

export async function makeTestSession(secret: string, s: { userId: string; planId: string; nonce: string; exp: number }): Promise<string> {
  const body = toB64Url(utf8(JSON.stringify(s)));
  return `${body}.${await hmacHex(secret, body)}`;
}

export async function readTestSession(secret: string, token: string, nowS: number): Promise<{ userId: string; planId: string; nonce: string; exp: number } | undefined> {
  const m = /^([A-Za-z0-9_-]{10,600})\.([0-9a-f]{64})$/.exec(token);
  if (!m) return undefined;
  if (!safeEqual(await hmacHex(secret, m[1]!), m[2]!)) return undefined;
  try {
    const raw: unknown = JSON.parse(fromUtf8(fromB64Url(m[1]!) ?? new Uint8Array()));
    if (!isObj(raw)) return undefined;
    const { userId, planId, nonce, exp } = raw;
    if (typeof userId !== "string" || !UUID.test(userId) || typeof planId !== "string" || !/^[a-z0-9-]{1,40}$/.test(planId)) return undefined;
    if (typeof nonce !== "string" || !/^[a-f0-9-]{36}$/.test(nonce) || !int(exp) || exp <= nowS) return undefined;
    return { userId, planId, nonce, exp };
  } catch {
    return undefined;
  }
}

/**
 * TEST PROVIDER. Never takes money. Checkout is a link to the test-checkout function carrying a signed session; webhooks are signed
 * with TEST_WEBHOOK_SECRET. `createBillingProvider` refuses it unless BILLING_MODE=test.
 */
export function createTestProvider(cfg: { webhookSecret: string; sessionSecret: string; functionsBase: string }): BillingProvider {
  return {
    id: "test",
    async createCheckout(req) {
      const session = await makeTestSession(cfg.sessionSecret, { userId: req.userId, planId: req.plan.id, nonce: crypto.randomUUID(), exp: req.nowS + SESSION_TTL_S });
      return { url: `${cfg.functionsBase}/test-checkout?s=${encodeURIComponent(session)}` };
    },
    async verifyWebhook(headers, rawBody, nowS) {
      const m = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec(headers.get(SIGNATURE_HEADER) ?? "");
      if (!m) return false;
      const t = Number(m[1]);
      const expected = await hmacHex(cfg.webhookSecret, `${t}.${rawBody}`);
      const fresh = Math.abs(nowS - t) <= REPLAY_WINDOW_S;
      // compare first, then check freshness, so timing never depends on which check failed
      return safeEqual(expected, m[2]!) && fresh;
    },
    parseEvent: parseTestEvent,
  };
}

export interface BillingEnv {
  BILLING_MODE?: string | undefined;
  TEST_WEBHOOK_SECRET?: string | undefined;
  TEST_CHECKOUT_SECRET?: string | undefined;
  FUNCTIONS_BASE?: string | undefined;
}

/** The configured provider, or undefined (billing unavailable). Only `test` exists, and only when BILLING_MODE=test. */
export function createBillingProvider(env: BillingEnv): BillingProvider | undefined {
  if (env.BILLING_MODE !== "test") return undefined;
  const w = env.TEST_WEBHOOK_SECRET ?? "";
  const s = env.TEST_CHECKOUT_SECRET ?? "";
  const base = env.FUNCTIONS_BASE ?? "";
  if (w.length < 24 || s.length < 24 || !/^https:\/\/[a-z0-9.-]+(?::\d+)?\/functions\/v1$/.test(base)) return undefined;
  return createTestProvider({ webhookSecret: w, sessionSecret: s, functionsBase: base });
}
