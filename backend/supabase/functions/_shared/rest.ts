import type { EntitlementRow } from "./state.ts";

/**
 * Everything the functions read or write, behind one interface. `createRestDb` talks to Supabase over plain fetch: Auth
 * (`/auth/v1/user`, `/auth/v1/admin/users/{id}`, confirmed on supabase.com/docs) and the REST API (`/rest/v1/<table>`). The PostgREST
 * filter, upsert and delete conventions used here are CONVENTION items in docs/backend/supabase.md: one file to correct.
 * The secret key goes in the `apikey` header only (a legacy service key, being a JWT, also as the bearer).
 */
export interface PlanRow {
  id: string;
  name: string;
  interval: "month" | "year";
  price_minor: number;
  currency: string;
  provider_ref: string;
}

export interface Db {
  /** The user behind a session JWT (Supabase Auth), or undefined when the token is not valid. */
  userOf(jwt: string): Promise<{ id: string } | undefined>;
  getEntitlement(userId: string): Promise<EntitlementRow | undefined>;
  upsertEntitlement(row: EntitlementRow): Promise<void>;
  activePlan(planId: string): Promise<PlanRow | undefined>;
  /** True when this provider event id was already processed. */
  hasEvent(eventId: string): Promise<boolean>;
  /** Records a processed event (no payload). A second insert of the same id is ignored. */
  recordEvent(eventId: string, type: string): Promise<void>;
  /** Removes the user's rows (entitlement with its billing references, profile) and then the auth user. */
  deleteUser(userId: string): Promise<void>;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const toIso = (s: number | null): string | null => (s === null ? null : new Date(s * 1000).toISOString());
const toS = (iso: unknown): number | null => (typeof iso === "string" && !Number.isNaN(Date.parse(iso)) ? Math.floor(Date.parse(iso) / 1000) : null);

export class DbError extends Error {
  constructor(readonly status: number) {
    super("db");
  }
}

export function createRestDb(cfg: { url: string; secretKey: string; publishableKey: string; fetch: FetchFn }): Db {
  const base = cfg.url.replace(/\/+$/, "");
  const svc: Record<string, string> = { apikey: cfg.secretKey, "content-type": "application/json" };
  // A legacy service key is a JWT and was sent as the bearer too; new sb_secret_ keys go in apikey only (docs/backend/supabase.md).
  if (cfg.secretKey.startsWith("eyJ")) svc["authorization"] = `Bearer ${cfg.secretKey}`;

  const call = async (path: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<Response> => {
    const res = await cfg.fetch(`${base}${path}`, { ...init, headers: { ...svc, ...(init.headers ?? {}) } });
    if (!res.ok && res.status !== 404) throw new DbError(res.status);
    return res;
  };
  const rows = async (res: Response): Promise<Array<Record<string, unknown>>> => {
    const body: unknown = await res.json();
    return Array.isArray(body) ? (body as Array<Record<string, unknown>>) : [];
  };

  return {
    async userOf(jwt) {
      const res = await cfg.fetch(`${base}/auth/v1/user`, { headers: { apikey: cfg.publishableKey, authorization: `Bearer ${jwt}` } });
      if (!res.ok) return undefined;
      const u: unknown = await res.json();
      const id = typeof u === "object" && u !== null ? (u as { id?: unknown }).id : undefined;
      return typeof id === "string" && UUID.test(id) ? { id } : undefined;
    },
    async getEntitlement(userId) {
      if (!UUID.test(userId)) return undefined;
      const [r] = await rows(await call(`/rest/v1/entitlements?user_id=eq.${userId}&select=*`));
      if (!r) return undefined;
      return {
        user_id: String(r["user_id"]),
        plan: r["plan"] === "plus" ? "plus" : "free",
        status: (["active", "cancelled", "expired", "refunded"] as const).find((s) => s === r["status"]) ?? "expired",
        current_period_end: toS(r["current_period_end"]),
        provider: String(r["provider"] ?? ""),
        provider_customer_ref: typeof r["provider_customer_ref"] === "string" ? r["provider_customer_ref"] : null,
        provider_subscription_ref: typeof r["provider_subscription_ref"] === "string" ? r["provider_subscription_ref"] : null,
        updated_at: toS(r["updated_at"]) ?? 0,
      };
    },
    async upsertEntitlement(row) {
      await call(`/rest/v1/entitlements?on_conflict=user_id`, {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ ...row, current_period_end: toIso(row.current_period_end), updated_at: toIso(row.updated_at) }),
      });
    },
    async activePlan(planId) {
      if (!/^[a-z0-9-]{1,40}$/.test(planId)) return undefined;
      const [r] = await rows(await call(`/rest/v1/plans?id=eq.${planId}&active=eq.true&select=id,name,interval,price_minor,currency,provider_ref`));
      if (!r) return undefined;
      return { id: String(r["id"]), name: String(r["name"]), interval: r["interval"] === "year" ? "year" : "month", price_minor: Number(r["price_minor"]), currency: String(r["currency"]), provider_ref: String(r["provider_ref"]) };
    },
    async hasEvent(eventId) {
      const [r] = await rows(await call(`/rest/v1/billing_events?provider_event_id=eq.${encodeURIComponent(eventId)}&select=provider_event_id`));
      return r !== undefined;
    },
    async recordEvent(eventId, type) {
      await call(`/rest/v1/billing_events?on_conflict=provider_event_id`, {
        method: "POST",
        headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({ provider_event_id: eventId, type }),
      });
    },
    async deleteUser(userId) {
      if (!UUID.test(userId)) throw new DbError(400);
      await call(`/rest/v1/entitlements?user_id=eq.${userId}`, { method: "DELETE" });
      await call(`/rest/v1/profiles?id=eq.${userId}`, { method: "DELETE" });
      await call(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
    },
  };
}
