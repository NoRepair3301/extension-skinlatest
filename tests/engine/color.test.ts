import { describe, expect, it } from "vitest";
import { clamp, hsl2rgb, lerpHue, luminance, parseRgb, rgb2hsl, toCss, toHex } from "../../src/engine/color.ts";

describe("engine/color", () => {
  it("clamp restricts numbers within bounds", () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("rgb2hsl and hsl2rgb round-trip accurately", () => {
    const samples: Array<[number, number, number]> = [
      [255, 255, 255],
      [0, 0, 0],
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [128, 128, 128],
      [15, 20, 32],
      [246, 239, 226],
    ];

    for (const [r, g, b] of samples) {
      const [h, s, l] = rgb2hsl(r, g, b);
      const [r2, g2, b2] = hsl2rgb(h, s, l);
      expect(Math.abs(r - r2)).toBeLessThanOrEqual(1);
      expect(Math.abs(g - g2)).toBeLessThanOrEqual(1);
      expect(Math.abs(b - b2)).toBeLessThanOrEqual(1);
    }
  });

  it("lerpHue interpolates angles smoothly across 0/360 boundary", () => {
    expect(lerpHue(350, 10, 0.5)).toBeCloseTo(0, 1);
    expect(lerpHue(10, 30, 0.5)).toBeCloseTo(20, 1);
  });

  it("luminance correctly computes relative luminance", () => {
    expect(luminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(luminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 4);
    // Green dominates relative luminance
    expect(luminance({ r: 0, g: 255, b: 0 })).toBeGreaterThan(luminance({ r: 255, g: 0, b: 0 }));
  });

  it("parseRgb parses multiple formats", () => {
    expect(parseRgb("rgb(255, 128, 0)")).toEqual({ r: 255, g: 128, b: 0, a: 1 });
    expect(parseRgb("rgba(255, 128, 0, 0.5)")).toEqual({ r: 255, g: 128, b: 0, a: 0.5 });
    expect(parseRgb("rgb(255 128 0 / 50%)")).toEqual({ r: 255, g: 128, b: 0, a: 0.5 });
    expect(parseRgb("#ff8000")).toEqual({ r: 255, g: 128, b: 0, a: 1 });
    expect(parseRgb("#f80")).toEqual({ r: 255, g: 136, b: 0, a: 1 });
    expect(parseRgb("#ff800080")).toEqual({ r: 255, g: 128, b: 0, a: 0.5019607843137255 });
    expect(parseRgb("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseRgb("invalid-color")).toBeNull();
  });

  it("toCss formats rgb and rgba correctly", () => {
    expect(toCss(255, 128, 0, 1)).toBe("rgb(255, 128, 0)");
    expect(toCss(255, 128, 0, 0.5)).toBe("rgba(255, 128, 0, 0.5)");
  });

  it("toHex formats 6-digit hex string", () => {
    expect(toHex(255, 128, 0)).toBe("#ff8000");
    expect(toHex(0, 0, 0)).toBe("#000000");
  });
});
