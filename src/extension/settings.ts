import { DEFAULT_MODELS, PROVIDER_IDS, type ProviderId } from "../config.ts";
import { DEFAULT_THEME_ID, isBuiltinThemeId, type BuiltinThemeId } from "../themes/index.ts";
import { storageGet, storageSet } from "./api.ts";

export interface Settings {
  theme: BuiltinThemeId;
  blocklist: string[];
  /** Fallback order for AI calls. */
  order: ProviderId[];
  models: Record<ProviderId, string>;
  aiCallsToday: { date: string; count: number };
}

const KEY = "settings";
const MODEL_ID = /^[A-Za-z0-9._/:-]{1,100}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const defaultSettings = (): Settings => ({
  theme: DEFAULT_THEME_ID,
  blocklist: [],
  order: [...PROVIDER_IDS],
  models: { ...DEFAULT_MODELS },
  aiCallsToday: { date: "", count: 0 },
});

const isProviderId = (v: unknown): v is ProviderId => typeof v === "string" && (PROVIDER_IDS as readonly string[]).includes(v);

/** Reads stored settings, ignoring anything that does not validate. */
export function parseSettings(raw: unknown): Settings {
  const out = defaultSettings();
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as Record<string, unknown>;
  if (isBuiltinThemeId(r["theme"])) out.theme = r["theme"];
  if (Array.isArray(r["blocklist"])) {
    out.blocklist = r["blocklist"].filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 253).slice(0, 200);
  }
  if (Array.isArray(r["order"])) {
    const order = [...new Set(r["order"].filter(isProviderId))];
    if (order.length > 0) out.order = order;
  }
  if (typeof r["models"] === "object" && r["models"] !== null) {
    const m = r["models"] as Record<string, unknown>;
    for (const id of PROVIDER_IDS) {
      const v = m[id];
      if (typeof v === "string" && MODEL_ID.test(v)) out.models[id] = v;
    }
  }
  const calls = r["aiCallsToday"];
  if (typeof calls === "object" && calls !== null) {
    const { date, count } = calls as Record<string, unknown>;
    if (typeof date === "string" && DAY.test(date) && typeof count === "number" && Number.isInteger(count) && count >= 0 && count <= 100000) {
      out.aiCallsToday = { date, count };
    }
  }
  return out;
}

export async function loadSettings(): Promise<Settings> {
  return parseSettings(await storageGet(KEY));
}

export async function saveSettings(s: Settings): Promise<void> {
  await storageSet(KEY, s);
}

/** AI calls made on `today` (YYYY-MM-DD); the counter resets when the date changes. */
export const callsOn = (s: Settings, today: string): number => (s.aiCallsToday.date === today ? s.aiCallsToday.count : 0);
