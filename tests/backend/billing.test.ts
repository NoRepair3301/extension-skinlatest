// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createBillingProvider, makeTestSession } from "../../backend/supabase/functions/_shared/billing.ts";
import { handleCreateCheckout, handleTestCheckout } from "../../backend/supabase/functions/_shared/handlers.ts";
import { nextEntitlement, planOf, type EntitlementRow } from "../../backend/supabase/functions/_shared/state.ts";
import { FUNCTIONS_BASE, NOW, PLAN, SESSION_SECRET, USER_A, WEBHOOK_SECRET, authed, event, makeDeps, req } from "./helpers.ts";

const row = (over: Partial<EntitlementRow> = {}): EntitlementRow => ({ user_id: USER_A, plan: "plus", status: "active", current_period_end: NOW + 1000, provider: "test", provider_customer_ref: null, provider_subscription_ref: null, updated_at: NOW - 10, ...over });

describe("state transitions (B3)", () => {
  it("activated, renewed, cancelled, expired, refunded", () => {
    expect(nextEntitlement(undefined, event({ customerRef: "cus_1" }), "test")).toMatchObject({ plan: "plus", status: "active", current_period_end: NOW + 30 * 86400, provider_customer_ref: "cus_1" });
    expect(nextEntitlement(row(), event({ type: "renewed", periodEnd: NOW + 5000 }), "test")).toMatchObject({ plan: "plus", status: "active", current_period_end: NOW + 5000 });
    expect(nextEntitlement(row(), event({ type: "cancelled" }), "test")).toMatchObject({ plan: "plus", status: "cancelled", current_period_end: NOW + 1000 });
    expect(nextEntitlement(row(), event({ type: "expired" }), "test")).toMatchObject({ plan: "free", status: "expired" });
    expect(nextEntitlement(row(), event({ type: "refunded" }), "test")).toMatchObject({ plan: "free", status: "refunded", current_period_end: NOW });
  });

  it("a renewal never shortens the period; a stale event changes nothing (no resurrected refund)", () => {
    expect(nextEntitlement(row({ current_period_end: NOW + 9000 }), event({ type: "renewed", periodEnd: NOW + 100 }), "test")!.current_period_end).toBe(NOW + 9000);
    const refunded = row({ plan: "free", status: "refunded", updated_at: NOW + 50 });
    expect(nextEntitlement(refunded, event({ type: "activated", occurredAt: NOW }), "test")).toBeUndefined();
  });

  it("planOf: Plus only while active or cancelled and inside the paid period", () => {
    expect(planOf(undefined, NOW)).toBe("free");
    expect(planOf(row(), NOW)).toBe("plus");
    expect(planOf(row({ status: "cancelled" }), NOW)).toBe("plus");
    expect(planOf(row({ current_period_end: NOW }), NOW)).toBe("free");
    expect(planOf(row({ status: "expired" }), NOW)).toBe("free");
    expect(planOf(row({ current_period_end: null }), NOW)).toBe("free");
  });
});

describe("billing adapter: the test provider only in test mode", () => {
  it("createBillingProvider refuses anything but BILLING_MODE=test with long secrets and an https functions base", () => {
    const env = { TEST_WEBHOOK_SECRET: WEBHOOK_SECRET, TEST_CHECKOUT_SECRET: SESSION_SECRET, FUNCTIONS_BASE };
    expect(createBillingProvider({ ...env, BILLING_MODE: "test" })?.id).toBe("test");
    for (const mode of [undefined, "", "live", "TEST", "production"]) expect(createBillingProvider({ ...env, BILLING_MODE: mode })).toBeUndefined();
    expect(createBillingProvider({ ...env, BILLING_MODE: "test", TEST_WEBHOOK_SECRET: "short" })).toBeUndefined();
    expect(createBillingProvider({ ...env, BILLING_MODE: "test", FUNCTIONS_BASE: "http://x/functions/v1" })).toBeUndefined();
  });

  it("create-checkout: the plan comes from the plans table; unknown or inactive plans are 404; no billing is 503", async () => {
    const d = makeDeps();
    const r = await handleCreateCheckout(req("POST", { planId: PLAN.id }, authed()), d);
    expect(r.status).toBe(200);
    const { url } = (await r.json()) as { url: string };
    expect(url.startsWith(`${FUNCTIONS_BASE}/test-checkout?s=`)).toBe(true);
    expect(url).not.toContain(USER_A);
    expect((await handleCreateCheckout(req("POST", { planId: "gold" }, authed()), d)).status).toBe(404);
    expect((await handleCreateCheckout(req("POST", { planId: PLAN.id, price: 0 }, authed()), d)).status).toBe(400);
    expect((await handleCreateCheckout(req("POST", { planId: PLAN.id }, authed()), makeDeps({ billing: undefined }))).status).toBe(503);
    expect((await handleCreateCheckout(req("POST", { planId: PLAN.id }), d)).status).toBe(401);
  });

  it("test-checkout: completes once for a valid session, refuses tampered or expired sessions, and is 404 outside test mode", async () => {
    const d = makeDeps();
    const s = await makeTestSession(SESSION_SECRET, { userId: USER_A, planId: PLAN.id, nonce: "11111111-2222-4333-8444-555555555555", exp: NOW + 600 });
    const open = (token: string, deps = d) => handleTestCheckout(new Request(`${FUNCTIONS_BASE}/test-checkout?s=${encodeURIComponent(token)}`), deps);
    const r = await open(s);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("TEST MODE: no money was taken");
    expect(d.db.ents.get(USER_A)).toMatchObject({ plan: "plus", status: "active" });
    // single use: a second open is a duplicate and changes nothing
    d.db.ents.set(USER_A, { ...d.db.ents.get(USER_A)!, current_period_end: NOW + 1 });
    await open(s);
    expect(d.db.ents.get(USER_A)!.current_period_end).toBe(NOW + 1);
    expect((await open(s.replace(/.$/, (c) => (c === "0" ? "1" : "0")))).status).toBe(400);
    const old = await makeTestSession(SESSION_SECRET, { userId: USER_A, planId: PLAN.id, nonce: "11111111-2222-4333-8444-555555555556", exp: NOW - 1 });
    expect((await open(old)).status).toBe(400);
    expect((await open(s, makeDeps({ billing: undefined }))).status).toBe(404);
  });
});
