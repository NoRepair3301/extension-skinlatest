// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../../src/extension/api.ts", () => ({
  storageGet: async (k: string) => store.get(k),
  storageSet: async (k: string, v: unknown) => void store.set(k, JSON.parse(JSON.stringify(v))),
  storageRemove: async (k: string) => void store.delete(k),
}));

import { currentSession, isEmail, sendCode, signOut, verifyCode, type Session } from "../../src/backend/auth.ts";
import { parseConfig, type BackendConfig } from "../../src/backend/config.ts";
import { DAILY_MS, GRACE_MS, dailyCheck, deleteAccount, deriveRecord, loadOffers, recompute, refreshEntitlement, startCheckout } from "../../src/backend/entitlement.ts";
import { backendCall } from "../../src/backend/http.ts";
import { loadPlan, planNow } from "../../src/extension/planFlag.ts";
import { signEntitlement, TOKEN_TTL_S } from "../../backend/supabase/functions/_shared/token.ts";
import { keypair, USER_A, USER_B } from "../backend/helpers.ts";

const NOW_MS = 1_800_000_000_000;
const NOW_S = NOW_MS / 1000;
const ACCESS = "access-token-0123456789";
const REFRESH = "refresh-token-0123456789";

let k: Awaited<ReturnType<typeof keypair>>;
let cfg: BackendConfig;

interface Call {
  url: string;
  init: RequestInit;
}
/** A scripted server: answers by path; records every call (URL and headers) so tests can check what left the browser. */
function server(routes: Record<string, (body: unknown, init: RequestInit) => Response | Promise<Response>>) {
  const calls: Call[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const path = url.replace(cfg.url, "");
    const route = Object.keys(routes).find((r) => path.startsWith(r));
    if (!route) return new Response("{}", { status: 404 });
    return routes[route]!(init.body ? JSON.parse(String(init.body)) : undefined, init);
  };
  return { calls, deps: { fetch, online: () => true, now: () => NOW_MS } };
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
const session = (over: Partial<Session> = {}): Session => ({ v: 1, access: ACCESS, refresh: REFRESH, expiresAt: NOW_MS + 3600_000, userId: USER_A, email: "a@example.test", ...over });
const tokenFor = (plan: "free" | "plus", sub = USER_A, iatS = NOW_S, key = k) => signEntitlement({ plan, sub }, key.priv, key.kid, iatS);

beforeEach(async () => {
  store.clear();
  k ??= await keypair();
  cfg = parseConfig({ VITE_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", VITE_SUPABASE_ANON_KEY: "sb_publishable_abcdefghijklmnop", VITE_ENTITLEMENT_PUBKEY: k.spkiB64 })!;
});

describe("build config (B4)", () => {
  it("missing or malformed values mean Plus is not available in this build", () => {
    expect(cfg).toBeDefined();
    expect(parseConfig({})).toBeUndefined();
    expect(parseConfig({ VITE_SUPABASE_URL: "https://evil.example", VITE_SUPABASE_ANON_KEY: "sb_publishable_abcdefghijklmnop", VITE_ENTITLEMENT_PUBKEY: k.spkiB64 })).toBeUndefined();
    expect(parseConfig({ VITE_SUPABASE_URL: "http://abc.supabase.co", VITE_SUPABASE_ANON_KEY: "sb_publishable_abcdefghijklmnop", VITE_ENTITLEMENT_PUBKEY: k.spkiB64 })).toBeUndefined();
    expect(parseConfig({ VITE_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", VITE_SUPABASE_ANON_KEY: "short", VITE_ENTITLEMENT_PUBKEY: k.spkiB64 })).toBeUndefined();
  });
});

describe("sign-in by email code", () => {
  it("sends the code, verifies it, stores the session in `auth` only; the email goes to Auth only", async () => {
    const s = server({
      "/auth/v1/otp": () => json({}),
      "/auth/v1/verify": (b) => ((b as { token: string }).token === "123456" ? json({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600, user: { id: USER_A, email: "a@example.test" } }) : json({ error: "x" }, 400)),
    });
    expect(await sendCode(cfg, " A@Example.test ", s.deps)).toEqual({ ok: true, value: undefined });
    expect(JSON.parse(String(s.calls[0]!.init.body))).toEqual({ email: "a@example.test", create_user: true });
    expect(s.calls[0]!.init.headers).toEqual({ apikey: "sb_publishable_abcdefghijklmnop", "content-type": "application/json" });
    expect((await verifyCode(cfg, "a@example.test", "000000", s.deps)).ok).toBe(false);
    const ok = await verifyCode(cfg, "a@example.test", "123 456", s.deps);
    expect(ok.ok).toBe(true);
    expect(store.get("auth")).toMatchObject({ v: 1, access: ACCESS, refresh: REFRESH, userId: USER_A, expiresAt: NOW_MS + 3600_000 });
    // tokens are never in a URL
    for (const c of s.calls) expect(c.url).not.toMatch(/token-0123/);
  });
  it("refuses bad input without a request; offline fails at once", async () => {
    const s = server({});
    expect(await sendCode(cfg, "not-an-email", s.deps)).toEqual({ ok: false, error: "invalid" });
    expect(await verifyCode(cfg, "a@example.test", "12ab", s.deps)).toEqual({ ok: false, error: "invalid" });
    expect(s.calls).toHaveLength(0);
    expect(await sendCode(cfg, "a@example.test", { ...s.deps, online: () => false })).toEqual({ ok: false, error: "offline" });
    expect(isEmail("x@y.zz")).toBe(true);
  });
  it("refreshes a session that expires within a minute, once, even when asked twice at the same time", async () => {
    store.set("auth", session({ expiresAt: NOW_MS + 30_000 }));
    let n = 0;
    const s = server({ "/auth/v1/token": () => (n++, json({ access_token: "access-token-new-012345", refresh_token: "refresh-token-new-0123", expires_in: 3600, user: { id: USER_A } })) });
    const [a, b] = await Promise.all([currentSession(cfg, s.deps), currentSession(cfg, s.deps)]);
    expect(n).toBe(1);
    expect(a.session?.access).toBe("access-token-new-012345");
    expect(b.session?.access).toBe("access-token-new-012345");
    expect(s.calls[0]!.url).toBe(`${cfg.url}/auth/v1/token?grant_type=refresh_token`);
  });
  it("a refused refresh signs out locally; a network failure keeps the session", async () => {
    store.set("auth", session({ expiresAt: NOW_MS }));
    const down = server({});
    const fail = { ...down.deps, fetch: async () => Promise.reject(new Error("net")) };
    expect((await currentSession(cfg, fail)).error).toBe("network");
    expect(store.get("auth")).toBeDefined();
    const refused = server({ "/auth/v1/token": () => json({}, 401) });
    expect((await currentSession(cfg, refused.deps)).error).toBe("auth");
    expect(store.get("auth")).toBeUndefined();
    expect(planNow(store.get("plan"))).toBe("free");
  });
  it("sign-out tells Auth and wipes auth, entitlement and the plan flag; local sites and assets stay", async () => {
    store.set("auth", session());
    store.set("entitlement", { v: 1, token: "x", fetchedAt: 1, status: "active", renewsAt: null });
    store.set("plan", { v: 1, plan: "plus", until: NOW_MS + 1000 });
    store.set("sites", { a: 1 });
    store.set("assets", [1]);
    const s = server({ "/auth/v1/logout": () => new Response(null, { status: 204 }) });
    await signOut(cfg, s.deps);
    expect((s.calls[0]!.init.headers as Record<string, string>)["authorization"]).toBe(`Bearer ${ACCESS}`);
    expect([...store.keys()].sort()).toEqual(["assets", "plan", "sites"]);
    expect(planNow(store.get("plan"))).toBe("free");
  });
});

describe("entitlement token in the extension", () => {
  it("a valid Plus token gives Plus until expiry plus the 7-day offline grace", async () => {
    const t = await tokenFor("plus");
    const cache = { v: 1 as const, token: t, fetchedAt: NOW_MS, status: "active" as const, renewsAt: null };
    expect((await deriveRecord(cfg, cache, { userId: USER_A }, NOW_MS)).plan).toBe("plus");
    const until = (NOW_S + TOKEN_TTL_S) * 1000 + GRACE_MS;
    expect(await deriveRecord(cfg, cache, { userId: USER_A }, NOW_MS)).toEqual({ v: 1, plan: "plus", until });
    expect((await deriveRecord(cfg, cache, { userId: USER_A }, until - 1)).plan).toBe("plus");
    expect((await deriveRecord(cfg, cache, { userId: USER_A }, until)).plan).toBe("free");
  });
  it("tampered, wrong-key, another user's, signed-out and future-dated tokens all count as Free", async () => {
    const t = await tokenFor("plus");
    const [h, p, sig] = t.split(".") as [string, string, string];
    const free = async (token: string, userId: string | null = USER_A, now = NOW_MS) =>
      (await deriveRecord(cfg, { v: 1, token, fetchedAt: NOW_MS, status: "active", renewsAt: null }, userId ? { userId } : undefined, now)).plan;
    // Change a leading character, which is all signature data. The old "replace the last two with AA" was a no-op about 1 time in 16:
    // an Ed25519 signature ends in A/B/C/D then A/Q/g/w (its last byte is small), so it already ended in "AA", the token stayed valid and counted as Plus.
    expect(await free(`${h}.${p}.${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`)).toBe("free");
    expect(await free(await tokenFor("plus", USER_A, NOW_S, await keypair()))).toBe("free");
    expect(await free(t, USER_B)).toBe("free");
    expect(await free(t, null)).toBe("free");
    expect(await free(await tokenFor("plus", USER_A, NOW_S + 3600))).toBe("free");
    expect(await free(await tokenFor("free"))).toBe("free");
  });
  it("refresh: asks get-entitlement with the session, verifies, caches, and writes only the derived flag for page scripts", async () => {
    store.set("auth", session());
    const token = await tokenFor("plus");
    const s = server({ "/functions/v1/get-entitlement": () => json({ token, plan: "plus", status: "active", renewsAt: NOW_S + 86400 }) });
    const st = await refreshEntitlement(cfg, s.deps);
    expect(st).toMatchObject({ signedIn: true, plan: "plus", status: "active", renewsAt: NOW_S + 86400 });
    expect(store.get("entitlement")).toMatchObject({ v: 1, token, fetchedAt: NOW_MS });
    expect(store.get("plan")).toEqual({ v: 1, plan: "plus", until: (NOW_S + TOKEN_TTL_S) * 1000 + GRACE_MS });
    expect(JSON.stringify(store.get("plan"))).not.toContain(token.slice(0, 20));
    expect(await loadPlan(NOW_MS)).toBe("plus");
    // the request carries no page data, URL, origin, site list or key: an empty body and the session header
    expect(s.calls[0]!.init.body).toBe("{}");
  });
  it("a server answer that does not verify is not stored and leaves the cached grace in place", async () => {
    store.set("auth", session());
    const good = await tokenFor("plus");
    store.set("entitlement", { v: 1, token: good, fetchedAt: NOW_MS - 1000, status: "active", renewsAt: null });
    const forged = await tokenFor("plus", USER_A, NOW_S, await keypair());
    const s = server({ "/functions/v1/get-entitlement": () => json({ token: forged, plan: "plus", status: "active", renewsAt: null }) });
    const st = await refreshEntitlement(cfg, s.deps);
    expect(st.error).toBe("invalid");
    expect(st.plan).toBe("plus");
    expect((store.get("entitlement") as { token: string }).token).toBe(good);
  });
  it("offline: the cached token still counts within the grace; the daily check refreshes only after a day", async () => {
    store.set("auth", session());
    store.set("entitlement", { v: 1, token: await tokenFor("plus"), fetchedAt: NOW_MS - 1000, status: "active", renewsAt: null });
    const s = server({ "/functions/v1/get-entitlement": () => json({}, 500) });
    expect((await dailyCheck(cfg, s.deps)).plan).toBe("plus");
    expect(s.calls).toHaveLength(0);
    const later = { ...s.deps, now: () => NOW_MS + DAILY_MS + 1 };
    const st = await dailyCheck(cfg, { ...later, online: () => false });
    expect(st).toMatchObject({ plan: "plus", error: "offline" });
    expect((await recompute(cfg, { now: () => NOW_MS + TOKEN_TTL_S * 1000 + GRACE_MS + 1 })).plan).toBe("free");
  });
  it("offers come from the server plans table; checkout returns an https link; delete-account wipes the account here", async () => {
    store.set("auth", session());
    const s = server({
      "/rest/v1/plans": () => json([{ id: "plus-month", name: "Plus", interval: "month", price_minor: 300, currency: "EUR" }, { id: "BAD ID", name: "x", interval: "month", price_minor: 1, currency: "EUR" }]),
      "/functions/v1/create-checkout": (b) => json({ url: (b as { planId: string }).planId === "plus-month" ? "https://pay.example/checkout/1" : "javascript:alert(1)" }),
      "/functions/v1/delete-account": (b) => ((b as { confirm: string }).confirm === "delete" ? json({ ok: true }) : json({}, 400)),
    });
    expect(await loadOffers(cfg, s.deps)).toEqual({ ok: true, value: [{ id: "plus-month", name: "Plus", interval: "month", priceMinor: 300, currency: "EUR" }] });
    expect(await startCheckout(cfg, "plus-month", s.deps)).toEqual({ ok: true, value: "https://pay.example/checkout/1" });
    expect(await startCheckout(cfg, "other", s.deps)).toEqual({ ok: false, error: "server" });
    store.set("plan", { v: 1, plan: "plus", until: NOW_MS + 1 });
    expect((await deleteAccount(cfg, s.deps)).ok).toBe(true);
    expect(store.has("auth")).toBe(false);
    expect(planNow(store.get("plan"), NOW_MS)).toBe("free");
  });
  it("backendCall maps statuses to fixed kinds and never returns server text", async () => {
    const s = (status: number) => ({ fetch: async () => new Response("secret server detail", { status }), online: () => true });
    expect(await backendCall(cfg, "/functions/v1/x", { method: "POST" }, s(401))).toEqual({ ok: false, error: "auth" });
    expect(await backendCall(cfg, "/functions/v1/x", { method: "POST" }, s(429))).toEqual({ ok: false, error: "rate" });
    expect(await backendCall(cfg, "/functions/v1/x", { method: "POST" }, s(503))).toEqual({ ok: false, error: "unavailable" });
    expect(await backendCall(cfg, "/functions/v1/x", { method: "POST" }, s(200))).toEqual({ ok: false, error: "server" });
    const slow = { fetch: (_u: string, i: RequestInit) => new Promise<Response>((_r, rej) => i.signal!.addEventListener("abort", () => rej(new Error("abort")))), online: () => true, timeoutMs: 5 };
    expect(await backendCall(cfg, "/functions/v1/x", { method: "POST" }, slow)).toEqual({ ok: false, error: "timeout" });
  });
});
