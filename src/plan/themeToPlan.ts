import type { RegionRole, StructuralSummary } from "../core/types.ts";
import { getTheme, type BuiltinThemeId } from "../themes/index.ts";
import type { RegionRule, StylePlan, Surface } from "./schema.ts";

const SURFACE_BY_ROLE: Partial<Record<RegionRole, Surface>> = {
  "card-list": "card",
  table: "flat",
  aside: "flat",
  form: "flat",
};

/** A built-in theme as a StylePlan. Every region rule has layout "none". */
export function themeToPlan(id: BuiltinThemeId, summary?: StructuralSummary): StylePlan {
  const theme = getTheme(id);
  const regionRules: RegionRule[] = [];
  for (const r of summary?.regions ?? []) {
    const surface = SURFACE_BY_ROLE[r.role];
    if (surface) regionRules.push({ region: r.id, layout: "none", surface, spacing: 0 });
  }
  return { v: 1, themeId: id, tokens: { ...theme.tokens }, regionRules, reasons: [], sceneId: "none" };
}
