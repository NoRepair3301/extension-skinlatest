import { checkUrl } from "../analyzer/eligibility.ts";
import { runInPage, setBadge } from "./api.ts";
import { ensureApplier } from "./inject.ts";
import { pauseSite } from "./siteActions.ts";
import { getSite, isAutoOn, originOf } from "./sites.ts";

/**
 * F2: the one Restore path. The popup button and the Restore shortcut both end here, so they cannot drift apart: the same frames, the
 * same fresh-instance cleanup (D4), the same pause of a remembered site and the same badge.
 *
 * - blocked: the page is not one Skinly may change. Anything we added earlier is still taken away (no injection), but the caller says
 *   "can't change this kind of page" instead of "restored".
 * - failed: nothing answered in the page (injection refused, no applier). The site is NOT paused, so the state never says "restored"
 *   while the page still shows the theme.
 */
export type RestoreOutcome = { ok: true; paused: boolean } | { ok: false; reason: "blocked" | "failed" };

export async function restorePage(tabId: number, url: string | undefined, blocklist: readonly string[]): Promise<RestoreOutcome> {
  const allowed = url !== undefined && checkUrl(url, blocklist).allowed;
  // A fresh script instance (popup reopened, extension reloaded, page navigated) has no ledger and cleans by markers (D4): make sure
  // there is one to ask. A blocked page is never injected into.
  if (allowed) {
    try {
      await ensureApplier(tabId, true);
    } catch {
      return { ok: false, reason: "failed" };
    }
  }
  let answer: unknown;
  try {
    answer = await runInPage(tabId, "restore", undefined, true);
  } catch {
    return { ok: false, reason: allowed ? "failed" : "blocked" };
  }
  if (allowed && (answer as { ok?: boolean } | undefined)?.ok !== true) return { ok: false, reason: "failed" };
  await setBadge(tabId, "").catch(() => undefined);
  if (!allowed) return { ok: false, reason: "blocked" };
  // Restore also pauses automatic theming for this site until the user picks a theme again, so a reload does not bring the theme back.
  const origin = url ? originOf(url) : undefined;
  let paused = false;
  try {
    if (origin && isAutoOn(await getSite(origin))) paused = (await pauseSite(origin)).ok;
  } catch {
    // the page is restored; the site stays as it was (the pause is only a convenience)
  }
  return { ok: true, paused };
}

/** True when this tab has something Restore would take away: a live or lost engine in the page, or a remembered site that is not paused. */
export async function hasSomethingToRestore(tabId: number, url: string | undefined): Promise<boolean> {
  try {
    if ((await runInPage<boolean>(tabId, "canRestore", undefined, true)) === true) return true;
  } catch {
    // no answer: fall back to the record
  }
  const origin = url ? originOf(url) : undefined;
  if (!origin) return false;
  try {
    return isAutoOn(await getSite(origin));
  } catch {
    return false;
  }
}
