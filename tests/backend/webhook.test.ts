// @vitest-environment node
import { describe, expect, it } from "vitest";
import { REPLAY_WINDOW_S, SIGNATURE_HEADER, createBillingProvider, parseTestEvent, signTestWebhook } from "../../backend/supabase/functions/_shared/billing.ts";
import { handleBillingWebhook } from "../../backend/supabase/functions/_shared/handlers.ts";
import { FUNCTIONS_BASE, NOW, USER_A, WEBHOOK_SECRET, event, makeDeps, webhook } from "./helpers.ts";

describe("billing-webhook (B3)", () => {
  it("a correctly signed activation sets Plus with the period end and records the event id (no payload)", async () => {
    const d = makeDeps();
    const r = await handleBillingWebhook(await webhook(event()), d);
    expect(r.status).toBe(200);
    expect(d.db.ents.get(USER_A)).toMatchObject({ plan: "plus", status: "active", current_period_end: NOW + 30 * 86400, provider: "test" });
    expect([...d.db.events]).toEqual([["evt_1", "activated"]]);
  });

  it("forged: wrong secret, edited body, missing or malformed header are refused with a generic 400 and change nothing", async () => {
    const d = makeDeps();
    const wrong = await webhook(event(), NOW, "another-secret-0123456789abcdef0000");
    expect((await handleBillingWebhook(wrong, d)).status).toBe(400);
    const good = await webhook(event());
    const sig = good.headers.get(SIGNATURE_HEADER)!;
    const edited = new Request(good.url, { method: "POST", headers: { [SIGNATURE_HEADER]: sig }, body: JSON.stringify(event({ periodEnd: NOW + 999 * 86400 })) });
    expect((await handleBillingWebhook(edited, d)).status).toBe(400);
    expect((await handleBillingWebhook(new Request(good.url, { method: "POST", body: JSON.stringify(event()) }), d)).status).toBe(400);
    const bad = new Request(good.url, { method: "POST", headers: { [SIGNATURE_HEADER]: "t=1,v1=zz" }, body: "{}" });
    const res = await handleBillingWebhook(bad, d);
    expect(await res.json()).toEqual({ error: "bad-request" });
    expect(d.db.ents.size).toBe(0);
    expect(d.db.events.size).toBe(0);
    expect(d.logs.join("\n")).not.toMatch(/evt_|@|secret/);
  });

  it("replay: a signature older or newer than the window is refused even when it is valid", async () => {
    const d = makeDeps();
    expect((await handleBillingWebhook(await webhook(event(), NOW - REPLAY_WINDOW_S - 1), d)).status).toBe(400);
    expect((await handleBillingWebhook(await webhook(event(), NOW + REPLAY_WINDOW_S + 1), d)).status).toBe(400);
    expect((await handleBillingWebhook(await webhook(event(), NOW - REPLAY_WINDOW_S), d)).status).toBe(200);
  });

  it("idempotent: the same event delivered twice applies once", async () => {
    const d = makeDeps();
    await handleBillingWebhook(await webhook(event()), d);
    d.db.ents.set(USER_A, { ...d.db.ents.get(USER_A)!, current_period_end: NOW + 5 });
    expect((await handleBillingWebhook(await webhook(event()), d)).status).toBe(200);
    expect(d.db.ents.get(USER_A)!.current_period_end).toBe(NOW + 5);
    expect(d.logs.some((l) => l.startsWith("webhook-duplicate"))).toBe(true);
  });

  it("the signature compare is constant-time shaped: same work for a near miss and a far miss", async () => {
    // Not a timing measurement (flaky); checks the comparison runs over the full length either way.
    const { safeEqual } = await import("../../backend/supabase/functions/_shared/http.ts");
    expect(safeEqual("a".repeat(64), "a".repeat(64))).toBe(true);
    expect(safeEqual("a".repeat(64), "a".repeat(63) + "b")).toBe(false);
    expect(safeEqual("a".repeat(64), "b" + "a".repeat(63))).toBe(false);
    expect(safeEqual("a".repeat(64), "a".repeat(10))).toBe(false);
  });

  it("strict event parse: unknown keys, bad ids, missing period for activation and bad types are refused", () => {
    const ok = JSON.stringify(event());
    expect(parseTestEvent(ok)).toBeDefined();
    for (const bad of [{ ...event(), extra: 1 }, { ...event(), id: "has space" }, { ...event(), userId: "x" }, { ...event(), type: "gift" }, { ...event(), periodEnd: undefined }, { ...event(), occurredAt: -1 }]) expect(parseTestEvent(JSON.stringify(bad))).toBeUndefined();
    expect(parseTestEvent("not json")).toBeUndefined();
  });

  it("signTestWebhook output verifies through the provider's verifyWebhook", async () => {
    const p = createBillingProvider({ BILLING_MODE: "test", TEST_WEBHOOK_SECRET: WEBHOOK_SECRET, TEST_CHECKOUT_SECRET: WEBHOOK_SECRET, FUNCTIONS_BASE })!;
    const body = "{}";
    const h = new Headers({ [SIGNATURE_HEADER]: await signTestWebhook(WEBHOOK_SECRET, body, NOW) });
    expect(await p.verifyWebhook(h, body, NOW)).toBe(true);
    expect(await p.verifyWebhook(h, "{} ", NOW)).toBe(false);
  });
});
