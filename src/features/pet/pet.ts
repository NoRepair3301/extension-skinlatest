import { createAnimator, type Animator } from "./animate.ts";
import { collectObstacles, nextCorner, type Box } from "./avoid.ts";
import { createOverlay, type Corner, type Overlay, type Size } from "./overlay.ts";
import type { PetKind } from "./art.ts";

/** The part of the `pet` setting the page side needs. */
export interface PetConfig {
  enabled: boolean;
  kind: PetKind;
  size: Size;
  corner: Corner;
  disabledOrigins: readonly string[];
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

/**
 * Nothing exists until `sync` says the pet should show: no host, no listener, no timer, no animation frame.
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

    const overlay = createOverlay(doc, {
      kind: cfg.kind,
      size: cfg.size,
      corner: cfg.corner,
      onHide: teardown,
      onPetClick: () => animator.celebrate(),
    });
    const off: Array<() => void> = [];
    const pending: { avoid?: number | undefined } = {};

    const animator: Animator = createAnimator({
      setPose: (pose) => overlay.setPose(pose),
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
    });

    const state: Live = { cfg, overlay, animator, corner: cfg.corner, teardown: off };
    const avoid = () => {
      pending.avoid = undefined;
      if (live !== state) return;
      const vp = { w: win.innerWidth, h: win.innerHeight };
      const obstacles = collectObstacles(doc, vp, rectOf);
      const next = nextCorner(state.corner, cfg.size, vp, obstacles);
      if (next !== state.corner) {
        state.corner = next;
        overlay.setCorner(next);
      }
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

    live = state;
    animator.start();
    schedule();
  };

  const same = (a: PetConfig, b: PetConfig) => a.kind === b.kind && a.size === b.size && a.corner === b.corner;

  return {
    sync(cfg, origin, active) {
      const allowed = cfg.enabled && active && !(origin !== undefined && cfg.disabledOrigins.includes(origin));
      if (!allowed) return teardown();
      if (live && same(live.cfg, cfg)) return;
      teardown();
      mount(cfg);
    },
    mounted: () => live !== undefined,
    destroy: teardown,
  };
}
