import { BUILTIN_THEME_IDS, getTheme, type BuiltinThemeId, type ThemeChoice } from "../themes/index.ts";
import { themeToPlan } from "../plan/themeToPlan.ts";
import type { StylePlan } from "../plan/schema.ts";

/**
 * The only place with tier logic and the Free/Plus lists (docs/PLUS_SPEC.md 1). Everything else asks `canUse`, `entitledThemes` or
 * `clampPlan`. The plan flag comes from a verified, signed entitlement (src/backend/entitlement.ts) through the `plan` storage key
 * (src/extension/planFlag.ts). This gating is a convenience in open code, not security: the server's signed token is the enforcement.
 */
export type PlanFlag = "free" | "plus";

export const TIERS = {
  free: {
    themes: ["calm-light", "midnight", "high-contrast"] as const,
    /** Five pets, readability repair, own AI key and per-site memory are free; they are listed for the UI, never gated. */
    includes: ["auto", "pets", "free-scenes", "repair", "own-key", "site-memory"] as const,
  },
  plus: {
    themes: ["ocean", "warm-paper", "field"] as const,
    includes: ["plus-themes", "plus-scenes", "assets"] as const,
  },
} as const;

export type PlusThemeId = (typeof TIERS.plus.themes)[number];
export type Feature = `theme:${BuiltinThemeId}` | "assets";

export const isPlusTheme = (id: string): id is PlusThemeId => (TIERS.plus.themes as readonly string[]).includes(id);

export function canUse(feature: Feature, plan: PlanFlag): boolean {
  if (plan === "plus") return true;
  if (feature === "assets") return false;
  return !isPlusTheme(feature.slice("theme:".length));
}

/** The built-in themes this plan may apply (and the only ids the AI is told about). */
export function entitledThemes(plan: PlanFlag): BuiltinThemeId[] {
  return BUILTIN_THEME_IDS.filter((id) => canUse(`theme:${id}`, plan));
}

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const dist = (a: string, b: string): number => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
};

/** The entitled built-in theme whose background is closest to `bg` (all three Plus themes are light, so Calm light). */
export function nearestEntitled(bg: string, plan: PlanFlag): BuiltinThemeId {
  const allowed = entitledThemes(plan);
  let best = allowed[0]!;
  let bestD = Infinity;
  for (const id of allowed) {
    const d = dist(bg, getTheme(id).tokens.bg);
    if (d < bestD) [best, bestD] = [id, d];
  }
  return best;
}

/** A theme id the plan may use: itself, or the nearest entitled one. */
export function clampThemeId(id: BuiltinThemeId, plan: PlanFlag): BuiltinThemeId {
  return canUse(`theme:${id}`, plan) ? id : nearestEntitled(getTheme(id).tokens.bg, plan);
}

/** A popup theme choice the plan may use ("auto" is always free). */
export function clampChoice(choice: ThemeChoice, plan: PlanFlag): ThemeChoice {
  return choice === "auto" ? choice : clampThemeId(choice, plan);
}

/**
 * A plan the user may apply: a Plus theme without Plus becomes the nearest free theme's tokens. Layouts, strategy and the rest of the
 * plan stay, so the page keeps its structure and never breaks. Custom AI tokens are not a Plus theme and stay as they are.
 */
export function clampPlan(plan: StylePlan, flag: PlanFlag): StylePlan {
  if (!isPlusTheme(plan.themeId) || canUse(`theme:${plan.themeId}`, flag)) return plan;
  const free = themeToPlan(clampThemeId(plan.themeId, flag));
  return { ...plan, themeId: free.themeId, tokens: free.tokens };
}
