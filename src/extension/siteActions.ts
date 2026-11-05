import { ALLOWED_URL_HOSTS } from "../config.ts";
import { PROMPT_VERSION } from "../ai/prompt.ts";
import { fnv1a } from "../analyzer/fingerprint.ts";
import { clearAllStorage, hasOrigins, registerAutoScript, registeredScripts, removeAllOrigins, removeOrigins, requestOrigins, setBadge, unregisterAutoScript } from "./api.ts";
import { clearSites, getSite, isAutoOn, loadSites, migrateStorage, patchSite, removeSite, saveSite, toOrigin, type SiteLook, type SiteRecord } from "./sites.ts";
import { siteKey } from "./origin.ts";
import type { KeptPlan } from "./intent.ts";

export type { KeptPlan };

export const AUTO_SCRIPT_FILE = "applier-auto.js";
/** The applier itself; the auto script needs it loaded first. */
export const APPLIER_SCRIPT_FILE = "applier.js";
/**
 * Registered after the auto script for every kept site. It reads the site and the "Show art" switch itself and does nothing when art is
 * off, so art switched on later (or an AI theme, whose scene follows its colours) comes back after a reload without registering again.
 */
export const SCENE_SCRIPT_FILE = "scene.js";

/** Every file the auto path needs, in load order: the applier, the glue that applies the stored plan, then the art. */
export const AUTO_FILES: readonly string[] = [APPLIER_SCRIPT_FILE, AUTO_SCRIPT_FILE, SCENE_SCRIPT_FILE];

/** True when the saved look asks for art: art on, an older saved scene, or an asset. */
export const hasArt = (look: SiteLook | undefined): boolean => look !== undefined && (look.art === true || look.scene !== undefined || look.asset !== undefined);

/** Stable script id for an origin. */
export const scriptId = (origin: string): string => `skinly-${fnv1a(origin)}`;

/** The one match pattern we ever request or register: the visited origin, nothing wider. */
export const matchFor = (origin: string): string[] => {
  const k = siteKey(origin);
  return k ? [k.pattern] : [];
};

/** The record a kept plan is saved as. A new record is never paused: keeping a theme is the user asking for it. */
export const record = (kept: KeptPlan, mode: SiteRecord["mode"], previous?: SiteRecord): SiteRecord => ({
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
  ...(kept.look ? { look: kept.look } : previous?.look ? { look: previous.look } : {}),
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
    else if (previous) await saveSite(o, { ...withoutPause(previous), mode: "auto" });
    else return { ok: false, reason: "no-record" };
    await registerAutoScript(scriptId(o), matchFor(o), [...AUTO_FILES]);
    if (tabId !== undefined) await setBadge(tabId, "ON");
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

const withoutPause = (r: SiteRecord): SiteRecord => {
  const rest = { ...r };
  delete rest.paused;
  return rest;
};

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Makes sure the origin has exactly one registration with the current auto files and its one match pattern. Does nothing when it already
 * has (idempotent: no unregister, no register). False when the browser refused.
 */
export async function ensureRegistered(origin: string): Promise<boolean> {
  const matches = matchFor(origin);
  if (matches.length === 0) return false;
  const id = scriptId(origin);
  try {
    const [now] = await registeredScripts([id]);
    if (now && sameList(now.js, AUTO_FILES) && sameList(now.matches, matches) && now.runAt === "document_start") return true;
    await registerAutoScript(id, matches, [...AUTO_FILES]);
    return true;
  } catch {
    return false;
  }
}

export interface ReconcileResult {
  /** Sites that got a (new or corrected) registration. */
  registered: number;
  /** Registrations removed: paused or forgotten sites, sites whose permission was taken away, strays. */
  removed: number;
}

/**
 * Runs on service-worker start, install and update (A1b). Migrates storage, then: every kept site that is on and still has its permission
 * has its registration with the current files; every other skinly registration goes. Running it twice changes nothing the second time.
 */
export async function reconcile(): Promise<ReconcileResult> {
  const out: ReconcileResult = { registered: 0, removed: 0 };
  await migrateStorage().catch(() => false);
  const sites = await loadSites();
  let current: Array<{ id: string; js: string[]; matches: string[]; runAt: string }> = [];
  try {
    current = await registeredScripts();
  } catch {
    current = [];
  }
  const byId = new Map(current.map((c) => [c.id, c]));
  const keep = new Set<string>();
  for (const [o, site] of Object.entries(sites)) {
    if (!isAutoOn(site)) continue;
    let granted = false;
    try {
      granted = await hasOrigins(matchFor(o));
    } catch {
      granted = false;
    }
    if (!granted) continue;
    const id = scriptId(o);
    keep.add(id);
    const now = byId.get(id);
    if (now && sameList(now.js, AUTO_FILES) && sameList(now.matches, matchFor(o)) && now.runAt === "document_start") continue;
    if (await ensureRegistered(o)) out.registered++;
  }
  for (const c of current) {
    if (!c.id.startsWith("skinly-") || keep.has(c.id)) continue;
    await unregisterAutoScript(c.id);
    out.removed++;
  }
  return out;
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

/**
 * "Pause on this site" and Restore (A1e): keep the record, stop applying by itself until Resume or Change my page. The permission stays so
 * Resume needs no prompt.
 */
export async function pauseSite(origin: string): Promise<ActionResult> {
  const o = toOrigin(origin);
  if (!o) return { ok: false, reason: "bad-origin" };
  const next = await patchSite(o, (r) => ({ ...r, paused: true }));
  if (!next) return { ok: false, reason: "no-record" };
  await unregisterAutoScript(scriptId(o));
  return { ok: true };
}

/** Resume: the paused record applies by itself again (registration back). Called by the background, which holds the permission check. */
export async function resumeSite(origin: string): Promise<ActionResult> {
  const o = toOrigin(origin);
  if (!o) return { ok: false, reason: "bad-origin" };
  const next = await patchSite(o, (r) => ({ ...withoutPause(r), mode: "auto" }));
  if (!next) return { ok: false, reason: "no-record" };
  return (await ensureRegistered(o)) ? { ok: true } : { ok: false, reason: "error" };
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

/** "Erase all Skinly data": every site (with its script and permission), then every host permission, then all of storage (settings, keys, assets, sites). */
export async function eraseEverything(): Promise<ActionResult> {
  try {
    await forgetAll();
    await removeAllOrigins();
    await clearAllStorage();
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}
