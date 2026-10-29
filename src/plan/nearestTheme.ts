import type { StructuralSummary } from "../core/types.ts";
import { getTheme, THEMES, type BuiltinThemeId } from "../themes/index.ts";

const HEX = /^#[0-9a-fA-F]{6}$/;
const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const dist = (a: string, b: string): number => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
};

/** The most common region background of the page, or white when there are no regions. */
function pageBackground(summary: StructuralSummary): string {
  const count = new Map<string, number>();
  for (const r of summary.regions) count.set(r.style.bg, (count.get(r.style.bg) ?? 0) + 1);
  let best = "#ffffff";
  let n = 0;
  for (const [bg, c] of count) if (c > n) [best, n] = [bg, c];
  return best;
}

/**
 * The built-in theme whose background is closest to `hintBg` (a rejected AI plan's bg, when it was a valid colour)
 * or else to the page's own background.
 */
export function nearestTheme(summary: StructuralSummary, hintBg?: unknown): BuiltinThemeId {
  const target = typeof hintBg === "string" && HEX.test(hintBg) ? hintBg.toLowerCase() : pageBackground(summary);
  let best = THEMES[0]!.id;
  let bestD = Infinity;
  for (const t of THEMES) {
    const d = dist(target, getTheme(t.id).tokens.bg);
    if (d < bestD) [best, bestD] = [t.id, d];
  }
  return best;
}
