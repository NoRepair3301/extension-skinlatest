import { mix, nudgeOnAll, readableOn } from "./color.ts";
import { contrastRatio } from "./contrast.ts";
import type { Tokens } from "./schema.ts";

/** WCAG AA for normal text. Every foreground/background pair the compiler emits must reach this. */
export const AA = 4.5;

/** Colours the element templates need that the plan does not carry; all derived from the plan tokens. */
export interface Derived {
  onAccent: string;
  accentHover: string;
  surfaceAlt: string;
  headerBg: string;
  linkHover: string;
  linkVisited: string;
  /** Disabled buttons: muted text on surfaceAlt. */
  disabledFg: string;
}

export interface Pair {
  name: string;
  fg: string;
  bg: string;
  min: number;
}

/** Foreground/background pairs of the element templates, for the compiler's self-check and the tests. */
export function pairsOf(t: Tokens, d: Derived): Pair[] {
  return [
    { name: "text/bg", fg: t.text, bg: t.bg, min: AA },
    { name: "text/surface", fg: t.text, bg: t.surface, min: AA },
    { name: "text/surfaceAlt", fg: t.text, bg: d.surfaceAlt, min: AA },
    { name: "text/headerBg", fg: t.text, bg: d.headerBg, min: AA },
    { name: "muted/bg", fg: t.muted, bg: t.bg, min: AA },
    { name: "muted/surface", fg: t.muted, bg: t.surface, min: AA },
    { name: "muted/surfaceAlt", fg: t.muted, bg: d.surfaceAlt, min: AA },
    { name: "link/bg", fg: t.link, bg: t.bg, min: AA },
    { name: "link/surface", fg: t.link, bg: t.surface, min: AA },
    { name: "link/surfaceAlt", fg: t.link, bg: d.surfaceAlt, min: AA },
    { name: "linkHover/bg", fg: d.linkHover, bg: t.bg, min: AA },
    { name: "linkHover/surface", fg: d.linkHover, bg: t.surface, min: AA },
    { name: "linkVisited/bg", fg: d.linkVisited, bg: t.bg, min: AA },
    { name: "linkVisited/surface", fg: d.linkVisited, bg: t.surface, min: AA },
    { name: "onAccent/accent", fg: d.onAccent, bg: t.accent, min: AA },
    { name: "onAccent/accentHover", fg: d.onAccent, bg: d.accentHover, min: AA },
    { name: "disabledFg/surfaceAlt", fg: d.disabledFg, bg: d.surfaceAlt, min: AA },
  ];
}

/**
 * Derives the extra colours. Each one is nudged until its pairs pass AA; a colour that cannot pass falls back on its own
 * (surfaceAlt to surface, accentHover to accent, text colours to black or white), never the whole theme.
 */
export function deriveColors(t: Tokens): Derived {
  // Text on the accent button: the plan's own surface or bg when they read, else black or white.
  const onAccent = [t.surface, t.bg].find((c) => contrastRatio(c, t.accent) >= AA) ?? readableOn(t.accent);

  const hoverTarget = readableOn(onAccent) === "#000000" ? "#000000" : "#ffffff"; // darken for light text, lighten for dark text
  const hoverCandidate = mix(t.accent, hoverTarget, 0.18);
  const accentHover = contrastRatio(onAccent, hoverCandidate) >= AA ? hoverCandidate : t.accent;

  /** A tint of text over `base` that keeps text, muted and link readable on it. */
  const tint = (base: string, amounts: number[]): string => {
    for (const a of amounts) {
      const c = mix(base, t.text, a);
      if ([t.text, t.muted, t.link].every((fg) => contrastRatio(fg, c) >= AA)) return c;
    }
    return base;
  };
  const surfaceAlt = tint(t.surface, [0.05, 0.03, 0.015]);
  const headerBg = tint(t.surface, [0.12, 0.08, 0.05, 0.03]);

  const linkHover = nudgeOnAll(mix(t.link, t.text, 0.4), [t.bg, t.surface], AA);
  const linkVisited = nudgeOnAll(mix(t.link, t.muted, 0.45), [t.bg, t.surface], AA);
  const disabledFg = nudgeOnAll(t.muted, [surfaceAlt], AA);

  return { onAccent, accentHover, surfaceAlt, headerBg, linkHover, linkVisited, disabledFg };
}
