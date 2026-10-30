import { CALM } from "./calm.ts";
import { FIELD } from "./field.ts";
import { MIDNIGHT } from "./midnight.ts";
import { OCEAN } from "./ocean.ts";
import { PAPER } from "./paper.ts";
import { SPACE } from "./space.ts";
import type { SceneDef, SceneId } from "./types.ts";

export { SCENE_IDS, DENSITIES, LANE_CHOICES, isSceneId, isDensity, isLaneChoice } from "./types.ts";
export type { Density, LaneChoice, SceneId, SceneDef, Actor } from "./types.ts";

const ALL: readonly SceneDef[] = [PAPER, SPACE, OCEAN, MIDNIGHT, CALM, FIELD];

/** The built-in scene for an id, or undefined for "none" (and for ids this build does not know). */
export const getScene = (id: SceneId): SceneDef | undefined => ALL.find((s) => s.id === id);

export const SCENES: readonly SceneDef[] = ALL;
