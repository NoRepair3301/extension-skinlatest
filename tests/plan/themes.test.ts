import { describe, expect, it } from "vitest";
import { contrastFailures, contrastRatio } from "../../src/plan/contrast.ts";
import { BUILTIN_THEME_IDS, getTheme, THEMES } from "../../src/themes/index.ts";
import { validatePlan } from "../../src/plan/schema.ts";
import type { StructuralSummary } from "../../src/core/types.ts";

describe("contrast", () => {
  it("matches known WCAG ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });
  it("reports failures", () => {
    const t = { ...getTheme("calm-light").tokens, text: "#cccccc" };
    expect(contrastFailures("calm-light", t).length).toBeGreaterThan(0);
  });
});

describe("themes", () => {
  it("has the six built-in themes", () => {
    expect(THEMES.map((t) => t.id)).toEqual([...BUILTIN_THEME_IDS]);
  });
  it.each(THEMES.map((t) => [t.id, t] as const))("%s meets the contrast targets", (_id, t) => {
    expect(contrastFailures(t.id, t.tokens)).toEqual([]);
  });
  it("high-contrast text reaches 7:1", () => {
    const t = getTheme("high-contrast").tokens;
    expect(contrastRatio(t.text, t.bg)).toBeGreaterThanOrEqual(7);
  });
  it.each(THEMES.map((t) => [t.id, t] as const))("%s is a valid plan", (_id, t) => {
    const summary = { v: 1, viewport: { w: 1, h: 1 }, palette: [], fonts: [], counts: { nodes: 0, links: 0, forms: 0, tables: 0, images: 0, headings: 0, iframes: 0 }, risk: [], regions: [] } as StructuralSummary;
    expect(validatePlan({ v: 1, themeId: t.id, tokens: t.tokens, regionRules: [], reasons: [] }, summary).ok).toBe(true);
  });
});
