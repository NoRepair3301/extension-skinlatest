import type { PetPose } from "./art.ts";

export interface AnimatorDeps {
  setPose(pose: PetPose): void;
  /** Reads the OS setting; called again on every start. */
  reducedMotion(): boolean;
  isHidden(): boolean;
  raf(cb: (t: number) => void): number;
  caf(id: number): void;
  /** One-shot timer; returns a cancel function. */
  timer(fn: () => void, ms: number): () => void;
  /** Subscribe to tab visibility and reduced-motion changes; returns the unsubscribe. */
  onEnvChange(cb: () => void): () => void;
}

export interface Animator {
  /** Starts (or re-evaluates) the loop. Runs only when motion is allowed and the tab is visible. */
  start(): void;
  celebrate(): void;
  /** True while a requestAnimationFrame callback is pending. */
  running(): boolean;
  destroy(): void;
}

const BLINK_EVERY = 4200;
const BLINK_FOR = 160;
const WALK_EVERY = 11000;
const WALK_FOR = 2600;
const STEP = 280;
const CELEBRATE_FOR = 1100;

/** Pure: which pose to show at `t` ms since the loop started, ignoring celebration. */
export function poseAt(t: number): PetPose {
  const inWalk = t % WALK_EVERY > WALK_EVERY - WALK_FOR;
  if (inWalk) return Math.floor(t / STEP) % 2 === 0 ? "walk-a" : "walk-b";
  if (t % BLINK_EVERY > BLINK_EVERY - BLINK_FOR) return "blink";
  return "idle";
}

export function createAnimator(deps: AnimatorDeps): Animator {
  let id: number | undefined;
  let t0: number | undefined;
  let celebrating = false;
  let cancelCelebration: (() => void) | undefined;
  let shown: PetPose | undefined;
  let alive = true;

  const show = (pose: PetPose) => {
    if (pose === shown) return;
    shown = pose;
    deps.setPose(pose);
  };

  const stop = () => {
    if (id !== undefined) deps.caf(id);
    id = undefined;
  };

  const frame = (now: number) => {
    id = undefined;
    if (!alive || deps.isHidden() || deps.reducedMotion()) return;
    t0 ??= now;
    show(celebrating ? "celebrate" : poseAt(now - t0));
    id = deps.raf(frame);
  };

  const evaluate = () => {
    if (!alive) return;
    if (deps.reducedMotion()) {
      stop();
      show("idle");
      return;
    }
    if (deps.isHidden()) {
      stop();
      return;
    }
    if (id === undefined) id = deps.raf(frame);
  };

  const off = deps.onEnvChange(evaluate);

  return {
    start: evaluate,
    celebrate() {
      if (!alive || deps.reducedMotion()) return;
      cancelCelebration?.();
      celebrating = true;
      show("celebrate");
      cancelCelebration = deps.timer(() => {
        celebrating = false;
        cancelCelebration = undefined;
        if (id === undefined) show("idle");
      }, CELEBRATE_FOR);
    },
    running: () => id !== undefined,
    destroy() {
      alive = false;
      cancelCelebration?.();
      stop();
      off();
    },
  };
}
