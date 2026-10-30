import { contrastRatio } from "../plan/contrast.ts";
import { deriveColors } from "../plan/derive.ts";
import { THEMES, isBuiltinThemeId } from "../themes/index.ts";

const ROLE_NAMES = ["--ui-bg", "--ui-surface", "--ui-surface-alt", "--ui-text", "--ui-muted", "--ui-border", "--ui-accent", "--ui-on-accent", "--ui-focus", "--ui-link"] as const;

/** The colour roles of our own UI, taken from the active built-in theme. `auto` (or an unknown id) keeps the light/dark defaults of tokens.css. */
export function uiRoles(themeId: string): Record<string, string> | undefined {
  if (!isBuiltinThemeId(themeId)) return undefined;
  const t = THEMES.find((x) => x.id === themeId)!.tokens;
  const d = deriveColors(t);
  return {
    "--ui-bg": t.bg, "--ui-surface": t.surface, "--ui-surface-alt": d.surfaceAlt, "--ui-text": t.text, "--ui-muted": t.muted,
    "--ui-border": t.border, "--ui-accent": t.accent, "--ui-on-accent": d.onAccent, "--ui-focus": t.focus, "--ui-link": t.link,
  };
}

/** Every text-on-background pair our UI draws; used by the contrast test. */
export const UI_PAIRS: ReadonlyArray<readonly [fg: string, bg: string]> = [
  ["--ui-text", "--ui-bg"], ["--ui-text", "--ui-surface"], ["--ui-muted", "--ui-bg"], ["--ui-muted", "--ui-surface"],
  ["--ui-on-accent", "--ui-accent"], ["--ui-text", "--ui-surface-alt"], ["--ui-link", "--ui-bg"], ["--ui-link", "--ui-surface"],
];

export const pairRatio = (roles: Record<string, string>, fg: string, bg: string): number => contrastRatio(roles[fg]!, roles[bg]!);

/** Sets the roles on the document element of our own page; `auto` removes them again. */
export function applyUiTheme(doc: Document, themeId: string): void {
  const roles = uiRoles(themeId);
  const root = doc.documentElement;
  for (const k of ROLE_NAMES) root.style.removeProperty(k);
  if (!roles) return root.removeAttribute("data-ui-themed");
  root.setAttribute("data-ui-themed", "");
  for (const [k, v] of Object.entries(roles)) root.style.setProperty(k, v);
}
