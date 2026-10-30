import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * B2: the SQL cannot run here (no database); `supabase test db` runs backend/supabase/tests/database/rls.test.sql. These checks hold
 * the migration to the rules that test proves: RLS on every table, select-only policies, no raw payload, nothing beyond PLUS_SPEC 3.
 */
const dir = "backend/supabase/migrations";
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(`${dir}/${f}`, "utf8"))
  .join("\n")
  .toLowerCase();
const tables = [...sql.matchAll(/create table (public\.[a-z_]+)/g)].map((m) => m[1]!);

describe("migrations (B2)", () => {
  it("creates exactly profiles, plans, entitlements and billing_events", () => {
    expect(tables.sort()).toEqual(["public.billing_events", "public.entitlements", "public.plans", "public.profiles"]);
  });

  it("enables and forces RLS on every table", () => {
    for (const t of tables) {
      expect(sql, t).toContain(`alter table ${t} enable row level security`);
      expect(sql, t).toContain(`alter table ${t} force row level security`);
    }
  });

  it("has select policies only: own profile, own entitlement, active plans; none for billing events", () => {
    const policies = [...sql.matchAll(/create policy "[^"]+" on (public\.[a-z_]+) for ([a-z]+) to ([a-z, ]+) using \((.*?)\);/g)];
    expect(policies.map((p) => p[2])).toEqual(["select", "select", "select"]);
    const by = Object.fromEntries(policies.map((p) => [p[1], { to: p[3], using: p[4] }]));
    expect(by["public.profiles"]).toEqual({ to: "authenticated", using: "id = auth.uid()" });
    expect(by["public.entitlements"]).toEqual({ to: "authenticated", using: "user_id = auth.uid()" });
    expect(by["public.plans"]).toEqual({ to: "anon, authenticated", using: "active" });
    expect(by["public.billing_events"]).toBeUndefined();
    expect(sql).toMatch(/revoke insert, update, delete on public\.profiles, public\.plans, public\.entitlements, public\.billing_events from anon, authenticated/);
  });

  it("holds the plan columns from the spec and no payload, URL, origin or site column anywhere", () => {
    for (const c of ["id text", "name text", "interval text", "price_minor integer", "currency text", "provider_ref text", "active boolean"]) expect(sql).toContain(c);
    for (const c of ["user_id uuid", "plan text", "status text", "current_period_end timestamptz", "provider text", "provider_customer_ref text", "provider_subscription_ref text", "updated_at timestamptz"]) expect(sql).toContain(c);
    for (const c of ["provider_event_id text primary key", "type text", "received_at timestamptz"]) expect(sql).toContain(c);
    expect(sql).not.toMatch(/\b(payload|raw|body|url|origin|site|email)\s+(text|jsonb?)\b/);
  });

  it("the pgTAP test exists, signs in as a user and proves own-row reads and refused writes", () => {
    const t = readFileSync("backend/supabase/tests/database/rls.test.sql", "utf8");
    expect(t).toMatch(/select plan\(\d+\)/);
    expect(t).toContain("set local role authenticated");
    expect(t).toContain("A cannot update entitlements");
    expect(t).toContain("select * from finish()");
  });
});
