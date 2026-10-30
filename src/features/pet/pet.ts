import { watchGutters, type GutterWatch } from "../freespace/watch.ts";
import type { Gutters } from "../freespace/index.ts";
import { createAnimator, type Animator, type WalkPlan } from "./animate.ts";
import { collectObstacles, nextCorner, type Box } from "./avoid.ts";
import type { PetKind } from "./art.ts";
import { SPEED_PX, walkTrack, type Direction, type Edge, type Speed } from "./motion.ts";
import { createOverlay, MARGIN_PX, SIZE_PX, type Corner, type Overlay, type Size } from "./overlay.ts";

/** The part of the `pet` setting the page side needs. Motion fields default to a pet that stays still. */
export interface PetConfig {
  enabled: boolean;
  kind: PetKind;
  size: Size;
  corner: Corner;
  disabledOrigins: readonly string[];
  motion?: "still" | "horizontal" | "vertical";
  direction?: Direction;
  edge?: Edge;
  speed?: Speed;
  sleepWhenIdle?: boolean;
  keepInFreeSpace?: boolean;
  edgeFallback?: boolean;
  /** Theme accent (#rrggbb) for the scarf or bow. */
  accent?: string;
}

export interface PetEnv {
  doc: Document;
  win: Window;
  raf(cb: (t: number) => void): number;
  caf(id: number): void;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export interface PetController {
  /** Shows, updates or removes the pet so it matches `cfg` for `origin`. `active` is false when the page is not themed. */
  sync(cfg: PetConfig, origin: string | undefined, active: boolean): void;
  /** Hides the pet if it is on screen, otherwise shows it (the user asked: the enabled setting does not matter). Returns true when it is on screen afterwards. */
  toggle(cfg: PetConfig, origin: string | undefined): boolean;
  /** True while a host element exists. */
  mounted(): boolean;
  destroy(): void;
}

export const AVOID_DEBOUNCE_MS = 200;

export const browserEnv = (win: Window): PetEnv => ({
  doc: win.document,
  win,
  raf: (cb) => win.requestAnimationFrame(cb),
  caf: (id) => win.cancelAnimationFrame(id),
  setTimeout: (fn, ms) => win.setTimeout(fn, ms),
  clearTimeout: (id) => win.clearTimeout(id),
});

interface Live {
  cfg: PetConfig;
  overlay: Overlay;
  animator: Animator;
  corner: Corner;
  teardown: Array<() => void>;
}

const withDefaults = (cfg: PetConfig): Required<Omit<PetConfig, "accent">> & { accent: string | undefined } => ({
  enabled: cfg.enabled,
  kind: cfg.kind,
  size: cfg.size,
  corner: cfg.corner,
  disabledOrigins: cfg.disabledOrigins,
  motion: cfg.motion ?? "still",
  direction: cfg.direction ?? "bounce",
  edge: cfg.edge ?? "bottom",
  speed: cfg.speed ?? "normal",
  sleepWhenIdle: cfg.sleepWhenIdle ?? false,
  keepInFreeSpace: cfg.keepInFreeSpace ?? true,
  edgeFallback: cfg.edgeFallback ?? true,
  accent: cfg.accent,
});

/**
 * Nothing exists until `sync` says the pet should show: no host, no listener, no timer, no animation frame.
 * A still pet uses timers only (blink, wave); a walking pet also uses one animation frame loop.
 * `destroy` (or a sync that says "off") removes the host and every listener, timer and frame.
 */
export function createPetController(env: PetEnv): PetController {
  let live: Live | undefined;

  const teardown = () => {
    if (!live) return;
    live.animator.destroy();
    for (const off of live.teardown) off();
    live.overlay.destroy();
    live = undefined;
  };

  const rectOf = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };

  const mount = (cfg: PetConfig) => {
    const { doc, win } = env;
    const c = withDefaults(cfg);

    const overlay = createOverlay(doc, {
      kind: cfg.kind,
      size: cfg.size,
      corner: cfg.corner,
      accent: cfg.accent,
      onHide: teardown,
      onPetClick: () => animator.celebrate(),
    });
    const off: Array<() => void> = [];
    const pending: { avoid?: number | undefined } = {};
    let gutters: Gutters = { state: "none" };
    let watch: GutterWatch | undefined;
    let wasWalking = false;

    const state: Live = { cfg, overlay, animator: undefined as unknown as Animator, corner: cfg.corner, teardown: off };
    const vp = () => ({ w: win.innerWidth, h: win.innerHeight });

    const walk = (): WalkPlan | undefined => {
      const v = vp();
      const track = walkTrack({ motion: c.motion, keepInFreeSpace: c.keepInFreeSpace, edgeFallback: c.edgeFallback, corner: state.corner, edge: c.edge, px: SIZE_PX[cfg.size], margin: MARGIN_PX, vw: v.w, vh: v.h, gutters });
      return track ? { track, direction: c.direction, speed: SPEED_PX[c.speed] } : undefined;
    };

    const animator: Animator = createAnimator({
      setPose: (pose) => overlay.setPose(pose),
      place: (x, y, facing) => overlay.setPlace(x, y, facing),
      walking(on) {
        overlay.setWalking(on);
        if (wasWalking && !on) overlay.setCorner(state.corner);
        wasWalking = on;
      },
      walk,
      sleepWhenIdle: () => c.sleepWhenIdle,
      reducedMotion: () => win.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
      isHidden: () => doc.visibilityState === "hidden",
      raf: env.raf,
      caf: env.caf,
      timer(fn, ms) {
        const id = env.setTimeout(fn, ms);
        return () => env.clearTimeout(id);
      },
      onEnvChange(cb) {
        doc.addEventListener("visibilitychange", cb);
        const mq = win.matchMedia?.("(prefers-reduced-motion: reduce)");
        mq?.addEventListener("change", cb);
        return () => {
          doc.removeEventListener("visibilitychange", cb);
          mq?.removeEventListener("change", cb);
        };
      },
      onActivity(cb) {
        if (!c.sleepWhenIdle) return () => undefined;
        const events = ["pointermove", "pointerdown", "keydown", "scroll"] as const;
        for (const e of events) win.addEventListener(e, cb, { passive: true });
        return () => {
          for (const e of events) win.removeEventListener(e, cb);
        };
      },
    });
    state.animator = animator;

    const avoid = () => {
      pending.avoid = undefined;
      if (live !== state) return;
      if (!wasWalking) {
        const v = vp();
        const obstacles = collectObstacles(doc, v, rectOf);
        const next = nextCorner(state.corner, cfg.size, v, obstacles);
        if (next !== state.corner) {
          state.corner = next;
          overlay.setCorner(next);
        }
      }
      // the viewport may have changed size: ask the animator for a fresh walk line
      if (c.motion !== "still") animator.start();
    };
    const schedule = () => {
      if (pending.avoid !== undefined) env.clearTimeout(pending.avoid);
      pending.avoid = env.setTimeout(avoid, AVOID_DEBOUNCE_MS);
    };
    win.addEventListener("scroll", schedule, { passive: true });
    win.addEventListener("resize", schedule);
    off.push(() => {
      win.removeEventListener("scroll", schedule);
      win.removeEventListener("resize", schedule);
      if (pending.avoid !== undefined) env.clearTimeout(pending.avoid);
    });

    if (c.motion !== "still" && c.keepInFreeSpace) {
      watch = watchGutters(
        {
          doc,
          win,
          getRect: rectOf,
          isHidden: (el) => {
            const cs = win.getComputedStyle(el);
            return cs.display === "none" || cs.visibility === "hidden";
          },
          setTimeout: env.setTimeout,
          clearTimeout: env.clearTimeout,
          now: () => Date.now(),
        },
        (g) => {
          gutters = g;
          if (live === state) animator.start();
        },
      );
      gutters = watch.current();
      off.push(() => watch?.destroy());
    }

    live = state;
    animator.start();
    schedule();
  };

  const same = (a: PetConfig, b: PetConfig) => {
    const x = withDefaults(a);
    const y = withDefaults(b);
    return x.kind === y.kind && x.size === y.size && x.corner === y.corner && x.motion === y.motion && x.direction === y.direction && x.edge === y.edge && x.speed === y.speed && x.sleepWhenIdle === y.sleepWhenIdle && x.keepInFreeSpace === y.keepInFreeSpace && x.edgeFallback === y.edgeFallback && x.accent === y.accent;
  };

  return {
    sync(cfg, origin, active) {
      const allowed = cfg.enabled && active && !(origin !== undefined && cfg.disabledOrigins.includes(origin));
      if (!allowed) return teardown();
      if (live && same(live.cfg, cfg)) return;
      teardown();
      mount(cfg);
    },
    toggle(cfg, origin) {
      if (live) {
        teardown();
        return false;
      }
      if (origin !== undefined && cfg.disabledOrigins.includes(origin)) return false;
      mount({ ...cfg, enabled: true });
      return true;
    },
    mounted: () => live !== undefined,
    destroy: teardown,
  };
}
