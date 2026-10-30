import { similar } from "../analyzer/fingerprint.ts";
import type { Applier } from "./applier-core.ts";
import type { SiteRecord } from "./sites.ts";

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
  onApplied(site: SiteRecord): void;
  /**
   * Calls `cb` after a same-document navigation (a single-page app changing route). Bounded by NAV_REAPPLY_MAX. Optional so
   * environments without navigation events still work.
   */
  onNavigate?(cb: () => void): void;
}

/** A page that navigates without reloading re-applies the theme at most this many times per document. */
export const NAV_REAPPLY_MAX = 60;

export type AutoResult = "none" | "blocked" | "invalid" | "tokens" | "full" | "changed";

/** Extension-owned banner in a shadow root. Built with createElement and textContent only; Dismiss and Restore both remove it. */
export function showBanner(doc: Document, applier: Pick<Applier, "onRestore">): void {
  const host = doc.createElement("div");
  host.setAttribute("data-skinly-ui", "banner");
  const root = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent =
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
  root.append(style, bar);
  doc.documentElement.append(host);
  applier.onRestore(() => host.remove());
}

/**
 * Auto-apply for a remembered site. Never calls a provider. Step A (document_start): global tokens only.
 * Step B (DOM ready): region rules if the layout still matches the saved fingerprint, otherwise tokens only plus a banner.
 */
export async function runAuto(deps: AutoDeps): Promise<AutoResult> {
  const site = await deps.readSite(deps.origin);
  if (!site || site.mode !== "auto") return "none";
  if (await deps.isBlocked()) return "blocked";

  const first = deps.applier.applyTokens(site.plan, site.repairCss);
  if (!first.ok) return "invalid";
  deps.onApplied(site);

  const settle = (banner: boolean): AutoResult => {
    try {
      const page = deps.applier.analyze();
      if (page.status === "ok" && similar(site.fingerprint, page.fingerprint)) {
        if (deps.applier.apply(site.plan, site.repairCss).ok) return "full";
        deps.applier.applyTokens(site.plan, site.repairCss);
        return "tokens";
      }
      deps.applier.applyTokens(site.plan, site.repairCss);
      if (page.status === "ok") {
        if (banner && !deps.doc.querySelector('[data-skinly-ui="banner"]')) showBanner(deps.doc, deps.applier);
        return "changed";
      }
      return "tokens";
    } catch {
      return "tokens";
    }
  };

  return new Promise<AutoResult>((resolve) => {
    deps.whenReady(() => {
      resolve(settle(true));
      // A single-page app swaps its content without a reload: put the theme back on the new route (page changes within a route
      // are already handled by the applier's own bounded observer).
      let left = NAV_REAPPLY_MAX;
      deps.onNavigate?.(() => {
        if (left-- <= 0) return;
        settle(false);
      });
    });
  });
}
