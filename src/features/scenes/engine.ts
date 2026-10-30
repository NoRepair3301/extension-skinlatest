import type { Gutter, Gutters } from "../freespace/index.ts";
import { CORNER_H, CORNER_W, usableGutters } from "../freespace/index.ts";
import { SCENE_CSS } from "./css.ts";
import { adoptCss, attachHost, FIXED_HOST, styleHost } from "../mount.ts";
import { guarded, recordError } from "../../core/diag.ts";
import type { Ctx } from "./svg.ts";
import type { Actor, Density, LaneChoice, Motion, SceneDef } from "./types.ts";

/** At most this many elements with a running animation, in total, across every lane. */
export const NODE_BUDGET = 40;
/** Share of a scene's actors shown at each density. */
const DENSITY_SHARE: Record<Density, number> = { low: 0.4, normal: 0.7, high: 1 };
/** Seconds for one cycle at speed 1. */
const BASE_DUR: Record<Motion, number> = { float: 6, drift: 9, orbit: 14, patrol: 18, cross: 12, write: 9, sway: 5, spin: 22, pulse: 4 };
const MIN_GAP_PX = 6;

export interface SceneEnv {
  doc: Document;
  win: Window;
}

export interface SceneRequest {
  scene: SceneDef;
  density: Density;
  lane: LaneChoice;
  gutters: Gutters;
  accent: string;
}

/** shown: art is on screen in the side gutters. corner: no gutter, so one small corner strip is used. no-gutter: nothing fits. */
export type SceneStatus = "shown" | "corner" | "no-gutter";

export interface SceneEngine {
  show(req: SceneRequest): SceneStatus;
  hide(): void;
  /** The host element, when one exists. */
  host(): HTMLElement | undefined;
  /** Animated elements currently in the scene. */
  animatedCount(): number;
  destroy(): void;
}

/** How many of a scene's actors a density shows. At least one. */
export const actorCount = (total: number, density: Density): number => (total === 0 ? 0 : Math.max(1, Math.ceil(total * DENSITY_SHARE[density])));

const AMP_BY_MOTION: Partial<Record<Motion, number>> = { float: 12, drift: 14, orbit: 22 };

/** Pure: which actors go into which lane. Explicit left/right is honoured when that lane exists; "any" alternates. */
export function assignActors(actors: readonly Actor[], lanes: number, lane: LaneChoice, which: Array<"left" | "right">): Actor[][] {
  const out: Actor[][] = Array.from({ length: lanes }, () => []);
  if (lanes === 0) return out;
  let flip = 0;
  for (const a of actors) {
    let idx: number;
    if (a.lane === "any" || lanes === 1) idx = lanes === 1 ? 0 : flip++ % lanes;
    else idx = Math.max(0, which.indexOf(a.lane));
    out[idx]!.push(a);
  }
  void lane;
  return out;
}

/** Height of an actor box in px for a lane of width `laneW`. */
export const actorHeight = (a: Actor, laneW: number): number => Math.max(16, Math.min(a.size, laneW - MIN_GAP_PX * 2)) * (a.ratio ?? 1);

/**
 * Pure. Resting top (px) of each actor in one lane: its wanted position, pushed down so two actors never overlap.
 * An actor that no longer fits above the lane's bottom is dropped (null).
 */
export function placeActors(actors: readonly Actor[], laneW: number, laneH: number): Array<{ actor: Actor; top: number }> {
  const backs: Array<{ actor: Actor; top: number }> = [];
  const out: Array<{ actor: Actor; top: number }> = [];
  let cursor = 0;
  for (const a of [...actors].sort((p, q) => p.y - q.y)) {
    const h = actorHeight(a, laneW);
    if (a.back) {
      backs.push({ actor: a, top: Math.max(0, Math.min(laneH - h, Math.round(a.y * laneH - h / 2))) });
      continue;
    }
    const top = Math.max(cursor, Math.round(a.y * laneH - h / 2), 0);
    if (top + h > laneH) continue;
    out.push({ actor: a, top });
    cursor = top + h + 10;
  }
  return [...backs, ...out];
}

/**
 * One extension-owned shadow-root host on the document element: position fixed, inset 0, pointer-events none.
 * Inside it one clipped lane per usable gutter. Actors cannot leave their lane because the lane clips.
 * Nothing is added to the page's own elements. `destroy` removes the host and every listener.
 */
export function createSceneEngine(env: SceneEnv): SceneEngine {
  const { doc, win } = env;
  let host: HTMLElement | undefined;
  let rootEl: HTMLElement | undefined;
  let counter = 0;
  let offVisibility: (() => void) | undefined;

  const reduced = (): boolean => win.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const applyEnv = () => {
    if (!rootEl) return;
    rootEl.classList.toggle("paused", doc.visibilityState === "hidden");
    rootEl.classList.toggle("still", reduced());
  };

  let detach: (() => void) | undefined;

  const teardown = () => {
    offVisibility?.();
    offVisibility = undefined;
    detach?.();
    detach = undefined;
    host?.remove();
    host = undefined;
    rootEl = undefined;
  };

  const mount = (): HTMLElement => {
    teardown();
    const h = doc.createElement("div");
    h.setAttribute("data-skinly-scene", "");
    h.setAttribute("data-skinly-ui", "scene");
    styleHost(h, FIXED_HOST);
    const shadow = h.attachShadow({ mode: "open" });
    // Reduced motion stops the movement only: every actor's resting pose is a finished picture, so the art stays visible.
    adoptCss(doc, shadow, SCENE_CSS + "@media (prefers-reduced-motion:reduce){[data-anim]{animation:none}}");
    const r = doc.createElement("div");
    r.className = "root";
    shadow.append(r);
    host = h;
    rootEl = r;
    detach = attachHost(doc, win, h, "scene-reattach");
    const onVis = () => guarded("scene-render", applyEnv, undefined);
    doc.addEventListener("visibilitychange", onVis);
    const mq = win.matchMedia?.("(prefers-reduced-motion: reduce)");
    mq?.addEventListener?.("change", onVis);
    offVisibility = () => {
      doc.removeEventListener("visibilitychange", onVis);
      mq?.removeEventListener?.("change", onVis);
    };
    applyEnv();
    return h;
  };

  const countAnimated = (): number => (rootEl ? rootEl.querySelectorAll("[data-anim]").length : 0);

  const buildActor = (a: Actor, lane: Gutter, ctx: Ctx, laneH: number, index: number, top: number): HTMLElement => {
    const w = Math.max(16, Math.min(a.size, lane.w - MIN_GAP_PX * 2));
    const h = w * (a.ratio ?? 1);
    const box = doc.createElement("div");
    box.className = "actor";
    box.setAttribute("data-actor", a.id);
    const s = box.style;
    s.setProperty("width", `${w}px`);
    s.setProperty("height", `${h}px`);
    s.setProperty("left", `${Math.max(MIN_GAP_PX, Math.min(lane.w - w - MIN_GAP_PX, a.x * lane.w - w / 2))}px`);
    s.setProperty("top", `${top}px`);
    const amp = a.amp ?? AMP_BY_MOTION[a.motion] ?? 0;
    const dur = Math.max(0.8, BASE_DUR[a.motion] / Math.max(0.2, a.speed));
    const delay = (a.delay ?? 0) + (index % 3) * 0.7;

    // Inherited by the animated parts inside the art (those that set no timing of their own).
    s.setProperty("--dur", `${dur}s`);
    s.setProperty("--delay", `${delay}s`);
    if (amp) s.setProperty("--amp", `${amp}px`);
    const art = a.build(ctx);
    const apply = (node: Element, name: string, extra: Record<string, string> = {}, phase = 0) => {
      node.setAttribute("data-anim", name);
      const st = (node as HTMLElement).style;
      st.setProperty("--dur", `${dur}s`);
      st.setProperty("--delay", `${delay - phase}s`);
      for (const [k, v] of Object.entries(extra)) st.setProperty(k, v);
    };
    if (a.motion === "orbit") {
      // Two nested wrappers on sine paths a quarter period apart make an ellipse.
      const inner = doc.createElement("div");
      inner.style.setProperty("width", "100%");
      inner.style.setProperty("height", "100%");
      inner.append(art);
      apply(inner, "orbit-y", { "--amp": `${amp}px` }, dur / 2);
      apply(box, "orbit-x", { "--amp": `${amp}px` });
      box.append(inner);
    } else if (a.motion === "patrol") {
      const travel = Math.max(0, laneH - h - (parseFloat(s.getPropertyValue("top")) || 0));
      box.append(art);
      apply(box, "patrol", { "--amp": `${Math.round(travel)}px` });
    } else if (a.motion === "cross") {
      const travel = Math.max(0, laneH - h - (parseFloat(s.getPropertyValue("top")) || 0));
      box.append(art);
      apply(box, "cross", { "--amp": `${Math.round(travel)}px`, "--dx": `${Math.round((lane.w - w) * (a.x > 0.5 ? -0.8 : 0.8))}px` });
    } else if (a.motion === "write") {
      // The art draws itself with inner write-* nodes; the box itself stays put.
      box.append(art);
    } else {
      box.append(art);
      apply(box, a.motion, amp ? { "--amp": `${amp}px` } : {});
    }
    return box;
  };

  /** Actors that fit a corner strip: not backdrop glows, small enough, at most two. */
  const cornerActors = (actors: readonly Actor[]): Actor[] =>
    actors
      .filter((x) => !x.back && Math.min(x.size, CORNER_W - MIN_GAP_PX * 2) * (x.ratio ?? 1) <= CORNER_H - 10)
      .sort((p, q) => p.size * (p.ratio ?? 1) - q.size * (q.ratio ?? 1))
      .slice(0, 2);

  const draw = (req: SceneRequest): SceneStatus => {
    const usable = usableGutters(req.gutters, req.lane);
    const corner = usable.length === 0 ? req.gutters.corner : undefined;
    if (usable.length === 0 && !corner) {
      teardown();
      return "no-gutter";
    }
    // One lane per usable gutter (full height), or one small strip in the least covered corner.
    const lanes: Array<{ g: Gutter; top: number; h: number }> = corner
      ? [{ g: { x: corner.x, w: corner.w }, top: corner.y, h: corner.h }]
      : usable.map((g) => ({ g, top: 0, h: Math.max(120, win.innerHeight || 600) }));
    mount();
    const r = rootEl!;
    const wanted = corner ? cornerActors(req.scene.actors) : req.scene.actors.slice(0, actorCount(req.scene.actors.length, req.density));
    const which = lanes.map(({ g }) => (g.x === 0 || (corner !== undefined && g.x < (win.innerWidth || 0) / 2) ? "left" : "right") as "left" | "right");
    const groups = assignActors(wanted, lanes.length, req.lane, which);
    const ctx: Ctx = { doc, accent: req.accent, uid: (name) => `${name}${++counter}` };

    // Lane elements first so a failing actor never leaves a half-built lane behind.
    lanes.forEach(({ g, top: laneTop, h: laneH }, li) => {
      const lane = doc.createElement("div");
      lane.className = "lane";
      lane.setAttribute("data-lane", corner ? "corner" : which[li]!);
      lane.style.setProperty("left", `${g.x}px`);
      lane.style.setProperty("width", `${g.w}px`);
      lane.style.setProperty("--lh", `${laneH}px`);
      if (corner) {
        lane.style.setProperty("top", `${laneTop}px`);
        lane.style.setProperty("height", `${laneH}px`);
        lane.style.setProperty("bottom", "auto");
      }
      r.append(lane);
      placeActors(groups[li]!, g.w, laneH).forEach(({ actor: a, top }, i) => {
        if (countAnimated() >= NODE_BUDGET) return;
        let box: HTMLElement;
        try {
          box = buildActor(a, g, ctx, laneH, i, top);
        } catch {
          recordError("scene-render");
          return;
        }
        lane.append(box);
        if (countAnimated() > NODE_BUDGET) box.remove();
      });
    });
    return corner ? "corner" : "shown";
  };

  /** Every step of drawing is caught: a failure is recorded, the half-built host is removed, and nothing reaches the page. */
  const show = (req: SceneRequest): SceneStatus => {
    try {
      return draw(req);
    } catch {
      recordError("scene-mount");
      guarded("scene-mount", teardown, undefined);
      return "no-gutter";
    }
  };

  return {
    show,
    hide: () => guarded("scene-mount", teardown, undefined),
    host: () => host,
    animatedCount: countAnimated,
    destroy: teardown,
  };
}

