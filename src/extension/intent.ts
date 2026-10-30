import { storageGet, storageRemove, storageSet } from "./api.ts";
import { siteKey } from "./origin.ts";
import { parseSite, type SiteLook } from "./sites.ts";
import type { Fingerprint } from "../core/types.ts";
import type { StylePlan } from "../plan/schema.ts";

/**
 * The pending intent (A1a). Edge closes the popup when it shows the permission prompt, and the user may close it while the AI runs, so the
 * popup never does the keeping itself: on the click it writes what the user asked for here and requests the permission. The background
 * reads it on permissions.onAdded (or on the write, when the permission is already there), saves the site, registers the auto files and
 * applies to the tab. Origin, tab id, plan and times only: never a URL, page text or key.
 */
export const INTENT_KEY = "intent";
export const INTENT_TTL_MS = 5 * 60 * 1000;

/** What a kept site is saved from: a plan, the layout it was made for and who made it. */
export interface KeptPlan {
  plan: StylePlan;
  fingerprint: Fingerprint;
  provider: string;
  model: string;
  /** What art was showing when the user kept the plan (Phase 10). */
  look?: SiteLook | undefined;
  /** Repair rules in force when the theme was kept. */
  repairCss?: string | undefined;
}

/**
 * `click`: written inside the click, with the built-in theme the user picked (all that is known before the run).
 * `final`: the plan that is on the page after the run (an AI plan, or the built-in one with its repair rules).
 * `resume`: the Resume button; the stored record applies again.
 */
export type IntentStage = "click" | "final" | "resume";

export interface PendingIntent {
  v: 1;
  origin: string;
  tabId: number;
  stage: IntentStage;
  createdAt: number;
  expiresAt: number;
  kept?: KeptPlan;
  /** The reopened popup found the permission refused: the next click themes this page only and does not ask again. */
  denied?: boolean;
  /**
   * The permission was already there when the popup opened, so no prompt shows, the popup stays open and themes the tab itself. Otherwise
   * (a prompt may close the popup) the background puts the theme on the tab.
   */
  popupApplies?: boolean;
}

/** Layout of a plan made before the page was read: no regions, so nothing to compare (the auto script then applies colours only). */
export const NO_LAYOUT: Fingerprint = { hash: "00000000", seq: "" };

export function makeIntent(origin: string, tabId: number, stage: IntentStage, kept: KeptPlan | undefined, now = Date.now(), popupApplies = false): PendingIntent | undefined {
  const key = siteKey(origin);
  if (!key || key.key !== origin || !Number.isInteger(tabId) || tabId < 0) return undefined;
  if (stage !== "resume" && !kept) return undefined;
  return { v: 1, origin: key.key, tabId, stage, createdAt: now, expiresAt: now + INTENT_TTL_MS, ...(kept ? { kept } : {}), ...(popupApplies ? { popupApplies: true } : {}) };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The kept part is checked the same way a stored site is (sites.ts), so a broken intent can never become a broken record. */
function parseKept(raw: unknown): KeptPlan | undefined {
  if (!isObj(raw)) return undefined;
  const rec = parseSite({ v: 1, plan: raw["plan"], fingerprint: raw["fingerprint"], provider: raw["provider"], model: raw["model"], promptVersion: "0", savedAt: new Date(0).toISOString(), mode: "auto", blur: [], blurImages: false, look: raw["look"], repairCss: raw["repairCss"] });
  if (!rec) return undefined;
  return { plan: rec.plan, fingerprint: rec.fingerprint, provider: rec.provider, model: rec.model, ...(rec.look ? { look: rec.look } : {}), ...(rec.repairCss ? { repairCss: rec.repairCss } : {}) };
}

/** Strict read: wrong shape, an origin that is not an origin, an expired or a future-dated intent all count as none. */
export function parseIntent(raw: unknown, now = Date.now()): PendingIntent | undefined {
  if (!isObj(raw) || raw["v"] !== 1) return undefined;
  const { origin, tabId, stage, createdAt, expiresAt, kept, denied, popupApplies } = raw;
  const key = siteKey(origin);
  if (!key || key.key !== origin) return undefined;
  if (typeof tabId !== "number" || !Number.isInteger(tabId) || tabId < 0) return undefined;
  if (stage !== "click" && stage !== "final" && stage !== "resume") return undefined;
  if (typeof createdAt !== "number" || typeof expiresAt !== "number" || expiresAt - createdAt !== INTENT_TTL_MS) return undefined;
  if (now >= expiresAt || createdAt > now + 60_000) return undefined;
  const k = kept === undefined ? undefined : parseKept(kept);
  if (kept !== undefined && !k) return undefined;
  if (stage !== "resume" && !k) return undefined;
  return { v: 1, origin: key.key, tabId, stage, createdAt, expiresAt, ...(k ? { kept: k } : {}), ...(denied === true ? { denied: true } : {}), ...(popupApplies === true ? { popupApplies: true } : {}) };
}

export const writeIntent = (intent: PendingIntent): Promise<void> => storageSet(INTENT_KEY, intent);

export async function readIntent(now = Date.now()): Promise<PendingIntent | undefined> {
  return parseIntent(await storageGet(INTENT_KEY), now);
}

/** Removes the stored intent, but only when it is still the given one (a newer click must not be dropped). Without one, always. */
export async function clearIntent(only?: Pick<PendingIntent, "createdAt" | "stage">): Promise<void> {
  if (only) {
    const raw = await storageGet<{ createdAt?: unknown; stage?: unknown }>(INTENT_KEY);
    if (!raw || raw.createdAt !== only.createdAt || raw.stage !== only.stage) return;
  }
  await storageRemove(INTENT_KEY);
}
