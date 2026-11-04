import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../src/plan/contrast.ts";
import { THEMES } from "../../src/themes/index.ts";
import { parseRgb, toHex } from "../../src/engine/color.ts";
import { makeTransform } from "../../src/engine/transform.ts";

describe("engine/transform", () => {
  it("all 6 themes transform valid colors for bg, border, and text", () => {
    for (const theme of THEMES) {
      const tfLight = makeTransform(theme, "light");
      const tfDark = makeTransform(theme, "dark");

      for (const tf of [tfLight, tfDark]) {
        const bg = tf("rgb(255, 255, 255)", "bg");
        const text = tf("rgb(0, 0, 0)", "text");
        const border = tf("rgb(200, 200, 200)", "border");

        expect(parseRgb(bg)).not.toBeNull();
        expect(parseRgb(text)).not.toBeNull();
        expect(parseRgb(border)).not.toBeNull();
      }
    }
  });

  it("guarantees text contrast >= 4.5:1 (>= 7:1 for high-contrast) against theme bg", () => {
    const testColors = [
      "rgb(0, 0, 0)",
      "rgb(30, 30, 30)",
      "rgb(100, 100, 100)",
      "rgb(180, 180, 180)",
      "rgb(240, 240, 240)",
      "rgb(255, 255, 255)",
      "rgb(255, 0, 0)",
      "rgb(0, 128, 255)",
      "rgb(0, 200, 50)",
      "rgb(255, 200, 0)",
    ];

    for (const theme of THEMES) {
      const minTarget = theme.id === "high-contrast" ? 7.0 : 4.5;
      for (const native of ["light", "dark"] as const) {
        const tf = makeTransform(theme, native);
        for (const input of testColors) {
          const transformedText = tf(input, "text");
          const p = parseRgb(transformedText);
          expect(p).not.toBeNull();
          if (p) {
            const hex = toHex(p.r, p.g, p.b);
            const ratio = contrastRatio(hex, theme.tokens.bg);
            expect(ratio).toBeGreaterThanOrEqual(minTarget);
          }
        }
      }
    }
  });

  it("high-contrast produces pure extremes with no tint", () => {
    const hcTheme = THEMES.find((t) => t.id === "high-contrast")!;
    const tf = makeTransform(hcTheme, "light");

    const bg = tf("rgb(240, 240, 240)", "bg");
    expect(bg).toBe("rgb(0, 0, 0)");

    const border = tf("rgb(100, 100, 100)", "border");
    expect(border).toBe("rgb(255, 255, 255)");

    const text = tf("rgb(0, 0, 0)", "text");
    expect(text).toBe("rgb(255, 255, 255)");
  });

  it("midnight inverts light pages into dark", () => {
    const midnight = THEMES.find((t) => t.id === "midnight")!;
    const tf = makeTransform(midnight, "light");

    const bg = tf("rgb(255, 255, 255)", "bg");
    const p = parseRgb(bg)!;
    // White background becomes dark in midnight
    expect(p.r).toBeLessThan(35);
    expect(p.g).toBeLessThan(35);
    expect(p.b).toBeLessThan(50);
  });

  it("light themes retint light pages toward theme background", () => {
    const warmPaper = THEMES.find((t) => t.id === "warm-paper")!;
    const tf = makeTransform(warmPaper, "light");

    const bg = tf("rgb(255, 255, 255)", "bg");
    const p = parseRgb(bg)!;
    // Warm paper has warm tones: red > blue
    expect(p.r).toBeGreaterThan(p.b);
  });

  it("preserves alpha channel", () => {
    const midnight = THEMES.find((t) => t.id === "midnight")!;
    const tf = makeTransform(midnight, "light");

    const bg = tf("rgba(255, 255, 255, 0.42)", "bg");
    const p = parseRgb(bg)!;
    expect(p.a).toBeCloseTo(0.42, 2);
  });
});
