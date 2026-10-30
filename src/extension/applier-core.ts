import { analyze } from "../analyzer/analyze.ts";
import type { SummaryDeps } from "../analyzer/summary.ts";
import { NEUTRAL_PAGE, type Fingerprint, type RiskMarker, type StructuralSummary } from "../core/types.ts";
import { compileCss } from "../plan/compile.ts";
import { contrastFailures } from "../plan/contrast.ts";
import { compare, snapshot } from "../plan/invariants.ts";
import { captureMedia, checkVisual, type GuardCode, type GuardProvider } from "../plan/guard.ts";
import { stepDown, validatePlan, type Strategy, type StylePlan } from "../plan/schema.ts";
import { themeToPlan } from "../plan/themeToPlan.ts";
import { isThemeChoice, resolveTheme } from "../themes/index.ts";
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
  /**
   * Frame mode: never analyse the page and apply the plan's tokens only (no region rules). A frame's regions are not the top
   * page's regions, so the top page's plan can only carry colours, fonts and sizes into it.
   */
  tokensOnly?: boolean;
  /** Visual guard: reads computed style after the theme is on, steps down the strategy ladder on a failure, then rolls back. */
  guard?: GuardProvider;
  /** Test hook, runs just before the invariants are checked. */
  beforeInvariants?: () => void;
}

export type ApplyResult =
  | { ok: true; themeId: string; regions: number; strategy: Strategy; steppedDown: boolean }
  | { ok: false; reason: "invalid-plan" | "too-large" | "invariants" | "bad-theme" | "visual" | "error"; detail?: string[] };

export type VisualCode = GuardCode;

/** What the page tells the extension about itself: the summary and risk, nothing else. */
export type PageAnalysis = { status: "ok"; risk: RiskMarker[]; summary: StructuralSummary; fingerprint: Fingerprint } | { status: "too-large"; risk: RiskMarker[] };

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
  page: NEUTRAL_PAGE,
  regions: [],
};

type PlanSource = StylePlan | ((summary: StructuralSummary | undefined) => StylePlan);

export function createApplier(doc: Document, opts: ApplierOptions) {
  let ledger: Ledger | undefined;
  const restoreHooks: Array<() => void> = [];

  const html = doc.documentElement;

  /** Removes everything we added. Safe to call at any time, any number of times. */
  function restore(): { ok: true } {
    const l = ledger;
    ledger = undefined;
    for (const hook of restoreHooks) hook();
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

  /** `tokensOnly` skips the page analysis (used at document_start, before the body exists) and applies no region rules. */
  function run(source: PlanSource, tokensOnly = opts.tokensOnly ?? false): ApplyResult {
    restore();
    try {
      const before = snapshot(doc);
      const media = opts.guard && !tokensOnly && doc.body ? captureMedia(opts.guard) : undefined;
      const analysis = tokensOnly ? undefined : analyze(doc, opts.summaryDeps);
      const summary = analysis?.status === "ok" ? analysis.summary : undefined;
      const chosen = typeof source === "function" ? source(summary) : source;
      const plan = tokensOnly ? { ...chosen, regionRules: [] } : chosen;

      if (!summary && plan.regionRules.length > 0) return { ok: false, reason: "too-large" };
      const checked = validatePlan(plan, summary ?? EMPTY_SUMMARY);
      if (!checked.ok) return { ok: false, reason: "invalid-plan", detail: checked.errors };

      if (contrastFailures(checked.plan.themeId, checked.plan.tokens).length > 0) return { ok: false, reason: "invalid-plan", detail: ["contrast"] };

      const css = compileCss(checked.plan, summary ?? EMPTY_SUMMARY);
      const next: Ledger = {
        tags: [],
        htmlPrevious: html.getAttribute("data-skinly"),
        sheet: { remove() {}, isAttached: () => false },
        css,
        observer: undefined,
      };
      ledger = next;

      if (analysis?.status === "ok") {
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

      let strategy: Strategy = checked.plan.strategy ?? "full";
      let steppedDown = false;
      if (opts.guard && media) {
        let seen = checkVisual(opts.guard, media);
        const lower = seen.ok ? undefined : stepDown(strategy);
        if (!seen.ok && lower) {
          next.sheet.remove();
          strategy = lower;
          steppedDown = true;
          next.css = compileCss({ ...checked.plan, strategy }, summary ?? EMPTY_SUMMARY);
          next.sheet = opts.style.add(next.css);
          seen = checkVisual(opts.guard, media);
        }
        if (!seen.ok) {
          restore();
          return { ok: false, reason: "visual", detail: [seen.code] };
        }
      }

      if (doc.body) next.observer = createBoundedObserver(doc, doc.body, recheck, opts.observer);
      return { ok: true, themeId: checked.plan.themeId, regions: next.tags.length, strategy, steppedDown };
    } catch {
      restore();
      return { ok: false, reason: "error" };
    }
  }

  return {
    apply: (plan: StylePlan): ApplyResult => run(plan),
    /** Global tokens only, no page analysis: safe at document_start. */
    applyTokens: (plan: StylePlan): ApplyResult => run(plan, true),
    /** Runs `fn` whenever Restore removes our changes (used by the extension-owned banner). */
    onRestore(fn: () => void): void {
      restoreHooks.push(fn);
    },
    applyTheme(id: string): ApplyResult {
      if (!isThemeChoice(id)) return { ok: false, reason: "bad-theme" };
      // "auto" follows the page's colour-scheme preference (the browser's setting).
      const dark = doc.defaultView?.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
      const resolved = resolveTheme(id, dark);
      return run((summary) => themeToPlan(resolved, summary));
    },
    analyze: (): PageAnalysis => {
      const a = analyze(doc, opts.summaryDeps);
      return a.status === "ok" ? { status: "ok", risk: a.risk, summary: a.summary, fingerprint: a.fingerprint } : { status: "too-large", risk: a.risk };
    },
    restore,
    isActive: (): boolean => ledger !== undefined,
  };
}

export type Applier = ReturnType<typeof createApplier>;
