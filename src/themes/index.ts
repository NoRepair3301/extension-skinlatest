import type { SceneId, StylePlan, Tokens } from "../plan/schema.ts";
import calmLight from "./calm-light.json" with { type: "json" };
import field from "./field.json" with { type: "json" };
import highContrast from "./high-contrast.json" with { type: "json" };
import midnight from "./midnight.json" with { type: "json" };
import ocean from "./ocean.json" with { type: "json" };
import warmPaper from "./warm-paper.json" with { type: "json" };

export const BUILTIN_THEME_IDS = ["calm-light", "midnight", "ocean", "warm-paper", "high-contrast", "field"] as const;
export type BuiltinThemeId = (typeof BUILTIN_THEME_IDS)[number];
export const DEFAULT_THEME_ID: BuiltinThemeId = "calm-light";

export interface Theme {
  id: BuiltinThemeId;
  name: string;
  tokens: Tokens;
}

const raw = [calmLight, midnight, ocean, warmPaper, highContrast, field] as unknown as Theme[];

export const THEMES: readonly Theme[] = raw;

export const isBuiltinThemeId = (v: unknown): v is BuiltinThemeId => typeof v === "string" && (BUILTIN_THEME_IDS as readonly string[]).includes(v);

export function getTheme(id: BuiltinThemeId): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}

export type ThemePlan = Pick<StylePlan, "themeId" | "tokens">;

/** What the user can pick in the popup: the built-in themes plus "auto" (calm light by day, midnight in a dark colour scheme). */
export const THEME_CHOICES = [...BUILTIN_THEME_IDS, "auto"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];
export const isThemeChoice = (v: unknown): v is ThemeChoice => typeof v === "string" && (THEME_CHOICES as readonly string[]).includes(v);

/** "auto" follows prefers-color-scheme; any other choice is itself. */
export const resolveTheme = (choice: ThemeChoice, prefersDark: boolean): BuiltinThemeId => (choice === "auto" ? (prefersDark ? "midnight" : "calm-light") : choice);

/** Each theme's default scene (SPEC 4.3). High contrast never shows a scene. */
export const DEFAULT_SCENE_BY_THEME: Record<BuiltinThemeId, SceneId> = {
  "calm-light": "calm",
  midnight: "midnight-stars",
  ocean: "ocean",
  "warm-paper": "paper",
  "high-contrast": "none",
  field: "field",
};
