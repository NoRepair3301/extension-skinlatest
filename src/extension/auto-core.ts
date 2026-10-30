import { similar } from "../analyzer/fingerprint.ts";
import type { Applier } from "./applier-core.ts";
import { isAutoOn, type SiteRecord } from "./sites.ts";
import type { AutoState } from "../core/diag.ts";
import { adoptCss } from "../features/mount.ts";

export const BANNER_TEXT = "This page changed. Regenerate?";
export const BANNER_HINT = "Open Skinly AI and choose Change my page.";

export interface AutoDeps {
  doc: Document;
  origin: string;
  applier: Pick<Applier, "applyTokens" | "apply" | "analyze" | "onRestore">;
  /** Already validated in shape by sites.ts; the plan itself is re-validated by the applier. */
  readSite(origin: string): Promise<SiteRecord | undefined>;
  isBlocked(): Promise<boolean>;
  /** Calls back once the DOM is parsed (immediately if it already is). */
  whenReady(cb: () => void): void;
  /** Runs after DOMContentLoaded only: pet, art and the diagnostics snapshot start here, never at document_start. */
  onApplied(site: SiteRecord): void;
  /**
   * Calls `cb` after a same-document navigation (a single-page app changing route) and returns the function that removes the listeners.
   * Bounded by NAV_REAPPLY_MAX. Optional so environments without navigation events still work.
   */
  onNavigate?(cb: () => void): () => void;
  /** A2: the state word of this document, each time it changes. */
  report?(state: AutoState): void;
}

/** A page that navigates without reloading re-applies the theme at most this many times per document. */
export const NAV_REAPPLY_MAX = 60;

export type AutoResult = "none" | "paused" | "blocked" | "invalid" | "tokens" | "full" | "changed" | "stopped";

const rolledBack = (reason: string): AutoState =>
  reason === "invalid-plan" ? "rolled-back-invalid-plan" : reason === "too-large" ? "rolled-back-too-large" : reason === "invariants" ? "rolled-back-invariants" : "rolled-back-error";

/** Extension-owned banner in a shadow root. Built with createElement and textContent only; Dismiss and Restore both remove it. */
export function showBanner(doc: Document, applier: Pick<Applier, "onRestore">): void {
  const host = doc.createElement("div");
  host.setAttribute("data-skinly-ui", "banner");
  const root = host.attachShadow({ mode: "open" });
  const css =
    ":host{all:initial}.bar{position:fixed;right:12px;bottom:12px;z-index:2147483647;max-width:280px;padding:10px 12px;border-radius:8px;" +
    "background:#1f2933;color:#fff;font:13px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.35)}" +
    ".bar p{margin:0 0 6px}.bar button{font:inherit;padding:3px 8px;border-radius:5px;cursor:pointer}";
  const bar = doc.createElement("div");
  bar.className = "bar";
  bar.setAttribute("role", "status");
  const title = doc.createElement("p");
  title.textContent = BANNER_TEXT;
  const hint = doc.createElement("p");
  hint.textContent = BANNER_HINT;
  const dismiss = doc.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "Dismiss";
  dismiss.addEventListener("click", () => host.remove());
  bar.append(title, hint, dismiss);
  adoptCss(doc, root, css);
  root.append(bar);
  doc.documentElement.append(host);
  applier.onRestore(() => host.remove());
}

/**
 * Auto-apply for a remembered site. Never calls a provider.
 * Step A (document_start, head and body may not exist yet): the stored colours go on at once through the adopted stylesheet. No guard,
 * no repair pass, no art: nothing there needs the body, so nothing can roll back for want of one.
 * Step B (DOMContentLoaded): region rules if the layout still matches the saved fingerprint (or the plan has none), otherwise tokens only
 * plus a banner; then pet and art. A same-document navigation reads the record again (a Restore or pause elsewhere stops it) and repeats
 * step B. Restore removes the navigation listeners and stops everything.
 */
export async function runAuto(deps: AutoDeps): Promise<AutoResult> {
  const report = (s: AutoState): void => {
    try {
      deps.report?.(s);
    } catch {
      // a report never breaks the page
    }
  };
  let site: SiteRecord | undefined;
  try {
    site = await deps.readSite(deps.origin);
  } catch {
    report("error-storage");
    return "none";
  }
  if (!site) {
    report("no-record");
    return "none";
  }
  if (!isAutoOn(site)) {
    report("paused");
    return "paused";
  }
  if (await deps.isBlocked()) {
    report("blocked");
    return "blocked";
  }

  let stopped = false;
  let unlisten: (() => void) | undefined;
  deps.applier.onRestore(() => {
    stopped = true;
    unlisten?.();
    unlisten = undefined;
  });

  const first = deps.applier.applyTokens(site.plan, site.repairCss);
  if (!first.ok) {
    report(rolledBack(first.reason));
    return "invalid";
  }
  report("applied");

  const settle = (rec: SiteRecord, banner: boolean): AutoResult => {
    try {
      // A plan made before the page was read has no regions: nothing to compare, colours only, never a banner.
      if (rec.plan.regionRules.length === 0) {
        const r = deps.applier.apply(rec.plan, rec.repairCss);
        if (r.ok) return "full";
        report(rolledBack(r.reason));
        return deps.applier.applyTokens(rec.plan, rec.repairCss).ok ? "tokens" : "invalid";
      }
      const page = deps.applier.analyze();
      if (page.status === "ok" && similar(rec.fingerprint, page.fingerprint)) {
        if (deps.applier.apply(rec.plan, rec.repairCss).ok) return "full";
        deps.applier.applyTokens(rec.plan, rec.repairCss);
        return "tokens";
      }
      deps.applier.applyTokens(rec.plan, rec.repairCss);
      if (page.status === "ok") {
        if (banner && !deps.doc.querySelector('[data-skinly-ui="banner"]')) showBanner(deps.doc, deps.applier);
        return "changed";
      }
      return "tokens";
    } catch {
      report("error-apply");
      return "tokens";
    }
  };

  const kept = site;
  return new Promise<AutoResult>((resolve) => {
    deps.whenReady(() => {
      if (stopped) return resolve("stopped");
      const result = settle(kept, true);
      if (result === "invalid") return resolve(result);
      try {
        deps.onApplied(kept);
      } catch {
        report("error-other");
      }
      resolve(result);
      // A single-page app swaps its content without a reload: put the theme back on the new route (page changes within a route are
      // already handled by the applier's own bounded observer). The record is read again, so a pause from the popup is honoured.
      let left = NAV_REAPPLY_MAX;
      unlisten = deps.onNavigate?.(() => {
        if (stopped || left-- <= 0) {
          unlisten?.();
          unlisten = undefined;
          return;
        }
        void deps
          .readSite(deps.origin)
          .then((rec) => {
            if (stopped) return;
            if (!isAutoOn(rec)) {
              report(rec ? "paused" : "no-record");
              unlisten?.();
              unlisten = undefined;
              return;
            }
            settle(rec!, false);
          })
          .catch(() => report("error-storage"));
      });
      if (stopped) unlisten?.();
    });
  });
}
