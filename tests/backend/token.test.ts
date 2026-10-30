// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fromB64Url, toB64Url, utf8 } from "../../backend/supabase/functions/_shared/b64.ts";
import { handleGetEntitlement } from "../../backend/supabase/functions/_shared/handlers.ts";
import { TOKEN_TTL_S, importSigningKey, importVerifyKey, signEntitlement, verifyEntitlement } from "../../backend/supabase/functions/_shared/token.ts";
import { NOW, USER_A, authed, keypair, makeDeps, req } from "./helpers.ts";

describe("entitlement token (B3)", () => {
  it("signs plan, sub, iat, kid and a 3-day expiry, and verifies with the public key", async () => {
    const k = await keypair();
    const t = await signEntitlement({ plan: "plus", sub: USER_A }, k.priv, k.kid, NOW);
    expect(await verifyEntitlement(t, k.pub, k.kid)).toEqual({ plan: "plus", sub: USER_A, iat: NOW, exp: NOW + TOKEN_TTL_S, kid: k.kid });
    expect(TOKEN_TTL_S).toBe(3 * 24 * 3600);
    // no email or billing data in the payload
    const payload = JSON.parse(new TextDecoder().decode(fromB64Url(t.split(".")[1]!)!));
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "kid", "plan", "sub"]);
  });

  it("keys round-trip through the secret formats (PKCS#8 and SPKI base64), and the key id is derived from the public key", async () => {
    const k = await keypair();
    const signing = await importSigningKey(k.pkcs8B64);
    const v = await importVerifyKey(k.spkiB64);
    expect(v.kid).toBe(k.kid);
    const t = await signEntitlement({ plan: "free", sub: USER_A }, signing, v.kid, NOW);
    expect((await verifyEntitlement(t, v.key, v.kid))?.plan).toBe("free");
    await expect(importSigningKey("not base64!")).rejects.toThrow();
  });

  it("refuses a tampered payload, a wrong key, a wrong kid, another alg, a changed lifetime and garbage", async () => {
    const k = await keypair();
    const other = await keypair();
    const t = await signEntitlement({ plan: "free", sub: USER_A }, k.priv, k.kid, NOW);
    const [h, p, s] = t.split(".") as [string, string, string];
    const forged = JSON.parse(new TextDecoder().decode(fromB64Url(p)!));
    forged.plan = "plus";
    expect(await verifyEntitlement(`${h}.${toB64Url(utf8(JSON.stringify(forged)))}.${s}`, k.pub, k.kid)).toBeUndefined();
    expect(await verifyEntitlement(t, other.pub, k.kid)).toBeUndefined();
    expect(await verifyEntitlement(t, k.pub, other.kid)).toBeUndefined();
    const none = toB64Url(utf8(JSON.stringify({ alg: "none", typ: "skinly-ent", kid: k.kid })));
    expect(await verifyEntitlement(`${none}.${p}.${s}`, k.pub, k.kid)).toBeUndefined();
    const longer = await signEntitlement({ plan: "plus", sub: USER_A }, k.priv, k.kid, NOW);
    const lp = JSON.parse(new TextDecoder().decode(fromB64Url(longer.split(".")[1]!)!));
    lp.exp += 86400;
    expect(await verifyEntitlement(`${longer.split(".")[0]}.${toB64Url(utf8(JSON.stringify(lp)))}.${longer.split(".")[2]}`, k.pub, k.kid)).toBeUndefined();
    for (const g of [undefined, 42, "", "a.b", "a.b.c", `${h}.${p}`, "x".repeat(5000)]) expect(await verifyEntitlement(g, k.pub, k.kid)).toBeUndefined();
  });
});

describe("get-entitlement", () => {
  it("verifies the caller, then signs Plus only for an active or cancelled row inside its paid period", async () => {
    const k = await keypair();
    const d = makeDeps({ signer: { key: k.priv, kid: k.kid } });
    const get = async () => (await handleGetEntitlement(req("POST", {}, authed()), d).then((r) => r.json())) as { token: string; plan: string; status: string; renewsAt: number | null };
    expect((await get()).plan).toBe("free");
    d.db.ents.set(USER_A, { user_id: USER_A, plan: "plus", status: "active", current_period_end: NOW + 100, provider: "test", provider_customer_ref: null, provider_subscription_ref: null, updated_at: NOW });
    const res = await get();
    expect(res).toMatchObject({ plan: "plus", status: "active", renewsAt: NOW + 100 });
    expect((await verifyEntitlement(res.token, k.pub, k.kid))?.plan).toBe("plus");
    d.db.ents.set(USER_A, { ...d.db.ents.get(USER_A)!, status: "cancelled" });
    expect((await get()).plan).toBe("plus");
    d.db.ents.set(USER_A, { ...d.db.ents.get(USER_A)!, current_period_end: NOW - 1 });
    expect((await get()).plan).toBe("free");
    d.db.ents.set(USER_A, { ...d.db.ents.get(USER_A)!, status: "refunded", current_period_end: NOW + 100 });
    expect((await get()).plan).toBe("free");
  });

  it("no or bad JWT is 401; no signing key is 503; errors are generic", async () => {
    const d = makeDeps();
    expect((await handleGetEntitlement(req("POST", {}), d)).status).toBe(401);
    expect((await handleGetEntitlement(req("POST", {}, { authorization: "Bearer not-a-known-session-token" }), d)).status).toBe(401);
    const r = await handleGetEntitlement(req("POST", {}, authed()), d);
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "unavailable" });
  });
});
