import { analyze } from "../analyzer/analyze.ts";
import type { SummaryDeps } from "../analyzer/summary.ts";
import { NEUTRAL_PAGE, type Fingerprint, type RiskMarker, type StructuralSummary } from "../core/types.ts";
import { compileCss } from "../plan/compile.ts";
import { contrastFailures } from "../plan/contrast.ts";
import { repairTokens } from "../plan/repair.ts";
import { compare, snapshot } from "../plan/invariants.ts";
import { captureMedia, mediaIntact, type GuardProvider } from "../plan/guard.ts";
import { markerCleanup } from "./cleanup.ts";
import { addFailures, audit, compileRepair, parseRepairCss, repairCss, snapshotText, validateRepair, type Failure, type RuleBook, type Snapshot, type ValidRepairPlan } from "../plan/readability.ts";
import { buildRepairPayload, type RepairPayload } from "../features/repair/payload.ts";
import { stepDown, validatePlan, type Strategy, type StylePlan, type Tokens } from "../plan/schema.ts";
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
  /**
   * Readability pipeline: reads computed style before and after the theme goes on and repairs unreadable text with colour-only rules.
   * It never refuses or rolls back a theme; only media that changed steps the strategy down.
   */
  guard?: GuardProvider;
  /** Test hook, runs just before the invariants are checked. */
  beforeInvariants?: () => void;
}

export type ApplyResult =
  | { ok: true; themeId: string; regions: number; strategy: Strategy; steppedDown: boolean; repairs: number; samples: number }
  | { ok: false; reason: "invalid-plan" | "too-large" | "invariants" | "bad-theme" | "error"; detail?: string[] };


/** What the page tells the extension about itself: the summary and risk, nothing else. */
export type PageAnalysis = { status: "ok"; risk: RiskMarker[]; summary: StructuralSummary; fingerprint: Fingerprint } | { status: "too-large"; risk: RiskMarker[] };

interface Ledger {
  tags: Array<{ el: Element; id: string; previous: string | null }>;
  htmlPrevious: string | null;
  sheet: StyleHandle;
  css: string;
  observer: BoundedObserver | undefined;
  /** Readability state: originals, cumulative repair rules and their sheet. */
  snap: Snapshot | undefined;
  tokens: Tokens | undefined;
  book: RuleBook;
  repairSheet: StyleHandle | undefined;
  repairCss: string;
  passes: number;
  lastPass: number;
  /** First pass numbers, for the success line and the AI repair threshold. */
  checked: number;
  failing: Failure[];
  /** The elements of the last repair payload, by index. */
  targets: Element[];
  targetBgs: string[];
}

/** After this many repair passes in one page load, a pass runs at most once every REPAIR_GAP_MS. */
export const REPAIR_PASSES_FREE = 10;
export const REPAIR_GAP_MS = 5000;

export interface RepairStats {
  /** Text elements that were sampled. */
  samples: number;
  /** Rules in the repair sheet. */
  repairs: number;
  /** Elements that needed repair on the first pass. */
  failing: number;
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
  /** The theme and strategy of the last successful apply (for the diagnostics; ids only). Only meaningful while a ledger exists. */
  let shown: { themeId: string; strategy: Strategy } | undefined;
  const restoreHooks: Array<() => void> = [];

  const html = doc.documentElement;

  /**
   * Removes everything we added. Safe to call at any time, any number of times. The restore hooks (pet, scene, blur, banner) run only on a
   * real Restore; re-applying a theme (or rolling one back) keeps them, so art shown by the auto script survives the second apply.
   */
  function restore(withHooks = true): { ok: true } {
    const l = ledger;
    ledger = undefined;
    // No ledger (a fresh script instance, a navigated page): remove whatever carries our markers.
    if (!l && withHooks) markerCleanup(doc);
    if (withHooks) for (const hook of restoreHooks) hook();
    if (!l) return { ok: true };
    l.observer?.disconnect();
    l.sheet.remove();
    l.repairSheet?.remove();
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
    if (l.repairSheet && !l.repairSheet.isAttached()) l.repairSheet = opts.style.add(l.repairCss);
    // The page re-rendered: look again, at most REPAIR_PASSES_FREE times, then once per REPAIR_GAP_MS.
    const t = Date.now();
    if (l.passes < REPAIR_PASSES_FREE || t - l.lastPass >= REPAIR_GAP_MS) repairPass(l);
  }

  /** Sets the repair sheet to the current rule book (adds, replaces or removes it). */
  function syncRepairSheet(l: Ledger): void {
    const css = repairCss(l.book);
    if (css === l.repairCss && (css === "" || l.repairSheet?.isAttached())) return;
    l.repairSheet?.remove();
    l.repairSheet = css === "" ? undefined : opts.style.add(css);
    l.repairCss = css;
  }

  /** One look at the page: every sampled text pair under 4.5 gets a colour-only rule (or its original colours back). */
  function repairPass(l: Ledger): void {
    if (!opts.guard || !l.snap || !l.tokens) return;
    l.passes++;
    l.lastPass = Date.now();
    const a = audit(opts.guard, l.snap, l.tokens);
    if (l.passes === 1) {
      l.checked = a.checked;
      l.failing = a.failures;
    }
    if (a.failures.length > 0) {
      addFailures(l.book, a.failures);
      syncRepairSheet(l);
    }
  }

  /** `tokensOnly` skips the page analysis (used at document_start, before the body exists) and applies no region rules. */
  function run(source: PlanSource, tokensOnly = opts.tokensOnly ?? false, seedCss?: string): ApplyResult {
    restore(false);
    try {
      const before = snapshot(doc);
      const checking = opts.guard && !tokensOnly && doc.body ? opts.guard : undefined;
      const media = checking ? captureMedia(checking) : undefined;
      const snap = checking ? snapshotText(checking) : undefined;
      const analysis = tokensOnly ? undefined : analyze(doc, opts.summaryDeps);
      const summary = analysis?.status === "ok" ? analysis.summary : undefined;
      const chosen = typeof source === "function" ? source(summary) : source;
      // A tokens-only apply is never visually checked (no body yet), so it never goes beyond the safe strategy.
      const plan: StylePlan = tokensOnly ? { ...chosen, regionRules: [], strategy: (chosen.strategy ?? "safe") === "full" ? "safe" : (chosen.strategy ?? "safe") } : chosen;

      if (!summary && plan.regionRules.length > 0) return { ok: false, reason: "too-large" };
      const checked = validatePlan(plan, summary ?? EMPTY_SUMMARY);
      if (!checked.ok) return { ok: false, reason: "invalid-plan", detail: checked.errors };

      // Colours that miss the contrast targets are nudged; if that is not enough the theme still goes on and the readability pass repairs the text.
      if (contrastFailures(checked.plan.themeId, checked.plan.tokens).length > 0) {
        const fixed = repairTokens(checked.plan.themeId, checked.plan.tokens);
        if (fixed) checked.plan = { ...checked.plan, tokens: fixed };
      }

      const css = compileCss(checked.plan, summary ?? EMPTY_SUMMARY);
      const next: Ledger = {
        tags: [],
        htmlPrevious: html.getAttribute("data-skinly"),
        sheet: { remove() {}, isAttached: () => false },
        css,
        observer: undefined,
        snap,
        tokens: undefined,
        book: new Map(),
        repairSheet: undefined,
        repairCss: "",
        passes: 0,
        lastPass: 0,
        checked: 0,
        failing: [],
        targets: [],
        targetBgs: [],
      };
      ledger = next;

      if (analysis?.status === "ok") {
        const byId = new Map(analysis.regions.map((r) => [r.id, r.el]));
        for (const rule of checked.plan.regionRules) {
          const el = byId.get(rule.region);
          if (!el) {
            restore(false);
            return { ok: false, reason: "invalid-plan", detail: ["region missing on page"] };
          }
          next.tags.push({ el, id: rule.region, previous: el.getAttribute("data-skinly-r") });
          el.setAttribute("data-skinly-r", rule.region);
        }
      }
      html.setAttribute("data-skinly", "on");
      next.sheet = opts.style.add(css);
      // Repair rules stored with a remembered site: in place before the first paint, re-checked by the pass below.
      const seeded = seedCss === undefined ? undefined : parseRepairCss(seedCss);
      if (seeded) {
        for (const [k, v] of seeded) next.book.set(k, v);
        syncRepairSheet(next);
      }

      opts.beforeInvariants?.();
      const bad = compare(before, snapshot(doc));
      if (bad.length > 0) {
        restore(false);
        return { ok: false, reason: "invariants", detail: bad };
      }

      let strategy: Strategy = checked.plan.strategy ?? "full";
      let steppedDown = false;
      if (checking && media) {
        // Pictures first: a theme that changed how media shows steps down the ladder (never a refusal).
        for (let lower = stepDown(strategy); !mediaIntact(checking, media) && lower; lower = stepDown(strategy)) {
          next.sheet.remove();
          strategy = lower;
          steppedDown = true;
          next.css = compileCss({ ...checked.plan, strategy }, summary ?? EMPTY_SUMMARY);
          next.sheet = opts.style.add(next.css);
        }
        // Then text: whatever does not read gets a colour-only repair. The theme stays.
        next.tokens = checked.plan.tokens;
        repairPass(next);
      }

      if (doc.body) next.observer = createBoundedObserver(doc, doc.body, recheck, opts.observer);
      shown = { themeId: checked.plan.themeId, strategy };
      return { ok: true, themeId: checked.plan.themeId, regions: next.tags.length, strategy, steppedDown, repairs: next.book.size, samples: next.checked };
    } catch {
      restore(false);
      return { ok: false, reason: "error" };
    }
  }

  return {
    apply: (plan: StylePlan, seedCss?: string): ApplyResult => run(plan, undefined, seedCss),
    /** Global tokens only, no page analysis: safe at document_start. */
    applyTokens: (plan: StylePlan, seedCss?: string): ApplyResult => run(plan, true, seedCss),
    /** The repair rules in force now (colour-only structural CSS), for storing with a remembered site. */
    repairRules: (): string => ledger?.repairCss ?? "",
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
    /** Theme id and strategy now on the page, for the diagnostics. Undefined when no theme is on. */
    shownTheme: (): { themeId: string; strategy: Strategy } | undefined => (ledger ? shown : undefined),
    /** Numbers for the success line and the AI repair threshold. */
    repairStats: (): RepairStats => ({ samples: ledger?.checked ?? 0, repairs: ledger?.book.size ?? 0, failing: ledger?.failing.length ?? 0 }),
    /**
     * The sanitised description of the parts that needed repair (see src/features/repair/payload.ts). Colours, class tokens and
     * colour declarations only. It remembers which element is which so a RepairPlan can name them by index.
     */
    repairPayload(): RepairPayload | undefined {
      const l = ledger;
      if (!l || !opts.guard || l.failing.length === 0) return undefined;
      const built = buildRepairPayload(doc, l.failing);
      l.targets = built.targets;
      l.targetBgs = built.payload.elements.map((e) => e.bg);
      return built.payload;
    },
    /** Applies the AI's repair answer after validating it again against the elements of the last payload. */
    applyRepair(input: unknown): { ok: boolean; applied: number } {
      const l = ledger;
      if (!l || l.targets.length === 0) return { ok: false, applied: 0 };
      const v = validateRepair(input, l.targetBgs);
      if (!v.ok) return { ok: false, applied: 0 };
      const applied = compileRepair(v.plan as ValidRepairPlan, l.targets, l.book);
      syncRepairSheet(l);
      return { ok: true, applied };
    },
  };
}

export type Applier = ReturnType<typeof createApplier>;
