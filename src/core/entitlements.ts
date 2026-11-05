import { BUILTIN_THEME_IDS, type BuiltinThemeId } from "../themes/index.ts";
import type { StylePlan } from "../plan/schema.ts";

/**
 * Everything is free (F3): no tier, no lock. What is left here exists only so the UI callers (Popup, Options, PlanAccount, scene.ts)
 * keep compiling until S4.2 removes them; the module goes with them.
 */
export type PlanFlag = "free" | "plus";

export type Feature = `theme:${BuiltinThemeId}` | "assets";

/** @deprecated removed in S4.2 */
export const canUse = (_feature: Feature, _plan?: PlanFlag): boolean => true;

/** All six built-in themes, in the app's order (also the only ids the AI is told about, plus "custom"). */
export const entitledThemes = (): readonly BuiltinThemeId[] => BUILTIN_THEME_IDS;

/** @deprecated removed in S4.2 (pass-through) */
export const clampThemeId = (id: BuiltinThemeId, _plan?: PlanFlag): BuiltinThemeId => id;

/** @deprecated removed in S4.2 (pass-through) */
export const clampPlan = (plan: StylePlan, _flag?: PlanFlag): StylePlan => plan;
