import type { AssetPlacement } from "../features/assets/types.ts";
import type { SceneId } from "../plan/schema.ts";
import { DEFAULT_SCENE_BY_THEME, getTheme, isBuiltinThemeId, resolveTheme } from "../themes/index.ts";
import type { Density, LaneChoice } from "../features/scenes/types.ts";
import type { Settings } from "./settings.ts";
import type { SiteLook } from "./sites.ts";

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
  /** The plan's own sceneId, when an AI plan chose one. */
  planSceneId?: SceneId | undefined;
  accent: string;
}

/**
 * Pure. Which built-in scene shows. Off means none. High contrast never shows art, whatever else is chosen.
 * "theme" uses the plan's own scene when it picked one, otherwise the theme's default (a custom theme has none).
 */
export function effectiveScene(scene: Settings["scene"], themeId: string, planSceneId?: SceneId): SceneId {
  if (!scene.enabled || scene.choice === "none") return "none";
  if (themeId === "high-contrast") return "none";
  if (scene.choice !== "theme") return scene.choice;
  if (planSceneId !== undefined && planSceneId !== "none") return planSceneId;
  return isBuiltinThemeId(themeId) ? DEFAULT_SCENE_BY_THEME[themeId] : "none";
}

/** The request for the page, or null when there is nothing to show. */
export function sceneRequest(settings: Settings, source: SceneSource): SceneRequest | null {
  const sceneId = effectiveScene(settings.scene, source.themeId, source.planSceneId);
  const hasAsset = settings.asset.assetId !== null && source.themeId !== "high-contrast";
  if (sceneId === "none" && !hasAsset) return null;
  const make = (id: SceneId): SceneConfig | null => (id === "none" ? null : { sceneId: id, density: settings.scene.density, lane: settings.scene.lane, accent: source.accent });
  const fallbackId = effectiveScene({ ...settings.scene, enabled: true, choice: "theme" }, source.themeId, source.planSceneId);
  return { scene: make(sceneId), asset: hasAsset ? settings.asset : null, fallback: hasAsset && sceneId === "none" ? make(fallbackId) : null };
}

/** The source for a built-in theme choice ("auto" resolves with the browser's colour scheme). */
export function sourceForTheme(choice: Settings["theme"], prefersDark: boolean): SceneSource {
  const id = resolveTheme(choice, prefersDark);
  return { themeId: id, accent: getTheme(id).tokens.accent };
}

/** What to save with a site: the scene that is showing, the pet look (when the pet is on) and the chosen asset. Undefined when there is nothing. */
export function lookFor(settings: Settings, source: SceneSource): SiteLook | undefined {
  const look: SiteLook = {};
  const id = effectiveScene(settings.scene, source.themeId, source.planSceneId);
  if (id !== "none") look.scene = { id, density: settings.scene.density, lane: settings.scene.lane };
  if (settings.pet.enabled) {
    const p = settings.pet;
    look.pet = { kind: p.kind, size: p.size, corner: p.corner, motion: p.motion, direction: p.direction, edge: p.edge, speed: p.speed, sleepWhenIdle: p.sleepWhenIdle, keepInFreeSpace: p.keepInFreeSpace };
  }
  if (settings.asset.assetId !== null && source.themeId !== "high-contrast") look.asset = settings.asset;
  return look.scene || look.pet || look.asset ? look : undefined;
}
