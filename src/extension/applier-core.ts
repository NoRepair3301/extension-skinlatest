import { analyze } from "../analyzer/analyze.ts";
import type { SummaryDeps } from "../analyzer/summary.ts";
import { NEUTRAL_PAGE, type Fingerprint, type RiskMarker, type StructuralSummary } from "../core/types.ts";
import { compare, snapshot } from "../plan/invariants.ts";
import { markerCleanup } from "./cleanup.ts";
import { validatePlan, type Strategy, type StylePlan, type Tokens } from "../plan/schema.ts";
import { themeToPlan } from "../plan/themeToPlan.ts";
import { DEFAULT_THEME_ID, getTheme, isBuiltinThemeId, isThemeChoice, resolveTheme, type BuiltinThemeId } from "../themes/index.ts";
import { createColorEngine, type EngineInstance, type EngineOptions } from "../engine/index.ts";

export interface StyleHandle {
  remove(): void;
  isAttached(): boolean;
}

/** Where compiled base CSS goes. The real host uses one constructable stylesheet. */
export interface StyleHost {
  add(css: string): StyleHandle;
}

export interface ApplierOptions {
  style: StyleHost;
  summaryDeps?: SummaryDeps;
  observer?: unknown;
  engineOptions?: EngineOptions;
  tokensOnly?: boolean;
  beforeInvariants?: () => void;
}

export type ApplyResult =
  | { ok: true; themeId: string; regions: number; strategy: Strategy; steppedDown: boolean; repairs: number; samples: number }
  | { ok: false; reason: "invalid-plan" | "too-large" | "invariants" | "bad-theme" | "error"; detail?: string[] };

/** What the page tells the extension about itself: the summary and risk, nothing else. */
export type PageAnalysis = { status: "ok"; risk: RiskMarker[]; summary: StructuralSummary; fingerprint: Fingerprint } | { status: "too-large"; risk: RiskMarker[] };

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
  let activeEngine: EngineInstance | undefined;
  let shown: { themeId: string; strategy: Strategy } | undefined;
  let currentTags: Array<{ el: Element; id: string; previous: string | null }> = [];
  const restoreHooks: Array<() => void> = [];

  function restore(withHooks = true): { ok: true } {
    const hadEngine = activeEngine !== undefined;
    if (activeEngine) {
      activeEngine.restore();
      activeEngine = undefined;
    }
    for (const { el, previous } of currentTags) {
      if (previous === null) el.removeAttribute("data-skinly-r");
      else el.setAttribute("data-skinly-r", previous);
    }
    currentTags = [];
    shown = undefined;
    if (!hadEngine && withHooks) {
      markerCleanup(doc);
    }
    if (withHooks) {
      for (const hook of restoreHooks) hook();
    }
    return { ok: true };
  }

  function run(source: PlanSource, tokensOnly = opts.tokensOnly ?? false): ApplyResult {
    restore(false);
    try {
      const before = snapshot(doc);
      const analysis = tokensOnly ? undefined : analyze(doc, opts.summaryDeps);
      const summary = analysis?.status === "ok" ? analysis.summary : undefined;
      const chosen = typeof source === "function" ? source(summary) : source;

      const plan: StylePlan = tokensOnly ? { ...chosen, regionRules: [], strategy: (chosen.strategy ?? "safe") === "full" ? "safe" : (chosen.strategy ?? "safe") } : chosen;

      if (!summary && plan.regionRules.length > 0) {
        return { ok: false, reason: "too-large" };
      }

      const checked = validatePlan(plan, summary ?? EMPTY_SUMMARY);
      if (!checked.ok) return { ok: false, reason: "invalid-plan", detail: checked.errors };

      const themeId: BuiltinThemeId = checked.plan.themeId && isBuiltinThemeId(checked.plan.themeId) ? checked.plan.themeId : DEFAULT_THEME_ID;
      const theme = getTheme(themeId);
      const tokens: Tokens = checked.plan.tokens ?? theme.tokens;

      const engine = createColorEngine(doc, { id: themeId, tokens }, {
        styleHost: opts.style,
        ...opts.engineOptions,
      });

      engine.apply();
      activeEngine = engine;

      if (analysis?.status === "ok") {
        const byId = new Map(analysis.regions.map((r) => [r.id, r.el]));
        for (const rule of plan.regionRules) {
          const el = byId.get(rule.region);
          if (!el) {
            restore(false);
            return { ok: false, reason: "invalid-plan", detail: ["region missing on page"] };
          }
          currentTags.push({ el, id: rule.region, previous: el.getAttribute("data-skinly-r") });
          el.setAttribute("data-skinly-r", rule.region);
        }
      }

      opts.beforeInvariants?.();
      const bad = compare(before, snapshot(doc));
      if (bad.length > 0) {
        restore(false);
        return { ok: false, reason: "invariants", detail: bad };
      }

      shown = { themeId, strategy: plan.strategy ?? "full" };
      return {
        ok: true,
        themeId,
        regions: currentTags.length,
        strategy: plan.strategy ?? "full",
        steppedDown: false,
        repairs: 0,
        samples: engine.modifiedCount(),
      };
    } catch {
      restore(false);
      return { ok: false, reason: "error" };
    }
  }

  return {
    apply: (plan: StylePlan): ApplyResult => run(plan, opts.tokensOnly ?? false),
    applyTokens: (plan: StylePlan): ApplyResult => run(plan, true),
    onRestore(fn: () => void): void {
      restoreHooks.push(fn);
    },
    applyTheme(id: string): ApplyResult {
      if (!isThemeChoice(id)) return { ok: false, reason: "bad-theme" };
      const dark = doc.defaultView?.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
      const resolved = resolveTheme(id, dark);
      return run(themeToPlan(resolved));
    },
    analyze: (): PageAnalysis => {
      const a = analyze(doc, opts.summaryDeps);
      return a.status === "ok" ? { status: "ok", risk: a.risk, summary: a.summary, fingerprint: a.fingerprint } : { status: "too-large", risk: a.risk };
    },
    restore,
    isActive: (): boolean => activeEngine !== undefined && activeEngine.isActive(),
    shownTheme: (): { themeId: string; strategy: Strategy } | undefined => (activeEngine?.isActive() ? shown : undefined),
  };
}

export type Applier = ReturnType<typeof createApplier>;
