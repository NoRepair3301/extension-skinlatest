import { DEFAULT_THEME_ID, isBuiltinThemeId, type BuiltinThemeId } from "../themes/index.ts";
import { storageGet, storageSet } from "./api.ts";

export interface Settings {
  theme: BuiltinThemeId;
  blocklist: string[];
}

const KEY = "settings";

export const defaultSettings = (): Settings => ({ theme: DEFAULT_THEME_ID, blocklist: [] });

/** Reads stored settings, ignoring anything that does not validate. */
export function parseSettings(raw: unknown): Settings {
  const out = defaultSettings();
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as Record<string, unknown>;
  if (isBuiltinThemeId(r["theme"])) out.theme = r["theme"];
  if (Array.isArray(r["blocklist"])) {
    out.blocklist = r["blocklist"].filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 253).slice(0, 200);
  }
  return out;
}

export async function loadSettings(): Promise<Settings> {
  return parseSettings(await storageGet(KEY));
}

export async function saveSettings(s: Settings): Promise<void> {
  await storageSet(KEY, s);
}
