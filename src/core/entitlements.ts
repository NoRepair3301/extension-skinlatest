import { BUILTIN_THEME_IDS, type BuiltinThemeId } from "../themes/index.ts";
import type { StylePlan } from "../plan/schema.ts";

/**
 * Everything is free (F3): no tier, no lock. What is left exists only for code that S4.3 deletes: `PlanFlag` (src/backend,
 * extension/planFlag.ts) and `clampPlan` (a pass-through still called once from the protected extension/scene.ts).
 */
export type PlanFlag = "free" | "plus";

/** All six built-in themes, in the app's order (also the only ids the AI is told about, plus "custom"). */
export const entitledThemes = (): readonly BuiltinThemeId[] => BUILTIN_THEME_IDS;

/** @deprecated removed in S4.3 with its last caller (pass-through) */
export const clampPlan = (plan: StylePlan, _flag?: PlanFlag): StylePlan => plan;
