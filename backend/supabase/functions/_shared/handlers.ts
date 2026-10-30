import type { BillingProvider } from "./billing.ts";
import { readTestSession } from "./billing.ts";
import { bearer, corsHeaders, fail, json, readJson, readText, type Logger } from "./http.ts";
import type { LimitName, RateLimiter } from "./ratelimit.ts";
import type { Db } from "./rest.ts";
import { nextEntitlement, planOf } from "./state.ts";
import { signEntitlement } from "./token.ts";

/**
 * The five functions as pure request handlers (no Deno API): each `index.ts` only builds `Deps` from the environment and calls one.
 * Every error is a fixed kind; every log line is an event word and a request id.
 */
export interface Deps {
  db: Db;
  allowedOrigins: readonly string[];
  limiter: RateLimiter;
  log: Logger;
  requestId: string;
  nowS: () => number;
  /** Ed25519 signing key and its key id, or undefined when the secret is missing (get-entitlement then answers unavailable). */
  signer?: { key: CryptoKey; kid: string } | undefined;
  /** The billing provider, or undefined when billing is not configured (or not in test mode for the test provider). */
  billing?: BillingProvider | undefined;
  /** TEST_CHECKOUT_SECRET, for test-checkout only. */
  testSessionSecret?: string | undefined;
}

type Handler = (req: Request, d: Deps) => Promise<Response>;

/** Shared front door: CORS preflight, method, origin and a crash guard. */
function guarded(methods: readonly string[], inner: (req: Request, d: Deps, cors: Record<string, string>) => Promise<Response>, browser = true): Handler {
  return async (req, d) => {
    const cors = browser ? corsHeaders(req, d.allowedOrigins) : {};
    try {
      if (req.method === "OPTIONS") return browser && cors["access-control-allow-origin"] ? new Response(null, { status: 204, headers: cors }) : fail("forbidden", cors);
      if (!methods.includes(req.method)) return fail("bad-request", cors);
      if (browser && !cors["access-control-allow-origin"]) {
        d.log("origin-refused", d.requestId);
        return fail("forbidden", cors);
      }
      return await inner(req, d, cors);
    } catch {
      d.log("error", d.requestId);
      return fail("server", cors);
    }
  };
}

async function caller(req: Request, d: Deps): Promise<{ id: string } | undefined> {
  const jwt = bearer(req);
  return jwt ? d.db.userOf(jwt) : undefined;
}

function limited(d: Deps, name: LimitName, key: string, cors: Record<string, string>): Response | undefined {
  const r = d.limiter.hit(name, key, d.nowS());
  if (r.ok) return undefined;
  d.log("rate-limited", d.requestId);
  return fail("rate-limited", cors, r.retryAfterS);
}

/** get-entitlement: verifies the user JWT, returns a signed token (plan, sub, iat, exp, kid) plus the status for the UI. */
export const handleGetEntitlement: Handler = guarded(["POST"], async (req, d, cors) => {
  const user = await caller(req, d);
  if (!user) return fail("unauthorized", cors);
  const stop = limited(d, "get-entitlement", user.id, cors);
  if (stop) return stop;
  if (!d.signer) return fail("unavailable", cors);
  const now = d.nowS();
  const row = await d.db.getEntitlement(user.id);
  const plan = planOf(row, now);
  const token = await signEntitlement({ plan, sub: user.id }, d.signer.key, d.signer.kid, now);
  d.log("entitlement", d.requestId);
  return json({ token, plan, status: row?.status ?? "none", renewsAt: plan === "plus" ? row?.current_period_end ?? null : null }, 200, cors);
});

/** create-checkout: body `{ planId }`; the plan must be active in the plans table; returns the provider's checkout URL. */
export const handleCreateCheckout: Handler = guarded(["POST"], async (req, d, cors) => {
  const user = await caller(req, d);
  if (!user) return fail("unauthorized", cors);
  const stop = limited(d, "create-checkout", user.id, cors);
  if (stop) return stop;
  const body = await readJson(req, 512);
  if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length !== 1) return fail("bad-request", cors);
  const planId = (body as { planId?: unknown }).planId;
  if (typeof planId !== "string" || !/^[a-z0-9-]{1,40}$/.test(planId)) return fail("bad-request", cors);
  if (!d.billing) return fail("unavailable", cors);
  const plan = await d.db.activePlan(planId);
  if (!plan) return fail("not-found", cors);
  const { url } = await d.billing.createCheckout({ userId: user.id, plan: { id: plan.id, providerRef: plan.provider_ref }, nowS: d.nowS() });
  d.log("checkout", d.requestId);
  return json({ url }, 200, cors);
});

/**
 * Applies one verified event: skipped when already processed (idempotent), stale events change nothing, then the event id is recorded.
 * Two concurrent deliveries of the same event compute the same row, so the worst case is the same write twice.
 */
async function applyEvent(d: Deps, provider: string, ev: NonNullable<ReturnType<BillingProvider["parseEvent"]>>): Promise<"applied" | "duplicate" | "stale"> {
  if (await d.db.hasEvent(ev.id)) return "duplicate";
  const next = nextEntitlement(await d.db.getEntitlement(ev.userId), ev, provider);
  if (next) await d.db.upsertEntitlement(next);
  await d.db.recordEvent(ev.id, ev.type);
  return next ? "applied" : "stale";
}

/** billing-webhook: provider to server (no CORS, no user JWT). Signature with a replay window, then strict parse, then idempotent apply. */
export const handleBillingWebhook: Handler = guarded(
  ["POST"],
  async (req, d, cors) => {
    if (!d.billing) return fail("unavailable", cors);
    const stop = limited(d, "billing-webhook", "provider", cors);
    if (stop) return stop;
    const raw = await readText(req, 8192);
    if (raw === undefined) return fail("bad-request", cors);
    if (!(await d.billing.verifyWebhook(req.headers, raw, d.nowS()))) {
      d.log("webhook-refused", d.requestId);
      return fail("bad-request", cors);
    }
    const ev = d.billing.parseEvent(raw);
    if (!ev) return fail("bad-request", cors);
    const result = await applyEvent(d, d.billing.id, ev);
    d.log(`webhook-${result}`, d.requestId);
    return json({ ok: true }, 200, cors);
  },
  false,
);

/** delete-account: verifies the JWT, removes the user's rows and the auth user. */
export const handleDeleteAccount: Handler = guarded(["POST"], async (req, d, cors) => {
  const user = await caller(req, d);
  if (!user) return fail("unauthorized", cors);
  const stop = limited(d, "delete-account", user.id, cors);
  if (stop) return stop;
  const body = await readJson(req, 256);
  if (typeof body !== "object" || body === null || (body as { confirm?: unknown }).confirm !== "delete") return fail("bad-request", cors);
  await d.db.deleteUser(user.id);
  d.log("account-deleted", d.requestId);
  return json({ ok: true }, 200, cors);
});

/**
 * test-checkout (TEST MODE ONLY): opening the link completes a test purchase for the signed session (single use through its nonce).
 * Answers 404 unless the billing provider is the test one, which exists only when BILLING_MODE=test.
 */
export const handleTestCheckout: Handler = guarded(
  ["GET"],
  async (req, d) => {
    const text = (status: number, body: string) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    if (!d.billing || d.billing.id !== "test" || !d.testSessionSecret) return text(404, "Not found.");
    const stop = limited(d, "test-checkout", "anon", {});
    if (stop) return stop;
    const s = new URL(req.url).searchParams.get("s") ?? "";
    const now = d.nowS();
    const session = await readTestSession(d.testSessionSecret, s, now);
    if (!session) return text(400, "This test checkout link is not valid or has expired.");
    if (!(await d.db.activePlan(session.planId))) return text(404, "Not found.");
    const result = await applyEvent(d, "test", { id: `test-${session.nonce}`, type: "activated", userId: session.userId, planId: session.planId, occurredAt: now, periodEnd: now + 30 * 24 * 3600 });
    d.log(`test-checkout-${result}`, d.requestId);
    return text(200, "TEST MODE: no money was taken. Plus is active for 30 days. Go back to Skinly and choose Refresh purchase.");
  },
  false,
);
