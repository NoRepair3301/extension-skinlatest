import { DEFAULT_MODELS, PROVIDER_IDS, type ProviderId } from "../config.ts";
import { DEFAULT_THEME_ID, isBuiltinThemeId, type BuiltinThemeId } from "../themes/index.ts";
import { storageGet, storageSet } from "./api.ts";
import { toOrigin } from "./origin.ts";

export const PET_KINDS = ["pebble", "sprout"] as const;
export const PET_SIZES = ["small", "medium", "large"] as const;
export const PET_CORNERS = ["bottom-right", "bottom-left", "top-right", "top-left"] as const;
export type PetKind = (typeof PET_KINDS)[number];
export type PetSize = (typeof PET_SIZES)[number];
export type PetCorner = (typeof PET_CORNERS)[number];

export interface PetSettings {
  enabled: boolean;
  kind: PetKind;
  size: PetSize;
  corner: PetCorner;
  /** Origins only. */
  disabledOrigins: string[];
}

export interface Settings {
  theme: BuiltinThemeId;
  blocklist: string[];
  /** Fallback order for AI calls. */
  order: ProviderId[];
  models: Record<ProviderId, string>;
  aiCallsToday: { date: string; count: number };
  /** Set once the user accepts the consent text; asked again when CONSENT_VERSION changes. */
  consent: { version: number; acceptedAt: string } | null;
  pet: PetSettings;
}

const KEY = "settings";
const MODEL_ID = /^[A-Za-z0-9._/:-]{1,100}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const defaultSettings = (): Settings => ({
  theme: DEFAULT_THEME_ID,
  blocklist: [],
  order: ["groq", "gemini"], // Groq first: faster and valid in the 2026-10-30 bake-off (docs/HUMAN_CHECKS.md)
  models: { ...DEFAULT_MODELS },
  aiCallsToday: { date: "", count: 0 },
  consent: null,
  pet: { enabled: false, kind: "pebble", size: "medium", corner: "bottom-right", disabledOrigins: [] },
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
  const consent = r["consent"];
  if (typeof consent === "object" && consent !== null) {
    const { version, acceptedAt } = consent as Record<string, unknown>;
    if (typeof version === "number" && Number.isInteger(version) && version >= 0 && typeof acceptedAt === "string" && acceptedAt.length <= 40) {
      out.consent = { version, acceptedAt };
    }
  }
  const pet = r["pet"];
  if (typeof pet === "object" && pet !== null) {
    const p = pet as Record<string, unknown>;
    if (p["enabled"] === true) out.pet.enabled = true;
    const pick = <T extends string>(list: readonly T[], v: unknown): T | undefined => list.find((x) => x === v);
    out.pet.kind = pick(PET_KINDS, p["kind"]) ?? out.pet.kind;
    out.pet.size = pick(PET_SIZES, p["size"]) ?? out.pet.size;
    out.pet.corner = pick(PET_CORNERS, p["corner"]) ?? out.pet.corner;
    if (Array.isArray(p["disabledOrigins"])) {
      out.pet.disabledOrigins = [...new Set(p["disabledOrigins"].filter((v): v is string => toOrigin(v) !== undefined))].slice(0, 200);
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
