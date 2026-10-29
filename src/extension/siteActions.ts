import { ALLOWED_URL_HOSTS } from "../config.ts";
import type { Fingerprint } from "../core/types.ts";
import { PROMPT_VERSION } from "../ai/prompt.ts";
import { fnv1a } from "../analyzer/fingerprint.ts";
import type { StylePlan } from "../plan/schema.ts";
import { registerAutoScript, removeOrigins, requestOrigins, setBadge, unregisterAutoScript } from "./api.ts";
import { clearSites, getSite, loadSites, removeSite, saveSite, toOrigin, type SiteRecord } from "./sites.ts";

export const AUTO_SCRIPT_FILE = "applier-auto.js";

/** Stable script id for an origin. */
export const scriptId = (origin: string): string => `skinly-${fnv1a(origin)}`;

/** The one match pattern we ever request or register: the visited origin, nothing wider. */
export const matchFor = (origin: string): string[] => [`${origin}/*`];

export interface KeptPlan {
  plan: StylePlan;
  fingerprint: Fingerprint;
  provider: string;
  model: string;
}

const record = (kept: KeptPlan, mode: SiteRecord["mode"], previous?: SiteRecord): SiteRecord => ({
  v: 1,
  plan: kept.plan,
  fingerprint: kept.fingerprint,
  provider: kept.provider,
  model: kept.model,
  promptVersion: PROMPT_VERSION,
  savedAt: new Date().toISOString(),
  mode,
  blur: previous?.blur ?? [],
  blurImages: previous?.blurImages ?? false,
});

export type ActionResult = { ok: true } | { ok: false; reason: "bad-origin" | "permission" | "no-record" | "error" };

/** "Remember this site": save the plan; it applies only when the user clicks. */
export async function rememberSite(origin: string, kept: KeptPlan): Promise<ActionResult> {
  const o = toOrigin(origin);
  if (!o) return { ok: false, reason: "bad-origin" };
  const previous = await getSite(o);
  await saveSite(o, record(kept, previous?.mode ?? "ask", previous));
  return { ok: true };
}

/** "Always on this site": must be called straight from the user's click. Requests only this origin. */
export async function enableAuto(origin: string, kept: KeptPlan | undefined, tabId?: number): Promise<ActionResult> {
  const o = toOrigin(origin);
  if (!o) return { ok: false, reason: "bad-origin" };
  const granted = await requestOrigins(matchFor(o));
  if (!granted) return { ok: false, reason: "permission" };
  try {
    const previous = await getSite(o);
    if (kept) await saveSite(o, record(kept, "auto", previous));
    else if (previous) await saveSite(o, { ...previous, mode: "auto" });
    else return { ok: false, reason: "no-record" };
    await registerAutoScript(scriptId(o), matchFor(o), AUTO_SCRIPT_FILE);
    if (tabId !== undefined) await setBadge(tabId, "ON");
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Saves the picked blur selectors for a site that is already remembered (selectors only, never text). */
export async function saveBlur(origin: string, selectors: string[], blurImages: boolean): Promise<ActionResult> {
  const o = toOrigin(origin);
  if (!o) return { ok: false, reason: "bad-origin" };
  const previous = await getSite(o);
  if (!previous) return { ok: false, reason: "no-record" };
  await saveSite(o, { ...previous, blur: selectors.slice(0, 50), blurImages });
  return { ok: true };
}

/** "Pause on this site": keep the record, stop applying by itself. The permission stays so it can be switched on again. */
export async function pauseSite(origin: string): Promise<ActionResult> {
  const o = toOrigin(origin);
  const previous = o ? await getSite(o) : undefined;
  if (!o) return { ok: false, reason: "bad-origin" };
  if (!previous) return { ok: false, reason: "no-record" };
  await saveSite(o, { ...previous, mode: "ask" });
  await unregisterAutoScript(scriptId(o));
  return { ok: true };
}

/** "Forget this site": script, permission and record all go. */
export async function forgetSite(origin: string, tabId?: number): Promise<ActionResult> {
  const o = toOrigin(origin);
  if (!o) return { ok: false, reason: "bad-origin" };
  await unregisterAutoScript(scriptId(o));
  // A provider host permission belongs to a saved key, not to the site record.
  if (!ALLOWED_URL_HOSTS.includes(new URL(o).hostname)) {
    try {
      await removeOrigins(matchFor(o));
    } catch {
      // permission was never granted
    }
  }
  await removeSite(o);
  if (tabId !== undefined) await setBadge(tabId, "");
  return { ok: true };
}

export async function forgetAll(): Promise<void> {
  for (const o of Object.keys(await loadSites())) await forgetSite(o);
  await clearSites();
}
