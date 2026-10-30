import type { Fingerprint } from "../core/types.ts";
import { ASSET_ID } from "../features/assets/types.ts";
import type { AssetPlacement } from "../features/assets/types.ts";
import { isDensity, isLaneChoice, isSceneId, type Density, type LaneChoice } from "../features/scenes/types.ts";
import type { SceneId, StylePlan } from "../plan/schema.ts";
import { storageGet, storageSet } from "./api.ts";
import { originOf, toOrigin } from "./origin.ts";
import { parseRepairCss } from "../plan/readability.ts";
import { parsePlacement, parseSettings, type PetSettings } from "./settings.ts";

export { originOf, toOrigin };

export const SITES_KEY = "sites";
export const SITE_VERSION = 1;
export const MAX_SITES = 200;
const MAX_BLUR = 50;

/**
 * The art saved for a site: whether art was on (the scene follows the theme), the pet look and the chosen asset. Choices only, never
 * page data. `scene` is the older form (a saved scene id): it is still read and counts as art on.
 */
export interface SiteLook {
  art?: boolean;
  scene?: { id: SceneId; density: Density; lane: LaneChoice };
  pet?: Omit<PetSettings, "enabled" | "disabledOrigins">;
  asset?: AssetPlacement;
}

export interface SiteRecord {
  v: 1;
  /** Re-validated by the applier on every use; never trusted here. */
  plan: StylePlan;
  fingerprint: Fingerprint;
  provider: string;
  model: string;
  promptVersion: string;
  savedAt: string;
  mode: "ask" | "auto";
  blur: string[];
  blurImages: boolean;
  look?: SiteLook;
  /** Colour-only repair rules found when the theme was kept (structural selectors, no text); applied before first paint. */
  repairCss?: string;
}

export type Sites = Record<string, SiteRecord>;

const MODEL = /^[A-Za-z0-9._/:-]{1,100}$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Version dispatch. Older versions would be upgraded here; today only v1 exists. */
export function migrate(raw: unknown): unknown {
  if (!isObj(raw)) return undefined;
  if (raw["v"] === 1) return raw;
  return undefined;
}

const isObjLike = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A saved look read back from storage; every part is re-validated and anything unknown is dropped. */
export function parseLook(raw: unknown): SiteLook | undefined {
  if (!isObjLike(raw)) return undefined;
  const out: SiteLook = {};
  if (typeof raw["art"] === "boolean") out.art = raw["art"];
  const sc = raw["scene"];
  if (isObjLike(sc) && isSceneId(sc["id"]) && sc["id"] !== "none" && isDensity(sc["density"]) && isLaneChoice(sc["lane"])) out.scene = { id: sc["id"], density: sc["density"], lane: sc["lane"] };
  if (isObjLike(raw["pet"])) {
    const p = parseSettings({ pet: raw["pet"] }).pet;
    out.pet = { kind: p.kind, size: p.size, corner: p.corner, motion: p.motion, direction: p.direction, edge: p.edge, speed: p.speed, sleepWhenIdle: p.sleepWhenIdle, keepInFreeSpace: p.keepInFreeSpace, edgeFallback: p.edgeFallback };
  }
  const a = raw["asset"];
  if (isObjLike(a) && typeof a["assetId"] === "string" && ASSET_ID.test(a["assetId"])) out.asset = parsePlacement(a);
  if (out.scene && out.art === undefined) out.art = true;
  return out.art !== undefined || out.pet || out.asset ? out : undefined;
}

/** Shape check only (the plan itself is validated at apply time). Returns undefined for anything corrupt. */
export function parseSite(input: unknown): SiteRecord | undefined {
  const raw = migrate(input);
  if (!isObj(raw)) return undefined;
  const { plan, fingerprint, provider, model, promptVersion, savedAt, mode, blur, blurImages, look, repairCss } = raw;
  if (!isObj(plan) || plan["v"] !== 1 || typeof plan["themeId"] !== "string" || !isObj(plan["tokens"]) || !Array.isArray(plan["regionRules"]) || !Array.isArray(plan["reasons"])) return undefined;
  if (!isObj(fingerprint) || typeof fingerprint["hash"] !== "string" || !/^[0-9a-f]{8}$/.test(fingerprint["hash"]) || typeof fingerprint["seq"] !== "string" || !/^[a-z]{0,40}$/.test(fingerprint["seq"])) return undefined;
  if (typeof provider !== "string" || provider.length === 0 || provider.length > 40) return undefined;
  if (typeof model !== "string" || !MODEL.test(model)) return undefined;
  if (typeof promptVersion !== "string" || promptVersion.length > 20) return undefined;
  if (typeof savedAt !== "string" || Number.isNaN(Date.parse(savedAt))) return undefined;
  if (mode !== "ask" && mode !== "auto") return undefined;
  const blurList = blur === undefined ? [] : blur;
  if (!Array.isArray(blurList) || blurList.length > MAX_BLUR || blurList.some((s) => typeof s !== "string" || s.length === 0 || s.length > 200)) return undefined;
  if (blurImages !== undefined && typeof blurImages !== "boolean") return undefined;
  const parsedLook = parseLook(look);
  return {
    v: 1,
    plan: plan as unknown as StylePlan,
    fingerprint: { hash: fingerprint["hash"], seq: fingerprint["seq"] },
    provider,
    model,
    promptVersion,
    savedAt,
    mode,
    blur: blurList as string[],
    blurImages: blurImages === true,
    ...(parsedLook ? { look: parsedLook } : {}),
    // A stored sheet that is not exactly what we write is dropped, never applied.
    ...(typeof repairCss === "string" && repairCss !== "" && parseRepairCss(repairCss) ? { repairCss } : {}),
  };
}

/** Keeps only origin-keyed, well-formed records. */
export function parseSites(raw: unknown): Sites {
  const out: Sites = {};
  if (!isObj(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    const origin = toOrigin(key);
    const rec = origin ? parseSite(value) : undefined;
    if (origin && rec) out[origin] = rec;
  }
  return out;
}

const time = (r: SiteRecord): number => Date.parse(r.savedAt);

/** Adds or replaces a record; above the cap the oldest records (by savedAt) are dropped. Pure. */
export function withSite(sites: Sites, origin: string, record: SiteRecord, cap: number = MAX_SITES): Sites {
  const next: Sites = { ...sites, [origin]: record };
  const keys = Object.keys(next);
  if (keys.length <= cap) return next;
  const oldestFirst = keys.filter((k) => k !== origin).sort((a, b) => time(next[a]!) - time(next[b]!));
  for (const k of oldestFirst.slice(0, keys.length - cap)) delete next[k];
  return next;
}

export async function loadSites(): Promise<Sites> {
  return parseSites(await storageGet(SITES_KEY));
}

export async function getSite(origin: string): Promise<SiteRecord | undefined> {
  const o = toOrigin(origin);
  return o ? (await loadSites())[o] : undefined;
}

export async function saveSite(origin: string, record: SiteRecord): Promise<boolean> {
  const o = toOrigin(origin);
  if (!o) return false;
  await storageSet(SITES_KEY, withSite(await loadSites(), o, record));
  return true;
}

export async function removeSite(origin: string): Promise<void> {
  const sites = await loadSites();
  delete sites[origin];
  await storageSet(SITES_KEY, sites);
}

export async function clearSites(): Promise<void> {
  await storageSet(SITES_KEY, {});
}
