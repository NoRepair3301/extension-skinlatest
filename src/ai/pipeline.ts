import { checkUrl } from "../analyzer/eligibility.ts";
import { decideGate } from "../analyzer/gate.ts";
import { CONSENT_VERSION, REPAIR_CONSENT_VERSION, DAILY_AI_CALLS, MIN_CALL_GAP_MS, PROVIDER_NAMES, PROVIDER_TIMEOUTS, type ProviderId } from "../config.ts";
import type { BlockReason, Fingerprint, StructuralSummary } from "../core/types.ts";
import { debug } from "../core/log.ts";
import type { RepairPayload } from "../features/repair/payload.ts";
import { originOf } from "../extension/origin.ts";
import { validateRepair } from "../plan/readability.ts";
import { buildRepairMessage, REPAIR_SCHEMA, REPAIR_SYSTEM } from "./repair.ts";
import type { ApplyResult, PageAnalysis } from "../extension/applier-core.ts";
import { callsOn, type Settings } from "../extension/settings.ts";
import { contrastFailures } from "../plan/contrast.ts";
import { nearestTheme } from "../plan/nearestTheme.ts";
import { repairTokens } from "../plan/repair.ts";
import { validatePlan, type StylePlan } from "../plan/schema.ts";
import { themeToPlan } from "../plan/themeToPlan.ts";
import { generate, PIPELINE_BUDGET_MS, type ProviderEntry } from "../providers/registry.ts";
import type { ErrorKind, Provider } from "../providers/types.ts";
import { isBuiltinThemeId, resolveTheme, type BuiltinThemeId } from "../themes/index.ts";
import { aiApplyFailureMessage, applyFailureMessage, authFailed, blockedMessage, busy, MSG, rateLimited } from "./messages.ts";
import { buildUserMessage, styleSchema, systemPrompt } from "./prompt.ts";
import { clampPlan, clampThemeId, entitledThemes, type PlanFlag } from "../core/entitlements.ts";

/** The page side, reached through scripting. Implemented in src/extension/flow.ts; faked in tests. */
export interface PageClient {
  analyze(): Promise<PageAnalysis>;
  applyTheme(id: BuiltinThemeId): Promise<ApplyResult | undefined>;
  applyPlan(plan: StylePlan): Promise<ApplyResult | undefined>;
  restore(): Promise<void>;
  /** Optional: the sanitised description of the parts that needed repair, and the way to apply the AI's answer. */
  repairPayload?(): Promise<RepairPayload | undefined>;
  applyRepair?(json: unknown): Promise<{ ok: boolean; applied: number } | undefined>;
}

export type Step = "checking" | "baseline" | "analysing" | "consent" | "asking" | "applying" | "repairing";

export interface ConsentRequest {
  /** layout: the page summary (default). repair: colour details of unreadable parts. */
  purpose?: "layout" | "repair";
  providerNames: string[];
  /** The exact JSON that would be sent. Shown read-only. */
  payload: string;
}

export interface CallClock {
  /** Time of the last AI call, 0 if none yet. Lives for the life of the popup/service worker. */
  lastAt: number;
}

export interface PipelineDeps {
  page: PageClient;
  providers: Record<ProviderId, Provider>;
  loadSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  keyStatus(): Promise<Record<ProviderId, boolean>>;
  askConsent(req: ConsentRequest): Promise<boolean>;
  /** Second consent, asked once per site (REPAIR_CONSENT_VERSION). Without it no repair request is made. */
  askRepairConsent?(req: ConsentRequest): Promise<boolean>;
  clock: CallClock;
  /** For the "auto" theme: does the browser prefer a dark colour scheme? Default no. */
  prefersDark?(): boolean;
  /** The plan flag (src/extension/planFlag.ts). Plus-only themes are clamped and never offered to the AI without Plus. Default plus (tests). */
  loadPlan?(): Promise<PlanFlag>;
  onStep?(step: Step, detail?: string): void;
  now?(): number;
  today?(): string;
  budgetMs?: number;
}

export type BaselineWhy = "no-ai-page" | "too-large" | "no-key" | "consent-declined" | "limit-daily" | "limit-gap" | "ai-unavailable" | "apply-failed";

export type Outcome =
  | { kind: "blocked"; reason: BlockReason; message: string }
  | { kind: "baseline"; themeId: BuiltinThemeId; why: BaselineWhy; message: string; plan?: StylePlan; fingerprint?: Fingerprint; fixes?: number }
  | { kind: "preview"; source: "ai" | "fallback"; plan: StylePlan; baselineThemeId: BuiltinThemeId; fingerprint: Fingerprint; providerId?: ProviderId; model?: string; message?: string; fixes?: number }
  | { kind: "error"; errorKind: ErrorKind | "baseline"; message: string; themeId: BuiltinThemeId }
  | { kind: "cancelled"; themeId: BuiltinThemeId };

export type PlanCheck = { ok: true; plan: StylePlan; repaired: boolean } | { ok: false; codes: string[] };

/**
 * Validator (schema, eligibility) then contrast targets. A plan whose colours miss a target is first repaired by nudging
 * its foreground colours (src/plan/repair.ts); only when that cannot work are reason codes returned, which lead to the
 * repair request and then the nearest built-in theme. Reason codes are paths only and never contain plan values.
 */
export function checkPlan(json: unknown, summary: StructuralSummary): PlanCheck {
  const v = validatePlan(json, summary);
  if (!v.ok) return { ok: false, codes: v.errors.slice(0, 10).map((e) => e.split(":")[0] ?? "plan") };
  const bad = contrastFailures(v.plan.themeId, v.plan.tokens);
  if (bad.length === 0) return { ok: true, plan: v.plan, repaired: false };
  const fixed = repairTokens(v.plan.themeId, v.plan.tokens);
  if (fixed) return { ok: true, plan: { ...v.plan, tokens: fixed }, repaired: true };
  // Never refused for readability: the theme goes on and the page-side readability pass repairs the text.
  return { ok: true, plan: v.plan, repaired: false };
}

/**
 * The whole "Change my page" flow. Every provider answer goes validate (schema, contrast, eligibility) -> compile -> apply;
 * nothing else reaches the page. Any failure leaves the page at the built-in baseline.
 */
export async function transform(url: string, deps: PipelineDeps, signal?: AbortSignal): Promise<Outcome> {
  const now = deps.now ?? (() => Date.now());
  const today = deps.today ?? (() => new Date().toISOString().slice(0, 10));
  const started = now();
  const step = (s: Step, detail?: string) => {
    debug("step", s);
    deps.onStep?.(s, detail);
  };

  step("checking");
  const settings = await deps.loadSettings();
  const elig = checkUrl(url, settings.blocklist);
  if (!elig.allowed) return { kind: "blocked", reason: elig.reason, message: blockedMessage(elig.reason) };

  const plan: PlanFlag = deps.loadPlan ? await deps.loadPlan().catch((): PlanFlag => "free") : "plus";
  const baselineId = clampThemeId(resolveTheme(settings.theme, deps.prefersDark?.() ?? false), plan);
  /** Set once the page was analysed: the built-in theme as a plan, so the popup can offer to keep it. */
  const known: { plan?: StylePlan; fingerprint?: Fingerprint } = {};
  let fixCount = 0;
  const baseline = (why: BaselineWhy, message: string): Outcome => ({ kind: "baseline", themeId: baselineId, why, message, ...known, ...(fixCount > 0 ? { fixes: fixCount } : {}) });

  step("baseline");
  const applied = await deps.page.applyTheme(baselineId);
  if (applied?.ok) fixCount = applied.repairs;
  if (!applied?.ok) return { kind: "error", errorKind: "baseline", message: applyFailureMessage(applied), themeId: baselineId };
  if (signal?.aborted) return { kind: "cancelled", themeId: baselineId };

  step("analysing");
  const analysis = await deps.page.analyze();
  const gate = decideGate({ url, blocklist: settings.blocklist, risk: analysis.risk, tooLarge: analysis.status === "too-large" });
  if (gate.kind === "blocked") return { kind: "blocked", reason: gate.reason, message: blockedMessage(gate.reason) };
  if (analysis.status !== "ok") return baseline("too-large", MSG.tooLarge);
  const summary = analysis.summary;
  Object.assign(known, { plan: themeToPlan(baselineId, summary), fingerprint: analysis.fingerprint });
  if (gate.kind === "no-ai") return baseline("no-ai-page", MSG.noAi);

  const keys = await deps.keyStatus();
  const order = settings.order.filter((id) => keys[id]);
  if (order.length === 0) return baseline("no-key", MSG.noKey);

  if (callsOn(settings, today()) >= DAILY_AI_CALLS) return baseline("limit-daily", MSG.dailyLimit);
  if (deps.clock.lastAt !== 0 && now() - deps.clock.lastAt < MIN_CALL_GAP_MS) return baseline("limit-gap", MSG.gap);

  const payload = buildUserMessage(summary);
  let current = settings;
  if (current.consent?.version !== CONSENT_VERSION) {
    step("consent");
    const ok = await deps.askConsent({ providerNames: order.map((id) => PROVIDER_NAMES[id]), payload });
    if (!ok) return baseline("consent-declined", MSG.declined);
    current = { ...current, consent: { version: CONSENT_VERSION, acceptedAt: new Date(now()).toISOString() } };
  }
  if (signal?.aborted) return { kind: "cancelled", themeId: baselineId };

  const date = today();
  current = { ...current, aiCallsToday: { date, count: callsOn(current, date) + 1 } };
  await deps.saveSettings(current);
  deps.clock.lastAt = now();

  step("asking", PROVIDER_NAMES[order[0]!]);
  let validPlan: StylePlan | undefined;
  let coloursAdjusted = false;
  let rejectedBg: unknown;
  const entries: ProviderEntry[] = order.map((id) => ({ provider: deps.providers[id], model: current.models[id], overallMs: PROVIDER_TIMEOUTS[id].overallMs }));
  const result = await generate({ system: systemPrompt(entitledThemes(plan)), user: payload, schema: styleSchema(entitledThemes(plan)) }, entries, {
    budgetMs: Math.max(1000, (deps.budgetMs ?? PIPELINE_BUDGET_MS) - (now() - started)),
    ...(signal ? { signal } : {}),
    validate: (json) => {
      const checked = checkPlan(json, summary);
      if (checked.ok) {
        // A Plus-only theme without Plus becomes the nearest free one (its layouts stay).
        validPlan = clampPlan(checked.plan, plan);
        coloursAdjusted = checked.repaired;
        return null;
      }
      rejectedBg = (json as { tokens?: { bg?: unknown } } | null)?.tokens?.bg;
      return checked.codes;
    },
    onSwitch: (from, kind, next) => {
      if (kind === "rate" || kind === "quota") deps.onStep?.("asking", busy(PROVIDER_NAMES[from], PROVIDER_NAMES[next]));
    },
  });

  /**
   * Optional second pass: when the deterministic repair touched more than a quarter of the sampled text, the AI may suggest colours
   * for those parts (after its own consent, once per site). Any problem keeps the deterministic result. One attempt only.
   */
  const aiRepair = async (stats: { repairs: number; samples: number }): Promise<number> => {
    const page = deps.page;
    if (!page.repairPayload || !page.applyRepair || stats.samples === 0 || stats.repairs / stats.samples <= 0.25 || signal?.aborted) return 0;
    try {
      const payload = await page.repairPayload();
      const origin = originOf(url);
      if (!payload || payload.elements.length === 0 || !origin) return 0;
      const text = buildRepairMessage(payload);
      if (current.repairConsent[origin]?.version !== REPAIR_CONSENT_VERSION) {
        if (!deps.askRepairConsent) return 0;
        step("consent");
        const ok = await deps.askRepairConsent({ purpose: "repair", providerNames: order.map((id) => PROVIDER_NAMES[id]), payload: text });
        if (!ok) return 0;
        current = { ...current, repairConsent: { ...current.repairConsent, [origin]: { version: REPAIR_CONSENT_VERSION, acceptedAt: new Date(now()).toISOString() } } };
        await deps.saveSettings(current);
      }
      if (signal?.aborted) return 0;
      const day = today();
      current = { ...current, aiCallsToday: { date: day, count: callsOn(current, day) + 1 } };
      await deps.saveSettings(current);
      step("repairing");
      const bgs = payload.elements.map((e) => e.bg);
      const fixed = await generate({ system: REPAIR_SYSTEM, user: text, schema: REPAIR_SCHEMA }, entries, {
        budgetMs: Math.max(1000, (deps.budgetMs ?? PIPELINE_BUDGET_MS) - (now() - started)),
        ...(signal ? { signal } : {}),
        validate: (json) => {
          const v = validateRepair(json, bgs);
          return v.ok ? null : v.errors.slice(0, 10).map((e) => e.split(":")[0] ?? "plan");
        },
      });
      if (!fixed.ok) return 0;
      return (await page.applyRepair(fixed.json))?.applied ?? 0;
    } catch {
      return 0;
    }
  };

  if (!result.ok) {
    const kind = result.error.kind;
    if (kind === "aborted") return { kind: "cancelled", themeId: baselineId };
    if (kind === "auth") return { kind: "error", errorKind: "auth", message: authFailed(PROVIDER_NAMES[result.providerId ?? order[0]!]), themeId: baselineId };
    if (kind === "bad-output") {
      step("applying");
      const id = clampThemeId(nearestTheme(summary, rejectedBg), plan);
      const r = await deps.page.applyTheme(id);
      if (!r?.ok) return baseline("apply-failed", aiApplyFailureMessage(r));
      return { kind: "preview", source: "fallback", fixes: r.repairs, plan: themeToPlan(id, summary), baselineThemeId: baselineId, fingerprint: analysis.fingerprint, message: MSG.fallbackTheme };
    }
    if ((kind === "rate" || kind === "quota") && result.retryAfterMs !== undefined) return baseline("ai-unavailable", rateLimited(result.retryAfterMs));
    return baseline("ai-unavailable", MSG.allFailed);
  }

  if (!validPlan) return baseline("ai-unavailable", MSG.allFailed);
  step("applying");
  const shown = await deps.page.applyPlan(validPlan);
  if (!shown?.ok) {
    await deps.page.applyTheme(baselineId);
    return baseline("apply-failed", aiApplyFailureMessage(shown));
  }

  return { kind: "preview", source: "ai", plan: validPlan, fixes: shown.repairs, baselineThemeId: baselineId, fingerprint: analysis.fingerprint, providerId: result.providerId, model: result.model, ...(coloursAdjusted ? { message: MSG.coloursAdjusted } : {}) };
}
