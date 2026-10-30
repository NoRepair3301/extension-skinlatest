import type { Gutter, Gutters } from "../freespace/index.ts";
import { MIN_GUTTER } from "../freespace/index.ts";

export type Direction = "forward" | "backward" | "bounce";
export type Speed = "slow" | "normal" | "fast";
export type Edge = "bottom" | "top" | "left" | "right";

/** Pixels per second. */
export const SPEED_PX: Record<Speed, number> = { slow: 28, normal: 56, fast: 104 };
/** A frame after a long pause (hidden tab) must not make the pet jump across the page. */
export const MAX_DT = 0.1;

export interface Bounds {
  min: number;
  max: number;
}

export interface Walker {
  pos: number;
  /** 1 moves toward `max`, -1 toward `min`. */
  dir: 1 | -1;
}

/**
 * Pure. Where a walking pet is `dt` seconds later, along one axis between `bounds`.
 * forward: toward max, then back at min. backward: toward min, then back at max. bounce: turns round at each end.
 */
export function nextPosition(dt: number, speed: number, bounds: Bounds, direction: Direction, from: Walker): Walker {
  const { min, max } = bounds;
  if (!(max > min)) return { pos: min, dir: from.dir };
  const step = Math.max(0, Math.min(dt, MAX_DT)) * Math.max(0, speed);
  if (direction === "forward") {
    let pos = Math.min(max, Math.max(min, from.pos)) + step;
    if (pos > max) pos = min + ((pos - min) % (max - min));
    return { pos, dir: 1 };
  }
  if (direction === "backward") {
    let pos = Math.min(max, Math.max(min, from.pos)) - step;
    if (pos < min) pos = max - ((min - pos) % (max - min));
    return { pos, dir: -1 };
  }
  let pos = Math.min(max, Math.max(min, from.pos));
  let dir = from.dir;
  let left = step;
  // reflect off the ends; the loop ends because every pass uses up part of `left` or a full track length
  for (let i = 0; i < 8 && left > 0; i++) {
    const room = dir === 1 ? max - pos : pos - min;
    if (left <= room) {
      pos += dir * left;
      left = 0;
    } else {
      pos += dir * room;
      left -= room;
      dir = dir === 1 ? -1 : 1;
    }
  }
  return { pos, dir };
}

export interface WalkTrack {
  axis: "x" | "y";
  bounds: Bounds;
  /** The fixed coordinate on the other axis. */
  fixed: number;
}

export interface TrackInput {
  motion: "still" | "horizontal" | "vertical";
  keepInFreeSpace: boolean;
  /** keepInFreeSpace with no usable gutter: walk along the viewport edge instead of staying put (default true). */
  edgeFallback?: boolean;
  corner: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  edge: Edge;
  /** Pet box size in px and the margin kept to the viewport edge. */
  px: number;
  margin: number;
  vw: number;
  vh: number;
  gutters: Gutters;
}

const pad = 4;

/**
 * Pure. The line the pet may walk along, or undefined when it must stay in its corner.
 * keepInFreeSpace on: only inside a usable gutter (the one on the corner's side, else the other); with none the pet walks along the
 * viewport edge (edgeFallback, the default) or stays still.
 * keepInFreeSpace off: along the viewport edge.
 */
export function walkTrack(i: TrackInput): WalkTrack | undefined {
  if (i.motion === "still") return undefined;
  const top = i.corner.startsWith("top");
  const right = i.corner.endsWith("right");
  const yFixed = top ? i.margin : i.vh - i.margin - i.px;
  if (i.keepInFreeSpace) {
    const usable = (g: Gutter | undefined): g is Gutter => g !== undefined && g.w >= MIN_GUTTER && g.w >= i.px + pad * 2;
    const first = right ? i.gutters.right : i.gutters.left;
    const second = right ? i.gutters.left : i.gutters.right;
    const g = usable(first) ? first : usable(second) ? second : undefined;
    if (!g) return i.edgeFallback === false ? undefined : edgeTrack(i);
    if (i.motion === "horizontal") return { axis: "x", bounds: { min: g.x + pad, max: g.x + g.w - i.px - pad }, fixed: yFixed };
    return { axis: "y", bounds: { min: i.margin, max: i.vh - i.margin - i.px }, fixed: g.x + (g.w - i.px) / 2 };
  }
  return edgeTrack(i);
}

/** The line along the viewport edge the user chose. */
function edgeTrack(i: TrackInput): WalkTrack {
  if (i.motion === "horizontal") {
    const atTop = i.edge === "top";
    return { axis: "x", bounds: { min: i.margin, max: i.vw - i.margin - i.px }, fixed: atTop ? i.margin : i.vh - i.margin - i.px };
  }
  const atLeft = i.edge === "left";
  return { axis: "y", bounds: { min: i.margin, max: i.vh - i.margin - i.px }, fixed: atLeft ? i.margin : i.vw - i.margin - i.px };
}
