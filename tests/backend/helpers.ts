import { createTestProvider, signTestWebhook, type BillingEvent } from "../../backend/supabase/functions/_shared/billing.ts";
import { toB64 } from "../../backend/supabase/functions/_shared/b64.ts";
import type { Deps } from "../../backend/supabase/functions/_shared/handlers.ts";
import { createRateLimiter } from "../../backend/supabase/functions/_shared/ratelimit.ts";
import type { Db, PlanRow } from "../../backend/supabase/functions/_shared/rest.ts";
import type { EntitlementRow } from "../../backend/supabase/functions/_shared/state.ts";
import { keyId } from "../../backend/supabase/functions/_shared/token.ts";

export const USER_A = "00000000-0000-4000-8000-00000000000a";
export const USER_B = "00000000-0000-4000-8000-00000000000b";
export const ORIGIN = `chrome-extension://${"a".repeat(32)}`;
export const NOW = 1_800_000_000;
/** Test-only secrets, made up here (never real). */
export const WEBHOOK_SECRET = "test-webhook-secret-0123456789abcdef";
export const SESSION_SECRET = "test-session-secret-0123456789abcdef";
export const FUNCTIONS_BASE = "https://proj.supabase.example/functions/v1";
/** Session JWTs are opaque to the functions (Supabase Auth checks them); the fake only maps strings to users. */
export const JWT_A = "session-token-for-user-a-000000";
export const JWT_B = "session-token-for-user-b-000000";

export const PLAN: PlanRow = { id: "plus-month", name: "Plus", interval: "month", price_minor: 300, currency: "EUR", provider_ref: "test_plus_month" };

export class FakeDb implements Db {
  ents = new Map<string, EntitlementRow>();
  events = new Map<string, string>();
  users = new Map<string, string>([
    [JWT_A, USER_A],
    [JWT_B, USER_B],
  ]);
  profiles = new Set<string>([USER_A, USER_B]);
  plans = new Map<string, PlanRow>([[PLAN.id, PLAN]]);
  deletedAuth: string[] = [];
  async userOf(jwt: string) {
    const id = this.users.get(jwt);
    return id ? { id } : undefined;
  }
  async getEntitlement(userId: string) {
    const r = this.ents.get(userId);
    return r ? { ...r } : undefined;
  }
  async upsertEntitlement(row: EntitlementRow) {
    this.ents.set(row.user_id, { ...row });
  }
  async activePlan(id: string) {
    return this.plans.get(id);
  }
  async hasEvent(id: string) {
    return this.events.has(id);
  }
  async recordEvent(id: string, type: string) {
    if (!this.events.has(id)) this.events.set(id, type);
  }
  async deleteUser(userId: string) {
    this.ents.delete(userId);
    this.profiles.delete(userId);
    for (const [jwt, id] of this.users) if (id === userId) this.users.delete(jwt);
    this.deletedAuth.push(userId);
  }
}

export async function keypair(): Promise<{ priv: CryptoKey; pub: CryptoKey; spkiB64: string; pkcs8B64: string; kid: string }> {
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", kp.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  return { priv: kp.privateKey, pub: kp.publicKey, spkiB64: toB64(spki), pkcs8B64: toB64(pkcs8), kid: await keyId(spki) };
}

export function makeDeps(over: Partial<Deps> = {}): Deps & { logs: string[]; db: FakeDb } {
  const logs: string[] = [];
  const db = new FakeDb();
  return {
    db,
    allowedOrigins: [ORIGIN],
    limiter: createRateLimiter(),
    log: (e: string, rid: string) => void logs.push(`${e} ${rid}`),
    requestId: "rid-1",
    nowS: () => NOW,
    billing: createTestProvider({ webhookSecret: WEBHOOK_SECRET, sessionSecret: SESSION_SECRET, functionsBase: FUNCTIONS_BASE }),
    testSessionSecret: SESSION_SECRET,
    logs,
    ...over,
  } as Deps & { logs: string[]; db: FakeDb };
}

export const req = (method: string, body?: unknown, headers: Record<string, string> = {}, url = "https://proj.supabase.example/functions/v1/x"): Request =>
  new Request(url, { method, headers: { origin: ORIGIN, "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });

export const authed = (jwt = JWT_A) => ({ authorization: `Bearer ${jwt}` });

export async function webhook(ev: BillingEvent, at = NOW, secret = WEBHOOK_SECRET): Promise<Request> {
  const body = JSON.stringify(ev);
  return new Request(`${FUNCTIONS_BASE}/billing-webhook`, { method: "POST", headers: { "skinly-test-signature": await signTestWebhook(secret, body, at), "content-type": "application/json" }, body });
}

export const event = (over: { [K in keyof BillingEvent]?: BillingEvent[K] | undefined } = {}): BillingEvent => ({ id: "evt_1", type: "activated", userId: USER_A, planId: PLAN.id, occurredAt: NOW, periodEnd: NOW + 30 * 86400, ...over }) as BillingEvent;
