import { nudgeForeground, nudgeOnAll } from "./color.ts";
import { contrastFailures } from "./contrast.ts";
import type { Tokens } from "./schema.ts";

/**
 * Repairs the colours of a plan that failed the SPEC 10 contrast targets by nudging foreground lightness, keeping hues.
 * bg, surface and border are never changed. Returns the repaired tokens, or undefined when nudging cannot reach every target
 * (then the caller falls back to a built-in theme).
 */
export function repairTokens(themeId: string, t: Tokens): Tokens | undefined {
  const textMin = themeId === "high-contrast" ? 7 : 4.5;
  const repaired: Tokens = {
    ...t,
    text: nudgeOnAll(t.text, [t.bg, t.surface], textMin),
    muted: nudgeOnAll(t.muted, [t.bg, t.surface], 4.5),
    link: nudgeOnAll(t.link, [t.bg, t.surface], 4.5),
    accent: nudgeForeground(t.accent, t.bg, 3),
    focus: nudgeForeground(t.focus, t.bg, 3),
  };
  return contrastFailures(themeId, repaired).length === 0 ? repaired : undefined;
}
