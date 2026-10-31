import type { BillingEvent } from "./billing.ts";
import type { Plan } from "./token.ts";

/** A row of public.entitlements (times in seconds here; the REST adapter converts). */
export interface EntitlementRow {
  user_id: string;
  plan: Plan;
  status: "active" | "cancelled" | "expired" | "refunded";
  current_period_end: number | null;
  provider: string;
  provider_customer_ref: string | null;
  provider_subscription_ref: string | null;
  updated_at: number;
}

/**
 * Pure state transition for one verified billing event. Returns the new row, or undefined when the event changes nothing
 * (stale: it happened before the stored row was last updated, so an old event can never extend a period or undo a refund).
 */
export function nextEntitlement(current: EntitlementRow | undefined, ev: BillingEvent, provider: string): EntitlementRow | undefined {
  if (current && ev.occurredAt < current.updated_at) return undefined;
  const base: EntitlementRow = current ?? {
    user_id: ev.userId,
    plan: "free",
    status: "expired",
    current_period_end: null,
    provider,
    provider_customer_ref: null,
    provider_subscription_ref: null,
    updated_at: ev.occurredAt,
  };
  const refs = {
    provider,
    provider_customer_ref: ev.customerRef ?? base.provider_customer_ref,
    provider_subscription_ref: ev.subscriptionRef ?? base.provider_subscription_ref,
    updated_at: ev.occurredAt,
  };
  switch (ev.type) {
    case "activated":
      return { ...base, ...refs, plan: "plus", status: "active", current_period_end: ev.periodEnd ?? null };
    case "renewed":
      // a renewal never shortens the period
      return { ...base, ...refs, plan: "plus", status: "active", current_period_end: Math.max(ev.periodEnd ?? 0, base.current_period_end ?? 0) || null };
    case "cancelled":
      // Plus stays until the end of the paid period
      return { ...base, ...refs, status: base.plan === "plus" ? "cancelled" : base.status };
    case "expired":
      return { ...base, ...refs, plan: "free", status: "expired" };
    case "refunded":
      return { ...base, ...refs, plan: "free", status: "refunded", current_period_end: ev.occurredAt };
  }
}

/** What the signed token says: Plus while the row is active or cancelled and the paid period has not ended. */
export function planOf(row: EntitlementRow | undefined, nowS: number): Plan {
  if (!row || row.plan !== "plus") return "free";
  if (row.status !== "active" && row.status !== "cancelled") return "free";
  return row.current_period_end !== null && row.current_period_end > nowS ? "plus" : "free";
}
