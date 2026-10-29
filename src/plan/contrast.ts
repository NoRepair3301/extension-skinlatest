import type { Tokens } from "./schema.ts";

const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of #rrggbb. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const isDark = (bg: string): boolean => luminance(bg) < 0.18;

/** SPEC 10 targets: text 4.5 (7 for high-contrast), link 4.5, muted 4.5, accent 3, focus 3, all against bg. Text, link and muted are also checked on surface. */
export function contrastFailures(themeId: string, t: Tokens): string[] {
  const out: string[] = [];
  const need = (name: string, fg: string, bg: string, min: number, bgName: string) => {
    const r = contrastRatio(fg, bg);
    if (r < min) out.push(`${themeId}: ${name}/${bgName} ${r.toFixed(2)} < ${min}`);
  };
  need("text", t.text, t.bg, themeId === "high-contrast" ? 7 : 4.5, "bg");
  need("link", t.link, t.bg, 4.5, "bg");
  need("muted", t.muted, t.bg, 4.5, "bg");
  need("accent", t.accent, t.bg, 3, "bg");
  need("focus", t.focus, t.bg, 3, "bg");
  need("text", t.text, t.surface, themeId === "high-contrast" ? 7 : 4.5, "surface");
  need("link", t.link, t.surface, 4.5, "surface");
  need("muted", t.muted, t.surface, 4.5, "surface");
  return out;
}
