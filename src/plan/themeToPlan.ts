import type { RegionRole, StructuralSummary } from "../core/types.ts";
import { getTheme, type BuiltinThemeId } from "../themes/index.ts";
import { isDark } from "./contrast.ts";
import type { RegionRule, StylePlan, Strategy, Surface } from "./schema.ts";

const SURFACE_BY_ROLE: Partial<Record<RegionRole, Surface>> = {
  "card-list": "card",
  table: "flat",
  aside: "flat",
  form: "flat",
};

/**
 * Default strategy for a built-in theme: a dark page with a dark theme only needs "safe" (the page already has the right tone);
 * every other pairing starts at "full". Without a summary nothing is known about the page, so "safe". The visual guard steps down from here.
 */
export function strategyFor(themeBg: string, summary?: StructuralSummary): Strategy {
  if (!summary) return "safe";
  return summary.page.tone === "dark" && isDark(themeBg) ? "safe" : "full";
}

/** Backgrounds stay protected when the page has large images or a hero. */
export const protectFor = (summary?: StructuralSummary): boolean => !summary || summary.page.hasHeroMedia || summary.page.largeMedia > 0;

/** A built-in theme as a StylePlan. Every region rule has layout "none". */
export function themeToPlan(id: BuiltinThemeId, summary?: StructuralSummary): StylePlan {
  const theme = getTheme(id);
  const regionRules: RegionRule[] = [];
  for (const r of summary?.regions ?? []) {
    const surface = SURFACE_BY_ROLE[r.role];
    if (surface) regionRules.push({ region: r.id, layout: "none", surface, spacing: 0 });
  }
  return { v: 1, themeId: id, tokens: { ...theme.tokens }, regionRules, reasons: [], sceneId: "none", strategy: strategyFor(theme.tokens.bg, summary), protectBackgrounds: protectFor(summary) };
}
