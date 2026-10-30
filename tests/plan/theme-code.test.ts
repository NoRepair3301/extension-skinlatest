import { describe, expect, it } from "vitest";
import { decodeThemeCode, encodeThemeCode } from "../../src/extension/themeCode.ts";
import { themeToPlan } from "../../src/plan/themeToPlan.ts";

describe("theme code", () => {
  it("round-trips a built-in plan without region rules", () => {
    const plan = { ...themeToPlan("midnight"), sceneId: "space" as const };
    const r = decodeThemeCode(encodeThemeCode(plan));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.tokens).toEqual(plan.tokens);
      expect(r.plan.sceneId).toBe("space");
      expect(r.plan.regionRules).toEqual([]);
    }
  });
  it("carries no region ids, assets or page data", () => {
    const code = encodeThemeCode(themeToPlan("calm-light"));
    const json = atob(code.slice("skinly1:".length));
    expect(json).toContain('"regionRules":[]');
    expect(json).not.toMatch(/asset|http|href/i);
  });
  it("repairs low contrast through the validator", () => {
    const plan = themeToPlan("calm-light");
    const weak = { ...plan, tokens: { ...plan.tokens, text: "#cccccc" } };
    const r = decodeThemeCode(encodeThemeCode(weak));
    if (r.ok) expect(r.repaired).toBe(true);
    else expect(r.message).toMatch(/theme code/);
  });
  it.each(["", "hello", "skinly1:%%%", "skinly1:" + btoa("{"), "skinly1:" + btoa('{"v":2}'), "skinly1:" + "A".repeat(3000)])("refuses %#", (s) => {
    expect(decodeThemeCode(s).ok).toBe(false);
  });
  it("refuses unknown keys and region ids", () => {
    const plan = themeToPlan("ocean");
    const evil = btoa(JSON.stringify({ ...plan, css: "body{}", regionRules: [{ region: "r1", layout: "none", surface: "flat", spacing: 0 }] }));
    expect(decodeThemeCode("skinly1:" + evil).ok).toBe(false);
  });
});
