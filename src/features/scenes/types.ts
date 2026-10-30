import type { Ctx } from "./svg.ts";

export const MOTIONS = ["float", "drift", "orbit", "patrol", "cross", "write", "sway", "spin", "pulse"] as const;
export type Motion = (typeof MOTIONS)[number];

export const DENSITIES = ["low", "normal", "high"] as const;
export type Density = (typeof DENSITIES)[number];

export const LANE_CHOICES = ["both", "left", "right"] as const;
export type LaneChoice = (typeof LANE_CHOICES)[number];

/** Built-in scene ids. "none" means no scene. */
export const SCENE_IDS = ["none", "paper", "space", "ocean", "midnight-stars", "calm", "field"] as const;
export type SceneId = (typeof SCENE_IDS)[number];

export interface Actor {
  id: string;
  /** Draws the art. Called once per lane that shows it. */
  build(ctx: Ctx): SVGElement;
  /** Which lane the actor prefers; "any" alternates between the lanes in use. */
  lane: "any" | "left" | "right";
  motion: Motion;
  /** 1 is normal; higher is faster. */
  speed: number;
  /** Width in px (the actor box is square unless `ratio` is set). */
  size: number;
  /** Height divided by width; default 1. */
  ratio?: number;
  /** Where the actor rests inside the lane, 0..1 of the lane width and height. */
  x: number;
  y: number;
  /** Seconds before the animation starts; spreads actors out so they do not move in step. */
  delay?: number;
  /** Extra movement distance in px for float, drift and orbit. */
  amp?: number;
}

export interface SceneDef {
  id: Exclude<SceneId, "none">;
  name: string;
  actors: readonly Actor[];
}

export const isSceneId = (v: unknown): v is SceneId => typeof v === "string" && (SCENE_IDS as readonly string[]).includes(v);
export const isDensity = (v: unknown): v is Density => typeof v === "string" && (DENSITIES as readonly string[]).includes(v);
export const isLaneChoice = (v: unknown): v is LaneChoice => typeof v === "string" && (LANE_CHOICES as readonly string[]).includes(v);
