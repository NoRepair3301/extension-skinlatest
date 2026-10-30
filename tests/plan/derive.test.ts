import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../src/plan/contrast.ts";
import { deriveColors, pairsOf, AA } from "../../src/plan/derive.ts";
import { mix, nudgeForeground, nudgeOnAll } from "../../src/plan/color.ts";
import type { Tokens } from "../../src/plan/schema.ts";
import { BUILTIN_THEME_IDS, getTheme } from "../../src/themes/index.ts";

const base = getTheme("calm-light").tokens;
const withColors = (c: Partial<Tokens>): Tokens => ({ ...base, ...c });

describe("deriveColors", () => {
  it.each(BUILTIN_THEME_IDS)("%s: every emitted foreground/background pair reaches AA", (id) => {
    const t = getTheme(id).tokens;
    for (const p of pairsOf(t, deriveColors(t))) expect(contrastRatio(p.fg, p.bg), `${id} ${p.name}`).toBeGreaterThanOrEqual(p.min);
  });

  it("holds for awkward custom tokens (mid greys, saturated accents, near-equal surface and bg)", () => {
    const cases: Partial<Tokens>[] = [
      { accent: "#808080" },
      { accent: "#ffff00", surface: "#fffff0" },
      { accent: "#0000ff", bg: "#101010", surface: "#181818", text: "#f0f0f0", muted: "#b0b0b0", link: "#8ab4f8", border: "#333333" },
      { surface: "#7f7f7f", bg: "#808080", text: "#000000", muted: "#000000", link: "#000000" },
      { accent: "#00ff00", surface: "#00ff00" },
      { bg: "#8b0000", surface: "#8b0000", text: "#ffffff", muted: "#ffffff", link: "#ffffff" },
    ];
    for (const c of cases) {
      const t = withColors(c);
      for (const p of pairsOf(t, deriveColors(t)).filter((x) => !/^(text|muted|link)\/(bg|surface)$/.test(x.name))) {
        expect(contrastRatio(p.fg, p.bg), JSON.stringify(c) + " " + p.name).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it("falls back for one colour only: a surface that cannot be tinted stays the surface, the rest is still derived", () => {
    // Tinting the surface toward the text colour would push muted and link below AA, so surfaceAlt stays the surface.
    const t = withColors({ bg: "#ffffff", surface: "#ffffff", text: "#000000", muted: "#767676", link: "#767676" });
    const d = deriveColors(t);
    expect(d.surfaceAlt).toBe(t.surface);
    expect(d.onAccent).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("derives onAccent from the plan's own colours when they read", () => {
    expect(deriveColors(base).onAccent).toBe(base.surface);
  });
});

describe("colour helpers", () => {
  it("nudgeForeground leaves passing colours alone and darkens failing ones on a light background", () => {
    expect(nudgeForeground("#000000", "#ffffff", 4.5)).toBe("#000000");
    const n = nudgeForeground("#aaaaaa", "#ffffff", 4.5);
    expect(contrastRatio(n, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
  it("nudgeOnAll satisfies every background or falls back to black or white", () => {
    const n = nudgeOnAll("#888888", ["#ffffff", "#eeeeee"], 4.5);
    for (const bg of ["#ffffff", "#eeeeee"]) expect(contrastRatio(n, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it("mix interpolates", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});
