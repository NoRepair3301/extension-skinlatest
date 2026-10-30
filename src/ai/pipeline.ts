import { checkUrl } from "../analyzer/eligibility.ts";
import { decideGate } from "../analyzer/gate.ts";
import { CONSENT_VERSION, DAILY_AI_CALLS, MIN_CALL_GAP_MS, PROVIDER_NAMES, PROVIDER_TIMEOUTS, type ProviderId } from "../config.ts";
import type { BlockReason, Fingerprint, StructuralSummary } from "../core/types.ts";
import { debug } from "../core/log.ts";
import type { ApplyResult, PageAnalysis } from "../extension/applier-core.ts";
import { callsOn, type Settings } from "../extension/settings.ts";
import { contrastFailures } from "../plan/contrast.ts";
import { nearestTheme } from "../plan/nearestTheme.ts";
import { repairTokens } from "../plan/repair.ts";
import { validatePlan, type StylePlan } from "../plan/schema.ts";
import { themeToPlan } from "../plan/themeToPlan.ts";
import { generate, PIPELINE_BUDGET_MS, type ProviderEntry } from "../providers/registry.ts";
import type { ErrorKind, Provider } from "../providers/types.ts";
import { resolveTheme, type BuiltinThemeId } from "../themes/index.ts";
import { aiApplyFailureMessage, applyFailureMessage, authFailed, blockedMessage, busy, MSG, rateLimited } from "./messages.ts";
import { buildUserMessage, SYSTEM_PROMPT } from "./prompt.ts";

/** The page side, reached through scripting. Implemented in src/extension/flow.ts; faked in tests. */
export interface PageClient {
  analyze(): Promise<PageAnalysis>;
  applyTheme(id: BuiltinThemeId): Promise<ApplyResult | undefined>;
  applyPlan(plan: StylePlan): Promise<ApplyResult | undefined>;
  restore(): Promise<void>;
}

export type Step = "checking" | "baseline" | "analysing" | "consent" | "asking" | "applying";

export interface ConsentRequest {
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
  clock: CallClock;
  /** For the "auto" theme: does the browser prefer a dark colour scheme? Default no. */
  prefersDark?(): boolean;
  onStep?(step: Step, detail?: string): void;
  now?(): number;
  today?(): string;
  budgetMs?: number;
}

export type BaselineWhy = "no-ai-page" | "too-large" | "no-key" | "consent-declined" | "limit-daily" | "limit-gap" | "ai-unavailable" | "apply-failed";

export type Outcome =
  | { kind: "blocked"; reason: BlockReason; message: string }
  | { kind: "baseline"; themeId: BuiltinThemeId; why: BaselineWhy; message: string; plan?: StylePlan; fingerprint?: Fingerprint }
  | { kind: "preview"; source: "ai" | "fallback"; plan: StylePlan; baselineThemeId: BuiltinThemeId; fingerprint: Fingerprint; providerId?: ProviderId; model?: string; message?: string }
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
  const codes = bad.map((f) => {
    const m = /(\w+)\/(\w+)/.exec(f);
    return m ? `contrast.${m[1]}.${m[2]}` : "contrast";
  });
  return { ok: false, codes };
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

  const baselineId = resolveTheme(settings.theme, deps.prefersDark?.() ?? false);
  /** Set once the page was analysed: the built-in theme as a plan, so the popup can offer to keep it. */
  const known: { plan?: StylePlan; fingerprint?: Fingerprint } = {};
  const baseline = (why: BaselineWhy, message: string): Outcome => ({ kind: "baseline", themeId: baselineId, why, message, ...known });

  step("baseline");
  const applied = await deps.page.applyTheme(baselineId);
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
  const result = await generate({ system: SYSTEM_PROMPT, user: payload }, entries, {
    budgetMs: Math.max(1000, (deps.budgetMs ?? PIPELINE_BUDGET_MS) - (now() - started)),
    ...(signal ? { signal } : {}),
    validate: (json) => {
      const checked = checkPlan(json, summary);
      if (checked.ok) {
        validPlan = checked.plan;
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

  if (!result.ok) {
    const kind = result.error.kind;
    if (kind === "aborted") return { kind: "cancelled", themeId: baselineId };
    if (kind === "auth") return { kind: "error", errorKind: "auth", message: authFailed(PROVIDER_NAMES[result.providerId ?? order[0]!]), themeId: baselineId };
    if (kind === "bad-output") {
      step("applying");
      const id = nearestTheme(summary, rejectedBg);
      const r = await deps.page.applyTheme(id);
      if (!r?.ok) return baseline("apply-failed", aiApplyFailureMessage(r));
      return { kind: "preview", source: "fallback", plan: themeToPlan(id, summary), baselineThemeId: baselineId, fingerprint: analysis.fingerprint, message: MSG.fallbackTheme };
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
  return { kind: "preview", source: "ai", plan: validPlan, baselineThemeId: baselineId, fingerprint: analysis.fingerprint, providerId: result.providerId, model: result.model, ...(coloursAdjusted ? { message: MSG.coloursAdjusted } : {}) };
}
