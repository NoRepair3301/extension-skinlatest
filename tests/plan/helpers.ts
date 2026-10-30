import type { RegionRole, StructuralSummary } from "../../src/core/types.ts";
import type { RegionRule, ValidPlan } from "../../src/plan/schema.ts";
import { getTheme, type BuiltinThemeId } from "../../src/themes/index.ts";

export const region = (id: string, role: RegionRole, linkCount: number) => ({
  id,
  role,
  tag: "div",
  classes: [],
  childCount: 3,
  linkCount,
  depth: 1,
  rect: { x: 0, y: 0, w: 100, h: 100 },
  style: { color: "#000000", bg: "#ffffff", fontSize: 16, fontWeight: 400, radius: 0 },
});

export const sampleSummary = (risk: StructuralSummary["risk"] = []): StructuralSummary => ({
  v: 1,
  viewport: { w: 1000, h: 800 },
  palette: [],
  fonts: [],
  counts: { nodes: 10, links: 10, forms: 0, tables: 0, images: 0, headings: 0, iframes: 0 },
  risk,
  page: { tone: "light", bgImages: 0, largeMedia: 0, hasHeroMedia: false },
  regions: [region("r1", "nav", 6), region("r2", "link-list", 2), region("r3", "main", 0), region("r4", "card-list", 8)],
});

/** Test plans are cast to ValidPlan; production code can only get one from validatePlan. */
export const planFor = (id: BuiltinThemeId, regionRules: RegionRule[] = []): ValidPlan => ({
  v: 1,
  themeId: id,
  tokens: getTheme(id).tokens,
  regionRules,
  reasons: [],
} as unknown as ValidPlan);

export const SAMPLE_RULES: RegionRule[] = [
  { region: "r1", layout: "nav-wrap", surface: "flat", spacing: 2 },
  { region: "r2", layout: "none", surface: "card", spacing: 0 },
  { region: "r4", layout: "link-grid", surface: "card", spacing: 3 },
];
