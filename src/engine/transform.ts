import type { Tokens } from "../plan/schema.ts";
import type { Theme } from "../themes/index.ts";
import { nudgeForeground, nudgeOnAll } from "../plan/color.ts";
import { contrastRatio, isDark, luminance as hexLuminance } from "../plan/contrast.ts";
import { clamp, greyWithLuminance, hsl2rgb, lerpHue, normalizeCssColor, parseRgb, rgb2hsl, toCss, toHex } from "./color.ts";

export type Role = "bg" | "text" | "border";
export type NativeLook = "light" | "dark";

/**
 * What shows behind a piece of text once the theme is on: its darkest and lightest colour (#rrggbb).
 * A gradient spans its stops; a solid colour has dark === light. `image` marks pixels the engine
 * cannot see (a url() image or media): dark..light then bounds every pixel they could have.
 */
export interface Backdrop {
  dark: string;
  light: string;
  image: boolean;
}

export interface ColorTransformer {
  /** With a backdrop, text meets the floor against it instead of against the theme background. */
  (cssColorString: string, role: Role, backdrop?: Backdrop): string;
  /** A colour already painted (inherited, so already themed) lifted to the text floor on backdrop; the same string when it meets it. */
  fit(cssColorString: string, backdrop: Backdrop): string;
}

export function makeTransform(themeInput: Theme | { id: string; tokens: Tokens }, native: NativeLook): ColorTransformer {
  const { id: themeId, tokens } = themeInput;
  const isHighContrast = themeId === "high-contrast";
  const isThemeDark = isDark(tokens.bg);

  const themeBgRgb = parseRgb(tokens.bg) ?? { r: 15, g: 20, b: 32, a: 1 };
  const themeBgHsl = rgb2hsl(themeBgRgb.r, themeBgRgb.g, themeBgRgb.b);

  const themeTextRgb = parseRgb(tokens.text) ?? { r: 230, g: 234, b: 242, a: 1 };
  const themeTextHsl = rgb2hsl(themeTextRgb.r, themeTextRgb.g, themeTextRgb.b);

  const themeBorderRgb = parseRgb(tokens.border) ?? { r: 44, g: 55, b: 80, a: 1 };
  const themeBorderHsl = rgb2hsl(themeBorderRgb.r, themeBorderRgb.g, themeBorderRgb.b);

  const themeAccentRgb = parseRgb(tokens.accent) ?? { r: 108, g: 156, b: 255, a: 1 };
  const themeAccentHsl = rgb2hsl(themeAccentRgb.r, themeAccentRgb.g, themeAccentRgb.b);

  const cache = new Map<string, string>();
  const floor = isHighContrast ? 7.0 : 4.5;

  const meets = (hex: string, b: Backdrop): boolean => contrastRatio(hex, b.dark) >= floor && contrastRatio(hex, b.light) >= floor;

  // The rule before backdrops were known; kept as the first choice so ordinary pages keep their colours.
  const onThemeBg = (hex: string): string => (contrastRatio(hex, tokens.bg) < floor ? nudgeForeground(hex, tokens.bg, floor) : hex);

  // Lightness steps in one fixed direction until every colour in `on` is at the floor.
  function push(hex: string, dir: 1 | -1, on: string[]): string {
    const c = parseRgb(hex)!;
    const [h, s, l] = rgb2hsl(c.r, c.g, c.b);
    for (let step = 1; step <= 50; step++) {
      const [r, g, b] = hsl2rgb(h, s, clamp(l + dir * step * 0.02, 0, 1));
      const next = toHex(r, g, b);
      if (on.every((bg) => contrastRatio(next, bg) >= floor)) return next;
    }
    return dir > 0 ? "#ffffff" : "#000000";
  }

  // Pixels the engine cannot see. All it may assume is that the page's own colour met the floor on
  // them, so they sit at least that far on the other side of the range: the grey at exactly the floor
  // from `orig`. Layers painted over the pixels (a scrim) narrow dark..light; interpolate inside it.
  function estimate(orig: string, b: Backdrop): { hex: string; origLight: boolean } {
    const lo = hexLuminance(orig);
    const origLight = contrastRatio(orig, "#000000") >= contrastRatio(orig, "#ffffff");
    const t = origLight ? clamp((lo + 0.05) / floor - 0.05, 0, 1) : clamp(floor * (lo + 0.05) - 0.05, 0, 1);
    const ld = hexLuminance(b.dark);
    let hex = greyWithLuminance(ld + (hexLuminance(b.light) - ld) * t);
    // Rounding to a whole channel may land a hair inside the floor; step it out so `orig` itself passes.
    for (let i = 0; i < 8 && contrastRatio(orig, hex) < floor; i++) {
      const v = parseRgb(hex)!.r + (origLight ? -1 : 1);
      hex = toHex(v, v, v);
    }
    return { hex, origLight };
  }

  // `mapped` is the theme's choice for the page colour `orig`; both #rrggbb.
  function onBackdrop(mapped: string, orig: string, b: Backdrop): string {
    if (b.image) {
      if (meets(mapped, b)) return mapped; // readable whatever the pixels are (a strong scrim)
      const e = estimate(orig, b);
      // Never take the text across to the image's side (the theme's default would do that).
      const base = hexLuminance(mapped) > hexLuminance(e.hex) === e.origLight ? mapped : orig;
      return contrastRatio(base, e.hex) >= floor ? base : push(base, e.origLight ? 1 : -1, [e.hex]);
    }
    const today = onThemeBg(mapped);
    if (meets(today, b)) return today;
    if (meets(mapped, b)) return mapped;
    return nudgeOnAll(mapped, b.dark === b.light ? [b.dark] : [b.dark, b.light], floor);
  }

  function transformColor(str: string, role: Role, backdrop?: Backdrop): string {
    const key = backdrop && role === "text" ? `${role}|${str}|${backdrop.dark}${backdrop.light}${backdrop.image ? "i" : ""}` : `${role}|${str}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;

    let parsed = parseRgb(str);
    if (!parsed && typeof document !== "undefined") {
      const norm = normalizeCssColor(str);
      if (norm !== str) parsed = parseRgb(norm);
    }

    if (!parsed || parsed.a <= 0.001) {
      cache.set(key, str);
      return str;
    }

    let [h, s, l] = rgb2hsl(parsed.r, parsed.g, parsed.b);
    const isSaturated = s > 0.35 && l > 0.12 && l < 0.9;

    if (isHighContrast) {
      // Pure extremes, text contrast >= 7:1, strong borders, no tint.
      if (role === "bg") {
        h = 0;
        s = 0;
        l = 0; // Pure black
      } else if (role === "border") {
        h = 0;
        s = 0;
        l = 1.0; // Strong pure white border
      } else {
        // text / fill / stroke
        if (isSaturated) {
          // Keep hue for distinct links/badges, ensure high contrast
          s = 1.0;
          l = h >= 50 && h <= 170 ? 0.7 : 0.85; // yellow/green vs blue/magenta
        } else if (l > 0.3 && l < 0.7) {
          // Muted text
          h = 0;
          s = 0;
          l = 0.88;
        } else {
          h = 0;
          s = 0;
          l = 1.0; // Pure white
        }
      }
    } else if (isThemeDark) {
      if (native === "light") {
        // Light page -> dark theme: invert lightness and tint toward theme
        if (role === "bg") {
          if (isSaturated) {
            h = lerpHue(h, themeAccentHsl[0], 0.2);
            s = Math.min(s, 0.85);
            l = clamp(l * 0.82, 0.2, 0.58);
          } else {
            l = l >= 0.5 ? themeBgHsl[2] + (1 - l) * 0.35 : themeBgHsl[2] * 0.5 + l * 0.45;
            h = themeBgHsl[0];
            s = themeBgHsl[1] * 0.8;
          }
        } else if (role === "border") {
          if (isSaturated) {
            h = lerpHue(h, themeAccentHsl[0], 0.2);
            l = clamp(l, 0.3, 0.65);
          } else {
            l = l >= 0.5 ? themeBorderHsl[2] + (1 - l) * 0.3 : themeBorderHsl[2] + l * 0.3;
            h = themeBorderHsl[0];
            s = themeBorderHsl[1] * 0.8;
          }
        } else {
          // text / fill / stroke
          if (isSaturated) {
            h = lerpHue(h, themeAccentHsl[0], 0.25);
            s = s * 0.9;
            l = l < 0.6 ? 0.78 - l * 0.3 : l;
          } else {
            l = l < 0.5 ? 0.93 - l * 0.35 : 0.755 + (l - 0.5) * 0.4;
            h = themeTextHsl[0];
            s = themeTextHsl[1] * 0.8;
          }
        }
      } else {
        // Dark page -> dark theme: page already matches dark, change little or nothing
        if (role === "bg") {
          if (isSaturated) {
            h = lerpHue(h, themeAccentHsl[0], 0.15);
          } else {
            h = lerpHue(h, themeBgHsl[0], 0.35);
            s = clamp(s * 0.7 + themeBgHsl[1] * 0.3, 0, 0.4);
          }
        } else if (role === "border") {
          if (isSaturated) {
            h = lerpHue(h, themeAccentHsl[0], 0.15);
          } else {
            h = lerpHue(h, themeBorderHsl[0], 0.35);
            s = clamp(s * 0.7 + themeBorderHsl[1] * 0.3, 0, 0.4);
          }
        } else {
          if (isSaturated) {
            h = lerpHue(h, themeAccentHsl[0], 0.2);
          } else {
            h = lerpHue(h, themeTextHsl[0], 0.3);
            s = clamp(s * 0.7 + themeTextHsl[1] * 0.3, 0, 0.4);
          }
        }
      }
    } else {
      // Light theme (calm-light, ocean, warm-paper, field)
      if (native === "dark") {
        // Dark page -> light theme: invert lightness and tint toward theme
        if (role === "bg") {
          if (isSaturated) {
            h = lerpHue(h, themeAccentHsl[0], 0.2);
            l = clamp(l, 0.4, 0.62);
          } else {
            l = l >= 0.5 ? 0.83 + (l - 0.5) * 0.3 : themeBgHsl[2] - l * 0.3;
            h = themeBgHsl[0];
            s = themeBgHsl[1];
          }
        } else if (role === "border") {
          if (isSaturated) {
            h = lerpHue(h, themeAccentHsl[0], 0.2);
            l = clamp(l, 0.4, 0.7);
          } else {
            l = l < 0.5 ? themeBorderHsl[2] + (0.5 - l) * 0.2 : 0.75 + (l - 0.5) * 0.2;
            h = themeBorderHsl[0];
            s = themeBorderHsl[1];
          }
        } else {
          if (isSaturated) {
            h = lerpHue(h, themeAccentHsl[0], 0.2);
            l = l > 0.4 ? 0.58 - l * 0.25 : clamp(l, 0.2, 0.45);
          } else {
            l = l >= 0.5 ? 0.1 + (1 - l) * 0.35 : themeTextHsl[2] + l * 0.47;
            h = themeTextHsl[0];
            s = themeTextHsl[1];
          }
        }
      } else {
        // Light page -> light theme: keep light pages light, retint hue/sat toward theme background
        if (role === "bg") {
          if (isSaturated) {
            h = lerpHue(h, themeAccentHsl[0], 0.15);
          } else if (l >= 0.75) {
            // Light background: tint toward theme background
            l = clamp(themeBgHsl[2] - (1 - l) * 0.15, 0.7, 0.99);
            h = themeBgHsl[0];
            s = themeBgHsl[1];
          } else {
            // Darker background in light page
            h = lerpHue(h, themeBgHsl[0], 0.3);
            s = clamp(s * 0.7 + themeBgHsl[1] * 0.3, 0, 0.4);
          }
        } else if (role === "border") {
          if (isSaturated) {
            h = lerpHue(h, themeAccentHsl[0], 0.15);
          } else {
            l = clamp(themeBorderHsl[2] + (l - 0.8) * 0.2, 0.65, 0.95);
            h = themeBorderHsl[0];
            s = themeBorderHsl[1];
          }
        } else {
          // text
          if (isSaturated) {
            h = lerpHue(h, themeAccentHsl[0], 0.2);
          } else if (l <= 0.45) {
            // Dark text: tint toward theme text
            l = clamp(themeTextHsl[2] + l * 0.2, 0.08, 0.25);
            h = themeTextHsl[0];
            s = themeTextHsl[1];
          } else {
            // Muted text
            h = themeTextHsl[0];
            s = themeTextHsl[1] * 0.6;
          }
        }
      }
    }

    let rgb = hsl2rgb(h, clamp(s, 0, 1), clamp(l, 0, 1));

    // I10: text meets the floor against what is behind it (the theme background when unknown).
    if (role === "text") {
      const mapped = toHex(rgb[0], rgb[1], rgb[2]);
      const hex = backdrop ? onBackdrop(mapped, toHex(parsed.r, parsed.g, parsed.b), backdrop) : onThemeBg(mapped);
      if (hex !== mapped) {
        const fixed = parseRgb(hex);
        if (fixed) rgb = [fixed.r, fixed.g, fixed.b];
      }
    }

    const out = toCss(rgb[0], rgb[1], rgb[2], parsed.a);
    cache.set(key, out);
    return out;
  }

  function fit(str: string, b: Backdrop): string {
    const p = parseRgb(str);
    if (!p || p.a <= 0.001) return str;
    const hex = toHex(p.r, p.g, p.b);
    if (meets(hex, b)) return str;
    // Over unseen pixels the painted colour is its own reference (see estimate): nothing to lift.
    if (b.image) return str;
    const fixed = parseRgb(nudgeOnAll(hex, b.dark === b.light ? [b.dark] : [b.dark, b.light], floor));
    return fixed ? toCss(fixed.r, fixed.g, fixed.b, p.a) : str;
  }

  return Object.assign(transformColor, { fit });
}
