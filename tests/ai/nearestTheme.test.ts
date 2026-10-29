import { describe, expect, it } from "vitest";
import { nearestTheme } from "../../src/plan/nearestTheme.ts";
import { region, sampleSummary } from "../plan/helpers.ts";

const withBg = (bg: string) => {
  const s = sampleSummary();
  s.regions = [region("r1", "main", 0), region("r2", "nav", 0)].map((r) => ({ ...r, style: { ...r.style, bg } }));
  return s;
};

describe("nearestTheme", () => {
  it("picks a dark theme for a dark page and a light one for a light page", () => {
    expect(nearestTheme(withBg("#101828"))).toBe("midnight");
    expect(nearestTheme(withBg("#ffffff"))).toBe("calm-light");
    expect(nearestTheme(withBg("#000000"))).toBe("high-contrast");
    expect(nearestTheme(withBg("#f5ecd8"))).toBe("warm-paper");
  });
  it("prefers the hint from a rejected plan when it is a valid colour", () => {
    expect(nearestTheme(withBg("#ffffff"), "#0f1420")).toBe("midnight");
    expect(nearestTheme(withBg("#ffffff"), "red")).toBe("calm-light");
    expect(nearestTheme(withBg("#ffffff"), 5)).toBe("calm-light");
  });
  it("falls back to white for a page with no regions", () => {
    const s = sampleSummary();
    s.regions = [];
    expect(nearestTheme(s)).toBe("calm-light");
  });
});
