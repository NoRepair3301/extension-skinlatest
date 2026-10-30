import type { PetPose } from "./art.ts";
import { nextPosition, type Direction, type Walker, type WalkTrack } from "./motion.ts";

/** What the animator needs to know to walk the pet. */
export interface WalkPlan {
  track: WalkTrack;
  direction: Direction;
  /** Pixels per second. */
  speed: number;
}

export interface AnimatorDeps {
  setPose(pose: PetPose): void;
  /** Called every frame while walking: top-left corner of the pet in viewport px and which way it faces. */
  place(x: number, y: number, facing: 1 | -1): void;
  /** Called when walking starts or stops, so the host can ignore the pointer while the pet moves. */
  walking(on: boolean): void;
  /** The current walk, or undefined when the pet should stay where it is. Asked again on every start(). */
  walk(): WalkPlan | undefined;
  sleepWhenIdle(): boolean;
  /** Reads the OS setting; called again on every start. */
  reducedMotion(): boolean;
  isHidden(): boolean;
  raf(cb: (t: number) => void): number;
  caf(id: number): void;
  /** One-shot timer; returns a cancel function. */
  timer(fn: () => void, ms: number): () => void;
  /** Subscribe to tab visibility and reduced-motion changes; returns the unsubscribe. */
  onEnvChange(cb: () => void): () => void;
  /** Subscribe to the user's activity on the page (any pointer, key or scroll); used only to decide when the pet falls asleep. */
  onActivity(cb: () => void): () => void;
}

export interface Animator {
  /** Starts (or re-evaluates) everything. Runs only when motion is allowed and the tab is visible. */
  start(): void;
  celebrate(): void;
  /** True while a frame, blink or wave timer is pending. */
  running(): boolean;
  /** True while a requestAnimationFrame callback is pending: only a walking pet has one. */
  walkingNow(): boolean;
  destroy(): void;
}

export const BLINK_EVERY = 4200;
export const BLINK_FOR = 160;
export const WAVE_EVERY = 16000;
export const WAVE_STEP = 380;
export const SLEEP_AFTER = 45_000;
const CELEBRATE_FOR = 1100;
/** One walk-cycle step per this many pixels. */
const STEP_PX = 12;

/** Pure: the idle pose at `t` ms since the loop started (blinks now and then). */
export function poseAt(t: number): PetPose {
  return t % BLINK_EVERY > BLINK_EVERY - BLINK_FOR ? "blink" : "idle";
}

export function createAnimator(deps: AnimatorDeps): Animator {
  let frameId: number | undefined;
  const cancels = new Set<() => void>();
  let alive = true;
  let celebrating = false;
  let asleep = false;
  let shown: PetPose | undefined;
  let walker: Walker = { pos: 0, dir: 1 };
  let placed = false;
  let last: number | undefined;
  let travelled = 0;
  let cancelCelebration: (() => void) | undefined;
  let idleCancel: (() => void) | undefined;

  const show = (pose: PetPose) => {
    if (pose === shown) return;
    shown = pose;
    deps.setPose(pose);
  };

  const later = (fn: () => void, ms: number): void => {
    const handle: { cancel?: () => void } = {};
    const run = () => {
      if (handle.cancel) cancels.delete(handle.cancel);
      if (alive) fn();
    };
    handle.cancel = deps.timer(run, ms);
    cancels.add(handle.cancel);
  };

  const stopFrame = () => {
    if (frameId !== undefined) deps.caf(frameId);
    frameId = undefined;
    last = undefined;
  };

  const cancelLoops = () => {
    stopFrame();
    for (const c of cancels) c();
    cancels.clear();
  };

  const idleLoops = () => {
    const blink = () => {
      if (celebrating || asleep) return later(blink, BLINK_EVERY);
      show("blink");
      later(() => {
        if (!celebrating && !asleep) show("idle");
        later(blink, BLINK_EVERY - BLINK_FOR);
      }, BLINK_FOR);
    };
    later(blink, BLINK_EVERY - BLINK_FOR);
    const wave = (i: number) => {
      if (celebrating || asleep) return later(() => wave(0), WAVE_EVERY);
      if (i >= 4) {
        show("idle");
        return later(() => wave(0), WAVE_EVERY);
      }
      show(i % 2 === 0 ? "wave-a" : "wave-b");
      later(() => wave(i + 1), WAVE_STEP);
    };
    later(() => wave(0), WAVE_EVERY);
  };

  const startWalk = (plan: WalkPlan) => {
    const { track, direction, speed } = plan;
    if (!placed || walker.pos < track.bounds.min || walker.pos > track.bounds.max) {
      placed = true;
      walker = { pos: direction === "backward" ? track.bounds.max : track.bounds.min, dir: direction === "backward" ? -1 : 1 };
    }
    deps.walking(true);
    const step = (now: number) => {
      frameId = undefined;
      if (!alive || deps.isHidden() || deps.reducedMotion() || asleep) return;
      const dt = last === undefined ? 0 : (now - last) / 1000;
      last = now;
      const before = walker.pos;
      walker = nextPosition(dt, speed, track.bounds, direction, walker);
      travelled += Math.abs(walker.pos - before);
      const facing: 1 | -1 = track.axis === "x" ? walker.dir : 1;
      if (track.axis === "x") deps.place(walker.pos, track.fixed, facing);
      else deps.place(track.fixed, walker.pos, facing);
      show(celebrating ? "celebrate" : Math.floor(travelled / STEP_PX) % 2 === 0 ? "walk-a" : "walk-b");
      frameId = deps.raf(step);
    };
    last = undefined;
    frameId = deps.raf(step);
  };

  const armIdle = () => {
    idleCancel?.();
    idleCancel = undefined;
    if (!alive || !deps.sleepWhenIdle() || deps.reducedMotion() || deps.isHidden()) return;
    idleCancel = deps.timer(() => {
      idleCancel = undefined;
      if (!alive) return;
      asleep = true;
      evaluate();
    }, SLEEP_AFTER);
  };

  const evaluate = () => {
    cancelLoops();
    if (!alive) return;
    if (deps.reducedMotion()) {
      deps.walking(false);
      show("idle");
      return;
    }
    if (deps.isHidden()) return;
    if (asleep) {
      deps.walking(false);
      show("sleep");
      return;
    }
    const plan = deps.walk();
    if (plan) startWalk(plan);
    else {
      deps.walking(false);
      if (!celebrating) show("idle");
      idleLoops();
    }
    armIdle();
  };

  const offEnv = deps.onEnvChange(evaluate);
  const offActivity = deps.onActivity(() => {
    if (!alive) return;
    if (asleep) {
      asleep = false;
      evaluate();
    } else if (deps.sleepWhenIdle()) armIdle();
  });

  return {
    start: evaluate,
    celebrate() {
      if (!alive || deps.reducedMotion() || asleep) return;
      cancelCelebration?.();
      celebrating = true;
      show("celebrate");
      cancelCelebration = deps.timer(() => {
        celebrating = false;
        cancelCelebration = undefined;
        if (frameId === undefined) show("idle");
      }, CELEBRATE_FOR);
    },
    running: () => frameId !== undefined || cancels.size > 0,
    walkingNow: () => frameId !== undefined,
    destroy() {
      alive = false;
      cancelCelebration?.();
      idleCancel?.();
      cancelLoops();
      offEnv();
      offActivity();
      deps.walking(false);
    },
  };
}
