import { describe, expect, it } from "vitest";
import { contrastFailures } from "../../src/plan/contrast.ts";
import { repairTokens } from "../../src/plan/repair.ts";
import type { Tokens } from "../../src/plan/schema.ts";
import { getTheme } from "../../src/themes/index.ts";

const ocean = getTheme("ocean").tokens;
const make = (c: Partial<Tokens>): Tokens => ({ ...ocean, ...c });

describe("repairTokens", () => {
  it("nudges failing foregrounds until every SPEC 10 target passes, keeping bg, surface and border", () => {
    const t = make({ text: "#d0d8dc", muted: "#9aa5ad", link: "#7a8a99", accent: "#304050", focus: "#304050" });
    expect(contrastFailures("custom", t).length).toBeGreaterThan(0);
    const fixed = repairTokens("custom", t)!;
    expect(fixed).toBeDefined();
    expect(contrastFailures("custom", fixed)).toEqual([]);
    expect(fixed.bg).toBe(t.bg);
    expect(fixed.surface).toBe(t.surface);
    expect(fixed.border).toBe(t.border);
    expect(fixed.radius).toBe(t.radius);
  });

  it("leaves tokens that already pass unchanged", () => {
    expect(repairTokens("ocean", ocean)).toEqual(ocean);
  });

  it("repairs on a light page too (darkening instead of lightening)", () => {
    const t = make({ bg: "#ffffff", surface: "#f5f5f5", text: "#bbbbbb", muted: "#cccccc", link: "#aabbff", accent: "#ccccdd", focus: "#ddddee" });
    const fixed = repairTokens("custom", t)!;
    expect(contrastFailures("custom", fixed)).toEqual([]);
  });

  it("returns undefined when nudging cannot reach the target (7:1 on a mid grey)", () => {
    expect(repairTokens("high-contrast", make({ bg: "#808080", surface: "#808080" }))).toBeUndefined();
  });

  it("holds the high-contrast 7:1 target when it can", () => {
    const fixed = repairTokens("high-contrast", make({ bg: "#000000", surface: "#0a0a0a", text: "#777777" }))!;
    expect(contrastFailures("high-contrast", fixed)).toEqual([]);
  });
});
