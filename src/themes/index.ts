import type { StylePlan, Tokens } from "../plan/schema.ts";
import calmLight from "./calm-light.json" with { type: "json" };
import highContrast from "./high-contrast.json" with { type: "json" };
import midnight from "./midnight.json" with { type: "json" };
import ocean from "./ocean.json" with { type: "json" };
import warmPaper from "./warm-paper.json" with { type: "json" };

export const BUILTIN_THEME_IDS = ["calm-light", "midnight", "ocean", "warm-paper", "high-contrast"] as const;
export type BuiltinThemeId = (typeof BUILTIN_THEME_IDS)[number];
export const DEFAULT_THEME_ID: BuiltinThemeId = "calm-light";

export interface Theme {
  id: BuiltinThemeId;
  name: string;
  tokens: Tokens;
}

const raw = [calmLight, midnight, ocean, warmPaper, highContrast] as unknown as Theme[];

export const THEMES: readonly Theme[] = raw;

export const isBuiltinThemeId = (v: unknown): v is BuiltinThemeId => typeof v === "string" && (BUILTIN_THEME_IDS as readonly string[]).includes(v);

export function getTheme(id: BuiltinThemeId): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}

export type ThemePlan = Pick<StylePlan, "themeId" | "tokens">;
