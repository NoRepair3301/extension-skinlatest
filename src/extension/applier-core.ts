import { analyze } from "../analyzer/analyze.ts";
import type { SummaryDeps } from "../analyzer/summary.ts";
import type { StructuralSummary } from "../core/types.ts";
import { compileCss } from "../plan/compile.ts";
import { compare, snapshot } from "../plan/invariants.ts";
import { validatePlan, type StylePlan } from "../plan/schema.ts";
import { themeToPlan } from "../plan/themeToPlan.ts";
import { isBuiltinThemeId } from "../themes/index.ts";
import { createBoundedObserver, type BoundedObserver, type ObserverOptions } from "./observer.ts";

export interface StyleHandle {
  remove(): void;
  isAttached(): boolean;
}

/** Where compiled CSS goes. The real host uses one constructable stylesheet. */
export interface StyleHost {
  add(css: string): StyleHandle;
}

export interface ApplierOptions {
  style: StyleHost;
  summaryDeps?: SummaryDeps;
  observer?: ObserverOptions;
  /** Test hook, runs just before the invariants are checked. */
  beforeInvariants?: () => void;
}

export type ApplyResult =
  | { ok: true; themeId: string; regions: number }
  | { ok: false; reason: "invalid-plan" | "too-large" | "invariants" | "bad-theme" | "error"; detail?: string[] };

interface Ledger {
  tags: Array<{ el: Element; id: string; previous: string | null }>;
  htmlPrevious: string | null;
  sheet: StyleHandle;
  css: string;
  observer: BoundedObserver | undefined;
}

const EMPTY_SUMMARY: StructuralSummary = {
  v: 1,
  viewport: { w: 0, h: 0 },
  palette: [],
  fonts: [],
  counts: { nodes: 0, links: 0, forms: 0, tables: 0, images: 0, headings: 0, iframes: 0 },
  risk: [],
  regions: [],
};

type PlanSource = StylePlan | ((summary: StructuralSummary | undefined) => StylePlan);

export function createApplier(doc: Document, opts: ApplierOptions) {
  let ledger: Ledger | undefined;

  const html = doc.documentElement;

  /** Removes everything we added. Safe to call at any time, any number of times. */
  function restore(): { ok: true } {
    const l = ledger;
    ledger = undefined;
    if (!l) return { ok: true };
    l.observer?.disconnect();
    l.sheet.remove();
    for (const { el, previous } of l.tags) {
      if (previous === null) el.removeAttribute("data-skinly-r");
      else el.setAttribute("data-skinly-r", previous);
    }
    if (l.htmlPrevious === null) html.removeAttribute("data-skinly");
    else html.setAttribute("data-skinly", l.htmlPrevious);
    return { ok: true };
  }

  /** Light integrity check after page changes: put back what the page removed. Our changes cannot alter the invariants. */
  function recheck(): void {
    const l = ledger;
    if (!l) return;
    if (html.getAttribute("data-skinly") !== "on") html.setAttribute("data-skinly", "on");
    l.tags = l.tags.filter(({ el }) => el.isConnected);
    for (const { el, id } of l.tags) if (el.getAttribute("data-skinly-r") !== id) el.setAttribute("data-skinly-r", id);
    if (!l.sheet.isAttached()) l.sheet = opts.style.add(l.css);
  }

  function run(source: PlanSource): ApplyResult {
    restore();
    try {
      const before = snapshot(doc);
      const analysis = analyze(doc, opts.summaryDeps);
      const summary = analysis.status === "ok" ? analysis.summary : undefined;
      const plan = typeof source === "function" ? source(summary) : source;

      if (!summary && plan.regionRules.length > 0) return { ok: false, reason: "too-large" };
      const checked = validatePlan(plan, summary ?? EMPTY_SUMMARY);
      if (!checked.ok) return { ok: false, reason: "invalid-plan", detail: checked.errors };

      const css = compileCss(checked.plan, summary ?? EMPTY_SUMMARY);
      const next: Ledger = {
        tags: [],
        htmlPrevious: html.getAttribute("data-skinly"),
        sheet: { remove() {}, isAttached: () => false },
        css,
        observer: undefined,
      };
      ledger = next;

      if (analysis.status === "ok") {
        const byId = new Map(analysis.regions.map((r) => [r.id, r.el]));
        for (const rule of checked.plan.regionRules) {
          const el = byId.get(rule.region);
          if (!el) {
            restore();
            return { ok: false, reason: "invalid-plan", detail: ["region missing on page"] };
          }
          next.tags.push({ el, id: rule.region, previous: el.getAttribute("data-skinly-r") });
          el.setAttribute("data-skinly-r", rule.region);
        }
      }
      html.setAttribute("data-skinly", "on");
      next.sheet = opts.style.add(css);

      opts.beforeInvariants?.();
      const bad = compare(before, snapshot(doc));
      if (bad.length > 0) {
        restore();
        return { ok: false, reason: "invariants", detail: bad };
      }

      if (doc.body) next.observer = createBoundedObserver(doc, doc.body, recheck, opts.observer);
      return { ok: true, themeId: checked.plan.themeId, regions: next.tags.length };
    } catch {
      restore();
      return { ok: false, reason: "error" };
    }
  }

  return {
    apply: (plan: StylePlan): ApplyResult => run(plan),
    applyTheme(id: string): ApplyResult {
      if (!isBuiltinThemeId(id)) return { ok: false, reason: "bad-theme" };
      return run((summary) => themeToPlan(id, summary));
    },
    restore,
    isActive: (): boolean => ledger !== undefined,
  };
}

export type Applier = ReturnType<typeof createApplier>;
