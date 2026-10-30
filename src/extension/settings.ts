import { DEFAULT_MODELS, PROVIDER_IDS, type ProviderId } from "../config.ts";
import { ASSET_ID, ASSET_SIZES, ASSET_SPEEDS, PLACEMENTS, PRESETS, defaultPlacement, type AssetPlacement } from "../features/assets/types.ts";
import { isDensity, isLaneChoice, isSceneId, type Density, type LaneChoice, type SceneId } from "../features/scenes/types.ts";
import { DEFAULT_THEME_ID, getTheme, isThemeChoice, resolveTheme, type ThemeChoice } from "../themes/index.ts";
import { storageGet, storageSet } from "./api.ts";
import { toOrigin } from "./origin.ts";

export const PET_KINDS = ["fox", "cat", "bunny", "slime", "owl", "pebble", "sprout"] as const;
export const PET_SIZES = ["small", "medium", "large"] as const;
export const PET_CORNERS = ["bottom-right", "bottom-left", "top-right", "top-left"] as const;
export const PET_MOTIONS = ["still", "horizontal", "vertical"] as const;
export const PET_DIRECTIONS = ["forward", "backward", "bounce"] as const;
export const PET_EDGES = ["bottom", "top", "left", "right"] as const;
export const PET_SPEEDS = ["slow", "normal", "fast"] as const;
export type PetMotion = (typeof PET_MOTIONS)[number];
export type PetDirection = (typeof PET_DIRECTIONS)[number];
export type PetEdge = (typeof PET_EDGES)[number];
export type PetSpeed = (typeof PET_SPEEDS)[number];
export type PetKind = (typeof PET_KINDS)[number];
export type PetSize = (typeof PET_SIZES)[number];
export type PetCorner = (typeof PET_CORNERS)[number];

export interface PetSettings {
  enabled: boolean;
  kind: PetKind;
  size: PetSize;
  corner: PetCorner;
  /** still (default), horizontal or vertical walking. "forward" is left to right / top to bottom. */
  motion: PetMotion;
  direction: PetDirection;
  /** The viewport edge it walks along when it may leave the free gutters. */
  edge: PetEdge;
  speed: PetSpeed;
  sleepWhenIdle: boolean;
  /** Walk only inside the empty side gutters (default on). */
  keepInFreeSpace: boolean;
  /** A page with no empty side space: walk along the screen edge instead of staying in the corner (default on). */
  edgeFallback: boolean;
  /** Origins only. */
  disabledOrigins: string[];
}

/** Scene art in empty side space (Phase 10). "theme" means the theme's own default scene; "none" in `choice` is the same as off. */
export interface SceneSettings {
  enabled: boolean;
  choice: SceneId | "theme";
  density: Density;
  lane: LaneChoice;
}

export interface Settings {
  theme: ThemeChoice;
  blocklist: string[];
  /** Fallback order for AI calls. */
  order: ProviderId[];
  models: Record<ProviderId, string>;
  aiCallsToday: { date: string; count: number };
  /** Set once the user accepts the consent text; asked again when CONSENT_VERSION changes. */
  consent: { version: number; acceptedAt: string } | null;
  /** Second consent (colour details of unreadable parts), per origin. Revocable in Settings, Privacy. Origins only. */
  repairConsent: Record<string, { version: number; acceptedAt: string }>;
  pet: PetSettings;
  scene: SceneSettings;
  /** Which saved picture or video to show, and how (Phase 10). Only an id: the file lives under the `assets` key. */
  asset: AssetPlacement;
  /** True once the first-run welcome was finished or skipped (Phase 11). */
  welcomeDone: boolean;
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
  repairConsent: {},
  pet: { enabled: false, kind: "fox", size: "medium", corner: "bottom-right", motion: "still", direction: "bounce", edge: "bottom", speed: "normal", sleepWhenIdle: false, keepInFreeSpace: true, edgeFallback: true, disabledOrigins: [] },
  scene: { enabled: true, choice: "theme", density: "normal", lane: "both" },
  asset: defaultPlacement(),
  welcomeDone: false,
});

const isProviderId = (v: unknown): v is ProviderId => typeof v === "string" && (PROVIDER_IDS as readonly string[]).includes(v);

/** Reads stored settings, ignoring anything that does not validate. */
export function parseSettings(raw: unknown): Settings {
  const out = defaultSettings();
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as Record<string, unknown>;
  if (isThemeChoice(r["theme"])) out.theme = r["theme"];
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
  const rc = r["repairConsent"];
  if (typeof rc === "object" && rc !== null && !Array.isArray(rc)) {
    for (const [origin, v] of Object.entries(rc as Record<string, unknown>).slice(0, 200)) {
      const { version, acceptedAt } = (v ?? {}) as Record<string, unknown>;
      if (/^https?:\/\/[^/?#]+$/.test(origin) && typeof version === "number" && Number.isInteger(version) && typeof acceptedAt === "string" && acceptedAt.length <= 40) out.repairConsent[origin] = { version, acceptedAt };
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
    out.pet.motion = pick(PET_MOTIONS, p["motion"]) ?? out.pet.motion;
    out.pet.direction = pick(PET_DIRECTIONS, p["direction"]) ?? out.pet.direction;
    out.pet.edge = pick(PET_EDGES, p["edge"]) ?? out.pet.edge;
    out.pet.speed = pick(PET_SPEEDS, p["speed"]) ?? out.pet.speed;
    if (p["sleepWhenIdle"] === true) out.pet.sleepWhenIdle = true;
    if (p["keepInFreeSpace"] === false) out.pet.keepInFreeSpace = false;
    if (p["edgeFallback"] === false) out.pet.edgeFallback = false;
    if (Array.isArray(p["disabledOrigins"])) {
      out.pet.disabledOrigins = [...new Set(p["disabledOrigins"].filter((v): v is string => toOrigin(v) !== undefined))].slice(0, 200);
    }
  }
  const scene = r["scene"];
  if (typeof scene === "object" && scene !== null) {
    const sc = scene as Record<string, unknown>;
    if (sc["enabled"] === false) out.scene.enabled = false;
    if (sc["choice"] === "theme" || isSceneId(sc["choice"])) out.scene.choice = sc["choice"] as SceneSettings["choice"];
    if (isDensity(sc["density"])) out.scene.density = sc["density"];
    if (isLaneChoice(sc["lane"])) out.scene.lane = sc["lane"];
  }
  out.asset = parsePlacement(r["asset"]);
  if (r["welcomeDone"] === true) out.welcomeDone = true;
  return out;
}

/** A placement read from storage or from a site record; anything unknown falls back to the default (no asset). */
export function parsePlacement(raw: unknown): AssetPlacement {
  const out = defaultPlacement();
  if (typeof raw !== "object" || raw === null) return out;
  const a = raw as Record<string, unknown>;
  if (typeof a["assetId"] === "string" && ASSET_ID.test(a["assetId"])) out.assetId = a["assetId"];
  const pick = <T extends string>(list: readonly T[], v: unknown): T | undefined => list.find((x) => x === v);
  out.mode = pick(PLACEMENTS, a["mode"]) ?? out.mode;
  out.size = pick(ASSET_SIZES, a["size"]) ?? out.size;
  out.speed = pick(ASSET_SPEEDS, a["speed"]) ?? out.speed;
  out.preset = pick(PRESETS, a["preset"]) ?? out.preset;
  const o = a["opacity"];
  if (typeof o === "number" && Number.isInteger(o) && o >= 10 && o <= 100) out.opacity = o;
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

/** The pet settings plus the accent of the chosen theme (for the scarf or bow). Colours only; nothing from the page. */
export const petConfig = (s: Settings, prefersDark = false): PetSettings & { accent: string } => ({ ...s.pet, accent: getTheme(resolveTheme(s.theme, prefersDark)).tokens.accent });
