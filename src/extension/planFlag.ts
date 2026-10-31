import { storageGet, storageSet } from "./api.ts";
import type { PlanFlag } from "../core/entitlements.ts";

/**
 * The derived plan flag (`plan` in storage.local): `{ v: 1, plan, until }`. Written only from a verified entitlement token
 * (src/backend/entitlement.ts); read by the popup, the options page, the background and the page scripts. It never holds a token,
 * an email or an id, so a page script may read it. Plus counts only while `until` (token expiry plus the offline grace) is ahead.
 */
export const PLAN_KEY = "plan";

export interface PlanRecord {
  v: 1;
  plan: PlanFlag;
  /** Milliseconds since the epoch. */
  until: number;
}

export function parsePlanRecord(raw: unknown): PlanRecord | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { v, plan, until } = raw as Record<string, unknown>;
  if (v !== 1 || (plan !== "free" && plan !== "plus") || typeof until !== "number" || !Number.isFinite(until)) return undefined;
  return { v: 1, plan, until };
}

/** The plan in force now: Plus only from a valid record whose time has not run out; anything else is Free. */
export function planNow(raw: unknown, now = Date.now()): PlanFlag {
  const r = parsePlanRecord(raw);
  return r && r.plan === "plus" && now < r.until ? "plus" : "free";
}

export async function loadPlan(now = Date.now()): Promise<PlanFlag> {
  try {
    return planNow(await storageGet(PLAN_KEY), now);
  } catch {
    return "free";
  }
}

export const savePlanRecord = (r: PlanRecord): Promise<void> => storageSet(PLAN_KEY, r);
