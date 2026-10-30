import { contrastRatio } from "./contrast.ts";

type Rgb = [number, number, number];

const toRgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const toHex = ([r, g, b]: Rgb): string => "#" + [r, g, b].map((c) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, "0")).join("");

/** a * (1 - t) + b * t, both #rrggbb. */
export function mix(a: string, b: string, t: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex([x[0] * (1 - t) + y[0] * t, x[1] * (1 - t) + y[1] * t, x[2] * (1 - t) + y[2] * t]);
}

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

const BLACK = "#000000";
const WHITE = "#ffffff";

/** The better of black and white on `bg`. */
export const readableOn = (bg: string): string => (contrastRatio(BLACK, bg) >= contrastRatio(WHITE, bg) ? BLACK : WHITE);

/**
 * Moves `fg` in lightness (keeping its hue) away from `bg` until the pair reaches `min`.
 * If lightness alone cannot reach it, the result is black or white, whichever reads better on `bg`.
 */
export function nudgeForeground(fg: string, bg: string, min: number): string {
  if (contrastRatio(fg, bg) >= min) return fg;
  const [h, s, l] = toHsl(toRgb(fg));
  const dir = contrastRatio(BLACK, bg) >= contrastRatio(WHITE, bg) ? -1 : 1;
  for (let step = 1; step <= 50; step++) {
    const next = fromHsl(h, s, clamp(l + dir * step * 0.02, 0, 1));
    if (contrastRatio(next, bg) >= min) return next;
  }
  return readableOn(bg);
}

/** Nudges `fg` until it passes on every background in the list. Falls back to black or white for the whole list. */
export function nudgeOnAll(fg: string, bgs: readonly string[], min: number): string {
  let cur = fg;
  for (let round = 0; round < 3; round++) {
    for (const bg of bgs) cur = nudgeForeground(cur, bg, min);
    if (bgs.every((bg) => contrastRatio(cur, bg) >= min)) return cur;
  }
  const dark = bgs.every((bg) => contrastRatio(BLACK, bg) >= min);
  const light = bgs.every((bg) => contrastRatio(WHITE, bg) >= min);
  return dark ? BLACK : light ? WHITE : readableOn(bgs[0] ?? WHITE);
}

