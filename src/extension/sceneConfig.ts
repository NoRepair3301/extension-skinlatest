import type { AssetPlacement } from "../features/assets/types.ts";
import { isDark } from "../plan/contrast.ts";
import type { SceneId, StylePlan } from "../plan/schema.ts";
import { DEFAULT_SCENE_BY_THEME, getTheme, isBuiltinThemeId, resolveTheme } from "../themes/index.ts";
import type { Density, LaneChoice } from "../features/scenes/types.ts";
import type { Settings } from "./settings.ts";
import type { SiteLook, SiteRecord } from "./sites.ts";

/** What the page-side scene script is told. Colours and choices only; nothing read from the page. */
export interface SceneConfig {
  sceneId: SceneId;
  density: Density;
  lane: LaneChoice;
  accent: string;
}

/** What the scene script is asked to show: a built-in scene, a saved asset, or both. */
export interface SceneRequest {
  scene: SceneConfig | null;
  asset: AssetPlacement | null;
  /** Shown instead when the page blocks the asset file and its still picture (the theme's own scene). */
  fallback: SceneConfig | null;
}

/** Where the theme and plan the page now shows came from. */
export interface SceneSource {
  /** A built-in theme id or "custom" (an AI plan with its own tokens). */
  themeId: string;
  /** The popup theme choice was Auto: the scene follows the browser's colour scheme. */
  auto?: boolean;
  /** Dark colour scheme (only read when auto). */
  dark?: boolean;
  accent: string;
}

/**
 * Pure. Which built-in scene shows: the one that belongs to the theme (calm-light calm, midnight space, ocean ocean, warm-paper paper,
 * field field). Auto shows calm in light and midnight-stars in dark. High contrast and the off switch show none. There is no scene choice.
 */
export function effectiveScene(scene: Pick<Settings["scene"], "enabled">, themeId: string, auto = false, dark = false): SceneId {
  if (!scene.enabled || themeId === "high-contrast") return "none";
  if (auto) return dark ? "midnight-stars" : "calm";
  return isBuiltinThemeId(themeId) ? DEFAULT_SCENE_BY_THEME[themeId] : "none";
}

/** The request for the page, or null when there is nothing to show. */
export function sceneRequest(settings: Settings, source: SceneSource): SceneRequest | null {
  const sceneId = effectiveScene(settings.scene, source.themeId, source.auto, source.dark);
  const hasAsset = settings.asset.assetId !== null && source.themeId !== "high-contrast";
  if (sceneId === "none" && !hasAsset) return null;
  const make = (id: SceneId): SceneConfig | null => (id === "none" ? null : { sceneId: id, density: settings.scene.density, lane: settings.scene.lane, accent: source.accent });
  const fallbackId = effectiveScene({ enabled: true }, source.themeId, source.auto, source.dark);
  return { scene: make(sceneId), asset: hasAsset ? settings.asset : null, fallback: hasAsset && sceneId === "none" ? make(fallbackId) : null };
}

/** The source for a built-in theme choice ("auto" resolves with the browser's colour scheme). */
export function sourceForTheme(choice: Settings["theme"], prefersDark: boolean): SceneSource {
  const id = resolveTheme(choice, prefersDark);
  return { themeId: id, accent: getTheme(id).tokens.accent, ...(choice === "auto" ? { auto: true, dark: prefersDark } : {}) };
}

/**
 * The source for a plan that is on the page. A built-in theme brings its own scene; an AI plan ("custom") follows its own page colour
 * the way Auto does (calm on a light page, midnight-stars on a dark one), so AI themes get art too.
 */
export function sourceForPlan(plan: Pick<StylePlan, "themeId" | "tokens">): SceneSource {
  const tokens = (plan.tokens ?? {}) as Partial<StylePlan["tokens"]>;
  const accent = typeof tokens.accent === "string" ? tokens.accent : "#2f6fdb";
  if (isBuiltinThemeId(plan.themeId)) return { themeId: plan.themeId, accent };
  let dark = false;
  try {
    dark = typeof tokens.bg === "string" && isDark(tokens.bg);
  } catch {
    dark = false;
  }
  return { themeId: plan.themeId, auto: true, dark, accent };
}

/**
 * Pure. What a kept site shows again after a reload: the scene of the stored plan's theme while the one "Show art" switch is on (and the
 * site was not kept with art off), plus the asset saved with the site, else the chosen one. Null when there is nothing to show.
 */
export function siteRequest(settings: Settings, site: Pick<SiteRecord, "plan" | "look">): SceneRequest | null {
  const on = settings.scene.enabled && site.look?.art !== false;
  const asset = site.look?.asset ?? settings.asset;
  return sceneRequest({ ...settings, scene: { ...settings.scene, enabled: on }, asset }, sourceForPlan(site.plan));
}

/**
 * What to save with a site: whether art was on, the pet look (when the pet is on) and the chosen asset. Undefined when there is nothing.
 * No scene id is saved: the scene follows the theme (sourceForPlan) when the page loads again.
 */
export function lookFor(settings: Settings, source: SceneSource): SiteLook | undefined {
  const look: SiteLook = {};
  if (effectiveScene(settings.scene, source.themeId, source.auto, source.dark) !== "none") look.art = true;
  if (settings.pet.enabled) {
    const p = settings.pet;
    look.pet = { kind: p.kind, size: p.size, corner: p.corner, motion: p.motion, direction: p.direction, edge: p.edge, speed: p.speed, sleepWhenIdle: p.sleepWhenIdle, keepInFreeSpace: p.keepInFreeSpace, edgeFallback: p.edgeFallback };
  }
  if (settings.asset.assetId !== null && source.themeId !== "high-contrast") look.asset = settings.asset;
  return look.art || look.pet || look.asset ? look : undefined;
}
