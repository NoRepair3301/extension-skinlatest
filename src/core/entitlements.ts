import { BUILTIN_THEME_IDS, type BuiltinThemeId } from "../themes/index.ts";

/** Everything is free (F3): no tier, no lock. */

/** All six built-in themes, in the app's order (also the only ids the AI is told about, plus "custom"). */
export const entitledThemes = (): readonly BuiltinThemeId[] => BUILTIN_THEME_IDS;
