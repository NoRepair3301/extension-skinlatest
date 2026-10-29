import { describe, expect, it } from "vitest";
import { validatePlan } from "../../src/plan/schema.ts";
import { themeToPlan } from "../../src/plan/themeToPlan.ts";
import { BUILTIN_THEME_IDS, getTheme } from "../../src/themes/index.ts";
import { region, sampleSummary } from "./helpers.ts";

describe("themeToPlan", () => {
  it.each(BUILTIN_THEME_IDS)("%s becomes a valid plan with layout none everywhere", (id) => {
    const summary = sampleSummary();
    summary.regions.push(region("r5", "aside", 0), region("r6", "form", 0), region("r7", "table", 0));
    const plan = themeToPlan(id, summary);
    expect(plan.themeId).toBe(id);
    expect(plan.tokens).toEqual(getTheme(id).tokens);
    expect(plan.regionRules.length).toBeGreaterThan(0);
    expect(plan.regionRules.every((r) => r.layout === "none")).toBe(true);
    expect(validatePlan(plan, summary).ok).toBe(true);
  });
  it("has no region rules without a summary", () => {
    expect(themeToPlan("midnight").regionRules).toEqual([]);
  });
  it("gives cards to card-lists", () => {
    expect(themeToPlan("ocean", sampleSummary()).regionRules).toEqual([{ region: "r4", layout: "none", surface: "card", spacing: 0 }]);
  });
  it("does not share the token object with the theme", () => {
    const plan = themeToPlan("ocean");
    plan.tokens.bg = "#000000";
    expect(getTheme("ocean").tokens.bg).not.toBe("#000000");
  });
});
