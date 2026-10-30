import { getPageUrl, hasOrigins, injectFiles, popupOpen, runInPage, setBadge } from "./api.ts";
import { clearIntent, readIntent, type PendingIntent } from "./intent.ts";
import { siteKey } from "./origin.ts";
import { AUTO_FILES, ensureRegistered, record, resumeSite } from "./siteActions.ts";
import { getSite, saveSite } from "./sites.ts";

/**
 * The background side of the keep flow (A1a). Everything after the click happens here, because the popup may be gone: Edge closes it
 * when it shows the permission prompt, and the user may close it while the AI runs.
 *
 * - `added`: permissions.onAdded fired. The popup may have died at the prompt, so the theme is also put on the tab.
 * - `changed`: the popup wrote an intent and the permission is there (granted before, or the prompt was answered already).
 * - `start`: the service worker started with an intent left over (it was stopped in between).
 * The tab is themed here unless the intent says the popup does it (the permission was there when the popup opened, so no prompt could
 * close it); a page that already shows a theme is never themed twice.
 */
export type KeepTrigger = "added" | "changed" | "start";
export type KeepResult = "none" | "denied" | "not-granted" | "kept" | "error";

/** Every keeper step runs one after another, so two events for the same click never save or register twice at once. */
let chain: Promise<unknown> = Promise.resolve();
export function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job);
  chain = run.catch(() => undefined);
  return run;
}

/**
 * Puts the kept theme on an open tab the way a page load would: the auto files, in order, in the top frame. Skipped when the page already
 * shows a theme (the popup is alive and themed it) or when the tab has left the site since the click (a stale tab id never gets the
 * files of another origin). The URL is compared in memory only, never stored.
 */
export async function applyToTab(tabId: number, origin: string): Promise<boolean> {
  try {
    const url = await getPageUrl(tabId).catch(() => undefined);
    if (!url || siteKey(url)?.key !== origin) return false;
    const active = await runInPage<boolean>(tabId, "isActive").catch(() => undefined);
    if (active === true) return true;
    await injectFiles(tabId, [...AUTO_FILES]);
    return true;
  } catch {
    return false;
  }
}

async function keep(intent: PendingIntent): Promise<KeepResult> {
  if (intent.stage === "resume") {
    if (!(await resumeSite(intent.origin)).ok) return "error";
  } else {
    if (!intent.kept) return "error";
    const previous = await getSite(intent.origin);
    if (!(await saveSite(intent.origin, record(intent.kept, "auto", previous)))) return "error";
    if (!(await ensureRegistered(intent.origin))) return "error";
  }
  // Chrome keeps the popup open over the prompt: it is running the flow and themes the tab itself, so a second apply would only flicker.
  const popupThemes = intent.popupApplies === true || (intent.stage === "click" && (await popupOpen().catch(() => false)));
  if (!popupThemes) await applyToTab(intent.tabId, intent.origin);
  await setBadge(intent.tabId, "ON").catch(() => undefined);
  return "kept";
}

/** Reads the pending intent and completes it when its origin is granted. Idempotent: a completed intent is removed. */
export function completeIntent(_trigger: KeepTrigger): Promise<KeepResult> {
  return serial(async () => {
    const intent = await readIntent();
    if (!intent) {
      await clearIntent().catch(() => undefined);
      return "none";
    }
    if (intent.denied) return "denied";
    const key = siteKey(intent.origin);
    if (!key) return "none";
    let granted = false;
    try {
      granted = await hasOrigins([key.pattern]);
    } catch {
      granted = false;
    }
    if (!granted) return "not-granted";
    let result: KeepResult;
    try {
      result = await keep(intent);
    } catch {
      result = "error";
    }
    await clearIntent(intent).catch(() => undefined);
    return result;
  });
}

/** The origins a permissions.onAdded event carries, as site keys (a pattern `<origin>/*` back to its origin). */
export function originsOfPatterns(patterns: readonly string[]): string[] {
  const out: string[] = [];
  for (const p of patterns) {
    const k = p.endsWith("/*") ? siteKey(p.slice(0, -2)) : undefined;
    if (k && k.pattern === p) out.push(k.key);
  }
  return out;
}
