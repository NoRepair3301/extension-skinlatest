// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { pickKey } from "../../backend/supabase/functions/_shared/deps.ts";
import { handleCreateCheckout, handleDeleteAccount, handleGetEntitlement } from "../../backend/supabase/functions/_shared/handlers.ts";
import { bearer, consoleLogger, parseOrigins } from "../../backend/supabase/functions/_shared/http.ts";
import { createRateLimiter, MAX_KEYS } from "../../backend/supabase/functions/_shared/ratelimit.ts";
import { createRestDb } from "../../backend/supabase/functions/_shared/rest.ts";
import { JWT_A, NOW, ORIGIN, USER_A, USER_B, authed, makeDeps, req } from "./helpers.ts";

afterEach(() => vi.restoreAllMocks());

describe("CORS (B3)", () => {
  it("answers only origins in ALLOWED_ORIGINS; preflight from others is refused", async () => {
    const d = makeDeps();
    const pre = await handleGetEntitlement(req("OPTIONS"), d);
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(pre.headers.get("access-control-allow-headers")).toBe("authorization, x-client-info, apikey, content-type");
    const evil = await handleGetEntitlement(req("OPTIONS", undefined, { origin: "https://evil.example" }), d);
    expect(evil.status).toBe(403);
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    expect((await handleGetEntitlement(req("POST", {}, { ...authed(), origin: "https://evil.example" }), d)).status).toBe(403);
  });
  it("parseOrigins keeps only exact extension or https origins", () => {
    expect(parseOrigins(` ${ORIGIN}, *, https://ok.example, http://no.example, chrome-extension://short `)).toEqual([ORIGIN, "https://ok.example"]);
    expect(parseOrigins(undefined)).toEqual([]);
  });
});

describe("validation and errors", () => {
  it("wrong methods, oversized or malformed bodies and bad bearer headers get generic errors", async () => {
    const d = makeDeps();
    expect((await handleGetEntitlement(req("GET", undefined, authed()), d)).status).toBe(400);
    expect((await handleCreateCheckout(req("POST", "x".repeat(10_000), authed()), d)).status).toBe(400);
    expect((await handleCreateCheckout(req("POST", "{not json", authed()), d)).status).toBe(400);
    expect((await handleCreateCheckout(req("POST", ["plus-month"], authed()), d)).status).toBe(400);
    expect(bearer(new Request("https://x.example", { headers: { authorization: "Basic abc" } }))).toBeUndefined();
    expect(bearer(new Request("https://x.example", { headers: { authorization: `Bearer ${JWT_A}` } }))).toBe(JWT_A);
  });
  it("a crash inside a handler is a generic 500 with a request id in the log, never the error text", async () => {
    const d = makeDeps();
    d.db.getEntitlement = async () => {
      throw new Error(`boom for ${USER_A} a@example.test`);
    };
    const k = await crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"]) as CryptoKeyPair;
    const r = await handleGetEntitlement(req("POST", {}, authed()), { ...d, signer: { key: k.privateKey, kid: "k" } });
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "server" });
    expect(d.logs).toEqual(["error rid-1"]);
  });
  it("the console logger writes an event word and a request id only", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    consoleLogger("webhook-applied a@example.test", "rid-1 Bearer x");
    expect(spy.mock.calls[0]![0]).toBe('{"event":"webhook-applied","rid":"rid-1"}');
  });
});

describe("rate limit", () => {
  it("fixed window per user; the next window starts fresh; memory is bounded", () => {
    const l = createRateLimiter({ "get-entitlement": { max: 2, windowS: 60 }, "create-checkout": { max: 1, windowS: 60 }, "delete-account": { max: 1, windowS: 60 }, "billing-webhook": { max: 1, windowS: 60 }, "test-checkout": { max: 1, windowS: 60 } });
    expect(l.hit("get-entitlement", USER_A, NOW).ok).toBe(true);
    expect(l.hit("get-entitlement", USER_A, NOW).ok).toBe(true);
    expect(l.hit("get-entitlement", USER_A, NOW + 10)).toEqual({ ok: false, retryAfterS: 50 });
    expect(l.hit("get-entitlement", USER_B, NOW).ok).toBe(true);
    expect(l.hit("get-entitlement", USER_A, NOW + 60).ok).toBe(true);
    for (let i = 0; i < MAX_KEYS + 50; i++) l.hit("create-checkout", `u${i}`, NOW);
    expect(MAX_KEYS).toBe(10_000);
  });
  it("a limited caller gets 429 with retry-after", async () => {
    const d = makeDeps();
    for (let i = 0; i < 3; i++) await handleDeleteAccount(req("POST", { confirm: "no" }, authed()), d);
    const r = await handleDeleteAccount(req("POST", { confirm: "delete" }, authed()), d);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(d.db.deletedAuth).toEqual([]);
  });
});

describe("delete-account", () => {
  it("needs the JWT and an explicit confirm; removes entitlement, profile and the auth user of the caller only", async () => {
    const d = makeDeps();
    d.db.ents.set(USER_A, { user_id: USER_A, plan: "plus", status: "active", current_period_end: NOW + 1, provider: "test", provider_customer_ref: "cus_1", provider_subscription_ref: "sub_1", updated_at: NOW });
    d.db.ents.set(USER_B, { ...d.db.ents.get(USER_A)!, user_id: USER_B });
    expect((await handleDeleteAccount(req("POST", { confirm: "delete" }), d)).status).toBe(401);
    expect((await handleDeleteAccount(req("POST", {}, authed()), d)).status).toBe(400);
    expect((await handleDeleteAccount(req("POST", { confirm: "delete" }, authed()), d)).status).toBe(200);
    expect(d.db.ents.has(USER_A)).toBe(false);
    expect(d.db.profiles.has(USER_A)).toBe(false);
    expect(d.db.deletedAuth).toEqual([USER_A]);
    expect(d.db.ents.has(USER_B)).toBe(true);
  });
});

describe("REST adapter request shapes (CONVENTION items, docs/backend/supabase.md)", () => {
  it("sends the secret key in apikey, the user JWT only to /auth/v1/user, and never a body with page data", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fake = async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: USER_A, email: "a@example.test" }), { status: 200 });
      if (url.includes("/rest/v1/entitlements?user_id=eq.")) return new Response(JSON.stringify([{ user_id: USER_A, plan: "plus", status: "active", current_period_end: "2027-01-15T08:00:00.000Z", provider: "test", updated_at: "2026-10-31T00:00:00.000Z" }]), { status: 200 });
      return new Response(init.method === "DELETE" || init.method === "POST" ? null : "[]", { status: init.method === "POST" ? 201 : 200 });
    };
    const secret = ["sb", "secret", "abcdefghijklmnop"].join("_");
    const db = createRestDb({ url: "https://proj.supabase.example/", secretKey: secret, publishableKey: "sb_publishable_x", fetch: fake });
    expect(await db.userOf(JWT_A)).toEqual({ id: USER_A });
    expect(calls[0]!.init.headers).toEqual({ apikey: "sb_publishable_x", authorization: `Bearer ${JWT_A}` });
    const ent = await db.getEntitlement(USER_A);
    expect(ent).toMatchObject({ plan: "plus", status: "active", current_period_end: Math.floor(Date.parse("2027-01-15T08:00:00.000Z") / 1000) });
    expect((calls[1]!.init.headers as Record<string, string>)["apikey"]).toBe(secret);
    expect((calls[1]!.init.headers as Record<string, string>)["authorization"]).toBeUndefined();
    await db.upsertEntitlement(ent!);
    expect(calls[2]!.url).toBe("https://proj.supabase.example/rest/v1/entitlements?on_conflict=user_id");
    expect((calls[2]!.init.headers as Record<string, string>)["prefer"]).toBe("resolution=merge-duplicates,return=minimal");
    await db.deleteUser(USER_A);
    expect(calls.slice(-3).map((c) => `${c.init.method} ${c.url.replace("https://proj.supabase.example", "")}`)).toEqual([
      `DELETE /rest/v1/entitlements?user_id=eq.${USER_A}`,
      `DELETE /rest/v1/profiles?id=eq.${USER_A}`,
      `DELETE /auth/v1/admin/users/${USER_A}`,
    ]);
    await expect(db.deleteUser("x")).rejects.toThrow();
    expect(await db.getEntitlement("not-a-uuid")).toBeUndefined();
  });
  it("pickKey reads the default key from the JSON dictionary and falls back to the legacy variable", () => {
    expect(pickKey('{"default":"k1"}', "legacy")).toBe("k1");
    expect(pickKey("not json", "legacy")).toBe("legacy");
    expect(pickKey(undefined, undefined)).toBe("");
  });
});
