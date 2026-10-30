import { afterEach, describe, expect, it, vi } from "vitest";
import { computeGutters } from "../../src/features/freespace/index.ts";
import { createAnimator, SLEEP_AFTER, type AnimatorDeps, type WalkPlan } from "../../src/features/pet/animate.ts";
import { CREATURES, drawCreature, type CreaturePose } from "../../src/features/pet/creatures.ts";
import { MAX_DT, nextPosition, SPEED_PX, walkTrack, type TrackInput, type Walker } from "../../src/features/pet/motion.ts";
import { createOverlay } from "../../src/features/pet/overlay.ts";
import { createPetController, type PetConfig, type PetEnv } from "../../src/features/pet/pet.ts";
import { parseSettings } from "../../src/extension/settings.ts";
import { POSES } from "../../src/features/pet/art.ts";
import { SVG_NS } from "../../src/features/scenes/svg.ts";

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.querySelectorAll("[data-skinly-ui]").forEach((n) => n.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("nextPosition", () => {
  const b = { min: 0, max: 100 };
  const w = (pos: number, dir: 1 | -1 = 1): Walker => ({ pos, dir });
  it("forward walks toward max and wraps to min", () => {
    expect(nextPosition(0.1, 100, b, "forward", w(10))).toEqual({ pos: 20, dir: 1 });
    const wrapped = nextPosition(0.1, 100, b, "forward", w(95));
    expect(wrapped.pos).toBeCloseTo(5, 5);
    expect(wrapped.dir).toBe(1);
  });
  it("backward walks toward min and wraps to max", () => {
    expect(nextPosition(0.1, 100, b, "backward", w(50))).toEqual({ pos: 40, dir: -1 });
    const wrapped = nextPosition(0.1, 100, b, "backward", w(5));
    expect(wrapped.pos).toBeCloseTo(95, 5);
    expect(wrapped.dir).toBe(-1);
  });
  it("bounce turns round at both ends and keeps the leftover distance", () => {
    const a = nextPosition(0.1, 100, b, "bounce", w(95, 1));
    expect(a.dir).toBe(-1);
    expect(a.pos).toBeCloseTo(95, 5); // 5 to the end, 5 back
    const c = nextPosition(0.1, 100, b, "bounce", w(3, -1));
    expect(c.dir).toBe(1);
    expect(c.pos).toBeCloseTo(7, 5);
    expect(nextPosition(0.05, 100, b, "bounce", w(50, -1))).toEqual({ pos: 45, dir: -1 });
  });
  it("a long pause cannot make the pet jump: dt is capped", () => {
    expect(nextPosition(30, 100, b, "forward", w(0)).pos).toBeCloseTo(MAX_DT * 100, 5);
    expect(nextPosition(-5, 100, b, "forward", w(10)).pos).toBe(10);
  });
  it("a track with no room pins the pet at min; out-of-range starts are clamped", () => {
    expect(nextPosition(0.1, 100, { min: 20, max: 20 }, "bounce", w(5)).pos).toBe(20);
    expect(nextPosition(0.01, 100, b, "forward", w(500)).pos).toBeLessThanOrEqual(100);
    expect(SPEED_PX.slow).toBeLessThan(SPEED_PX.normal);
    expect(SPEED_PX.normal).toBeLessThan(SPEED_PX.fast);
  });
});

describe("walkTrack", () => {
  const gutters = computeGutters([{ x: 300, w: 600 }], 1200, 1200);
  const base: TrackInput = { motion: "horizontal", keepInFreeSpace: true, corner: "bottom-right", edge: "bottom", px: 72, margin: 12, vw: 1200, vh: 800, gutters };
  it("still never walks", () => {
    expect(walkTrack({ ...base, motion: "still" })).toBeUndefined();
  });
  it("keepInFreeSpace horizontal walks back and forth inside the gutter width", () => {
    const t = walkTrack(base)!;
    expect(t.axis).toBe("x");
    expect(t.bounds.min).toBeGreaterThanOrEqual(900);
    expect(t.bounds.max + 72).toBeLessThanOrEqual(1200);
    expect(t.fixed).toBe(800 - 12 - 72);
    expect(walkTrack({ ...base, corner: "top-left" })!.bounds.max + 72).toBeLessThanOrEqual(300);
    expect(walkTrack({ ...base, corner: "top-left" })!.fixed).toBe(12);
  });
  it("keepInFreeSpace vertical walks up and down inside a gutter", () => {
    const t = walkTrack({ ...base, motion: "vertical" })!;
    expect(t.axis).toBe("y");
    expect(t.fixed).toBeGreaterThanOrEqual(900);
    expect(t.fixed + 72).toBeLessThanOrEqual(1200);
    expect(t.bounds).toEqual({ min: 12, max: 800 - 12 - 72 });
  });
  it("falls back to the other gutter; with none it walks the screen edge, or stays still when edgeFallback is off", () => {
    const oneSided = computeGutters([{ x: 0, w: 900 }], 1200, 1200);
    expect(walkTrack({ ...base, corner: "bottom-left", gutters: oneSided })!.bounds.min).toBeGreaterThanOrEqual(900);
    const full = computeGutters([{ x: 0, w: 1200 }], 1200, 1200);
    expect(walkTrack({ ...base, edgeFallback: false, gutters: full })).toBeUndefined();
    expect(walkTrack({ ...base, edgeFallback: false, gutters: computeGutters([{ x: 100, w: 1000 }], 1200, 1200) })).toBeUndefined();
    expect(walkTrack({ ...base, gutters: full })).toEqual({ axis: "x", bounds: { min: 12, max: 1200 - 12 - 72 }, fixed: 800 - 12 - 72 });
    expect(walkTrack({ ...base, motion: "vertical", edge: "left", gutters: full })).toEqual({ axis: "y", bounds: { min: 12, max: 800 - 12 - 72 }, fixed: 12 });
  });
  it("without keepInFreeSpace it may walk along the viewport edge", () => {
    const h = walkTrack({ ...base, keepInFreeSpace: false, gutters: { state: "none" } })!;
    expect(h).toEqual({ axis: "x", bounds: { min: 12, max: 1200 - 12 - 72 }, fixed: 800 - 12 - 72 });
    expect(walkTrack({ ...base, keepInFreeSpace: false, edge: "top", gutters: { state: "none" } })!.fixed).toBe(12);
    const v = walkTrack({ ...base, keepInFreeSpace: false, motion: "vertical", edge: "left", gutters: { state: "none" } })!;
    expect(v).toEqual({ axis: "y", bounds: { min: 12, max: 800 - 12 - 72 }, fixed: 12 });
  });
});

describe("vertical bounce inside a gutter", () => {
  it("goes up and down between the track ends and never leaves the gutter column", () => {
    const g = computeGutters([{ x: 300, w: 600 }], 1200, 1200);
    const track = walkTrack({ motion: "vertical", keepInFreeSpace: true, corner: "bottom-right", edge: "bottom", px: 72, margin: 12, vw: 1200, vh: 800, gutters: g })!;
    expect(track.axis).toBe("y");
    expect(track.fixed).toBeGreaterThanOrEqual(900);
    let w: Walker = { pos: track.bounds.max - 5, dir: 1 };
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      w = nextPosition(0.016, SPEED_PX.fast, track.bounds, "bounce", w);
      expect(w.pos).toBeGreaterThanOrEqual(track.bounds.min);
      expect(w.pos).toBeLessThanOrEqual(track.bounds.max);
      seen.add(w.dir);
    }
    expect(seen).toEqual(new Set([1, -1]));
  });
});

describe("animator walking", () => {
  const plan = (direction: WalkPlan["direction"]): WalkPlan => ({ track: { axis: "x", bounds: { min: 0, max: 100 }, fixed: 700 }, direction, speed: 50 });
  function harness(over: Partial<AnimatorDeps> & { plan?: WalkPlan | undefined } = {}) {
    let id = 1;
    const frames = new Map<number, (t: number) => void>();
    const timers = new Map<number, () => void>();
    const poses: string[] = [];
    const places: Array<[number, number, number]> = [];
    const walking: boolean[] = [];
    let activity: (() => void) | undefined;
    const deps: AnimatorDeps = {
      setPose: (p) => void poses.push(p),
      place: (x, y, f) => void places.push([x, y, f]),
      walking: (on) => void walking.push(on),
      walk: () => over.plan,
      sleepWhenIdle: () => false,
      reducedMotion: () => false,
      isHidden: () => false,
      raf: (cb) => (frames.set(id, cb), id++),
      caf: (i) => void frames.delete(i),
      timer: (fn) => {
        const i = id++;
        timers.set(i, fn);
        return () => void timers.delete(i);
      },
      onEnvChange: () => () => undefined,
      onActivity: (cb) => ((activity = cb), () => undefined),
      ...over,
    };
    delete (deps as { plan?: unknown }).plan;
    const tick = (t: number) => {
      const cbs = [...frames.values()];
      frames.clear();
      cbs.forEach((cb) => cb(t));
    };
    return { deps, frames, timers, poses, places, walking, tick, wake: () => activity?.() };
  }

  it("a still pet uses timers only and never a frame", () => {
    const h = harness({ plan: undefined });
    const a = createAnimator(h.deps);
    a.start();
    expect(h.frames.size).toBe(0);
    expect(h.timers.size).toBeGreaterThan(0);
    expect(a.walkingNow()).toBe(false);
    a.destroy();
    expect(h.timers.size).toBe(0);
  });

  it("a walking pet moves, flips with its direction, alternates walk poses and tells the host to ignore the pointer", () => {
    const h = harness({ plan: plan("bounce") });
    const a = createAnimator(h.deps);
    a.start();
    expect(h.walking).toContain(true);
    expect(a.walkingNow()).toBe(true);
    let t = 0;
    for (let i = 0; i < 80; i++) h.tick((t += 100));
    const xs = h.places.map((p) => p[0]);
    expect(Math.max(...xs)).toBeLessThanOrEqual(100);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(new Set(h.places.map((p) => p[2]))).toEqual(new Set([1, -1])); // went right, then bounced and faced left
    expect(h.places.every((p) => p[1] === 700)).toBe(true);
    expect(h.poses).toContain("walk-a");
    expect(h.poses).toContain("walk-b");
    a.destroy();
    expect(h.frames.size).toBe(0);
    expect(h.walking[h.walking.length - 1]).toBe(false);
  });

  it("left-to-right never faces left and right-to-left never faces right", () => {
    for (const [dir, face] of [["forward", 1], ["backward", -1]] as const) {
      const h = harness({ plan: plan(dir) });
      const a = createAnimator(h.deps);
      a.start();
      let t = 0;
      for (let i = 0; i < 60; i++) h.tick((t += 100));
      expect(new Set(h.places.map((p) => p[2]))).toEqual(new Set([face]));
      a.destroy();
    }
  });

  it("reduced motion and a hidden tab stop all walking", () => {
    let reduced = false;
    let hidden = false;
    const h = harness({ plan: plan("bounce"), reducedMotion: () => reduced, isHidden: () => hidden });
    const a = createAnimator(h.deps);
    a.start();
    expect(a.walkingNow()).toBe(true);
    hidden = true;
    a.start();
    expect(a.walkingNow()).toBe(false);
    hidden = false;
    reduced = true;
    a.start();
    expect(a.walkingNow()).toBe(false);
    expect(h.frames.size).toBe(0);
    expect(h.poses[h.poses.length - 1]).toBe("idle");
    a.destroy();
  });

  it("sleepWhenIdle puts the pet to sleep after quiet time and activity wakes it", () => {
    const h = harness({ plan: undefined, sleepWhenIdle: () => true });
    const a = createAnimator(h.deps);
    a.start();
    const sleeper = [...h.timers.entries()];
    // fire the timers until the sleep one has run (the one scheduled by armIdle is the last non-loop timer)
    for (const [i, fn] of sleeper) {
      h.timers.delete(i);
      fn();
    }
    // the idle timer is registered through deps.timer directly, so run what is left too
    for (const [i, fn] of [...h.timers.entries()]) {
      h.timers.delete(i);
      fn();
    }
    expect(SLEEP_AFTER).toBeGreaterThan(0);
    expect(h.poses).toContain("sleep");
    h.wake();
    expect(h.poses[h.poses.length - 1]).not.toBe("sleep");
    a.destroy();
  });

  it("celebrate shows the happy pose and is ignored under reduced motion", () => {
    const h = harness({ plan: undefined });
    const a = createAnimator(h.deps);
    a.start();
    a.celebrate();
    expect(h.poses[h.poses.length - 1]).toBe("celebrate");
    a.destroy();
    const r = harness({ plan: undefined, reducedMotion: () => true });
    const b = createAnimator(r.deps);
    b.start();
    b.celebrate();
    expect(r.poses).not.toContain("celebrate");
    b.destroy();
  });
});

describe("overlay behaviour", () => {
  const make = () => createOverlay(document, { kind: "fox", size: "medium", corner: "bottom-right", onHide: () => undefined, onPetClick: () => undefined });
  it("the close button is invisible by default and only the hover and focus rules show it", () => {
    const o = make();
    const css = o.host.shadowRoot!.querySelector("style")?.textContent ?? "";
    expect(css).toMatch(/\.hide\{[^}]*opacity:0/);
    expect(css).toContain(".wrap:hover .hide");
    expect(css).toContain(".wrap:focus-within .hide");
    expect(o.host.shadowRoot!.querySelector("button.hide")!.getAttribute("aria-label")).toBe("Hide pet");
    o.destroy();
  });
  it("walking puts the pet at x,y, flips the sprite and makes the pet and button ignore the pointer", () => {
    const o = make();
    o.setWalking(true);
    o.setPlace(120.4, 300.6, -1);
    const wrap = o.host.shadowRoot!.querySelector(".wrap")!;
    expect(wrap.classList.contains("walking")).toBe(true);
    expect(wrap.getAttribute("data-facing")).toBe("-1");
    expect(o.host.style.getPropertyValue("transform")).toBe("translate(120px,301px)");
    expect(o.host.style.getPropertyValue("pointer-events")).toBe("none");
    const css = o.host.shadowRoot!.querySelector("style")?.textContent ?? "";
    expect(css).toMatch(/\.walking \.pet,\.walking \.hide\{pointer-events:none/);
    expect(css).toContain('.wrap[data-facing="-1"] .pet svg{transform:scaleX(-1)}');
    o.setWalking(false);
    o.setCorner("top-left");
    expect(wrap.hasAttribute("data-facing")).toBe(false);
    expect(o.host.style.getPropertyValue("top")).toBe("12px");
    o.destroy();
  });
});

describe("controller: hide ways, commands and free space", () => {
  function makeEnv(reduced = false) {
    let id = 1;
    const frames = new Map<number, (t: number) => void>();
    const timers = new Map<number, () => void>();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduced && q.includes("reduce"), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
    const env: PetEnv = {
      doc: document,
      win: window,
      raf: (cb) => (frames.set(id, cb), id++),
      caf: (i) => void frames.delete(i),
      setTimeout: (fn) => (timers.set(id, fn), id++),
      clearTimeout: (i) => void timers.delete(i),
    };
    return { env, frames, timers };
  }
  const cfg = (over: Partial<PetConfig> = {}): PetConfig => ({ enabled: true, kind: "fox", size: "medium", corner: "bottom-right", disabledOrigins: [], ...over });
  const host = () => document.querySelector('[data-skinly-ui="pet"]') as HTMLElement | null;

  it("toggle (the toggle-pet command) hides a visible pet and shows a hidden one, even when the setting is off", () => {
    const { env } = makeEnv();
    const ctl = createPetController(env);
    expect(ctl.toggle(cfg({ enabled: false }), "https://a.test")).toBe(true);
    expect(host()).not.toBeNull();
    expect(ctl.toggle(cfg({ enabled: false }), "https://a.test")).toBe(false);
    expect(host()).toBeNull();
    expect(ctl.toggle(cfg({ disabledOrigins: ["https://a.test"] }), "https://a.test")).toBe(false);
    expect(host()).toBeNull();
  });

  it("Escape on the focused pet hides it", () => {
    const { env } = makeEnv();
    const ctl = createPetController(env);
    ctl.sync(cfg(), undefined, true);
    host()!.shadowRoot!.querySelector("button.pet")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(host()).toBeNull();
    expect(ctl.mounted()).toBe(false);
  });

  it("a walking pet asks for a frame; the host and the pet ignore the pointer while it walks", () => {
    document.body.innerHTML = '<p id="c">content</p>';
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1200);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return (this.id === "c" ? { x: 300, y: 0, left: 300, top: 0, width: 600, height: 40, right: 900, bottom: 40 } : { x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }) as DOMRect;
    });
    const { env, frames } = makeEnv();
    const ctl = createPetController(env);
    ctl.sync(cfg({ motion: "horizontal", direction: "bounce", keepInFreeSpace: true }), undefined, true);
    expect(frames.size).toBe(1);
    expect(host()!.shadowRoot!.querySelector(".wrap")!.classList.contains("walking")).toBe(true);
    expect(host()!.style.getPropertyValue("pointer-events")).toBe("none");
    ctl.destroy();
    expect(frames.size).toBe(0);
  });

  it("keepInFreeSpace with no gutter and edgeFallback off: the pet stays still in its corner (no frame)", () => {
    document.body.innerHTML = '<p id="c">content</p>';
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1200);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return (this.id === "c" ? { x: 0, y: 0, left: 0, top: 0, width: 1200, height: 40, right: 1200, bottom: 40 } : { x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }) as DOMRect;
    });
    const { env, frames } = makeEnv();
    const ctl = createPetController(env);
    ctl.sync(cfg({ motion: "vertical", keepInFreeSpace: true, edgeFallback: false }), undefined, true);
    expect(frames.size).toBe(0);
    expect(host()!.style.getPropertyValue("bottom")).toBe("12px");
    ctl.destroy();
  });

  it("without keepInFreeSpace the pet walks along the viewport edge even with no gutter", () => {
    document.body.innerHTML = '<p id="c">content</p>';
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1200);
    const { env, frames } = makeEnv();
    const ctl = createPetController(env);
    ctl.sync(cfg({ motion: "horizontal", keepInFreeSpace: false }), undefined, true);
    expect(frames.size).toBe(1);
    ctl.destroy();
  });

  it("reduced motion makes a walking pet static", () => {
    const { env, frames } = makeEnv(true);
    const ctl = createPetController(env);
    ctl.sync(cfg({ motion: "horizontal", keepInFreeSpace: false }), undefined, true);
    expect(frames.size).toBe(0);
    expect(host()!.shadowRoot!.querySelector(".wrap")!.classList.contains("walking")).toBe(false);
    ctl.destroy();
  });

  it("motion settings are validated, still is the default", () => {
    expect(parseSettings({}).pet.motion).toBe("still");
    const p = parseSettings({ pet: { motion: "diagonal", direction: "sideways", edge: "middle", speed: "warp", sleepWhenIdle: "yes", keepInFreeSpace: 0 } }).pet;
    expect(p).toMatchObject({ motion: "still", direction: "bounce", edge: "bottom", speed: "normal", sleepWhenIdle: false, keepInFreeSpace: true });
    const q = parseSettings({ pet: { motion: "vertical", direction: "forward", edge: "left", speed: "fast", sleepWhenIdle: true, keepInFreeSpace: false } }).pet;
    expect(q).toMatchObject({ motion: "vertical", direction: "forward", edge: "left", speed: "fast", sleepWhenIdle: true, keepInFreeSpace: false });
  });
});

describe("the five pets", () => {
  it("fox, cat, bunny, slime and owl draw in every pose with SVG shapes and a gradient, no images or scripts", () => {
    expect([...CREATURES]).toEqual(["fox", "cat", "bunny", "slime", "owl"]);
    const poses: CreaturePose[] = ["idle", "blink", "walk-a", "walk-b", "celebrate", "sleep", "wave-a", "wave-b"];
    expect([...POSES]).toEqual(poses);
    for (const kind of CREATURES) {
      for (const pose of poses) {
        const svg = drawCreature(document, kind, pose, "#2f6fdb");
        expect(svg.namespaceURI).toBe(SVG_NS);
        expect(svg.getAttribute("data-pose")).toBe(pose);
        expect(svg.querySelector("script,image,foreignObject,a,use")).toBeNull();
        expect(svg.querySelectorAll("linearGradient").length).toBeGreaterThan(0);
        expect(svg.querySelectorAll("*").length).toBeGreaterThan(14);
        for (const e of Array.from(svg.querySelectorAll("*"))) for (const at of Array.from(e.attributes)) expect(at.value).not.toMatch(/https?:|data:|javascript:/i);
      }
    }
  });
  it("the scarf or bow takes the theme accent, and a bad accent falls back to the default", () => {
    const html = (accent?: string) => new XMLSerializer().serializeToString(drawCreature(document, "fox", "idle", accent));
    expect(html("#2f6fdb")).toContain("#2f6fdb");
    expect(html("javascript:alert(1)")).not.toContain("javascript");
    expect(html("javascript:alert(1)")).toBe(html(undefined));
  });
  it("poses differ: sleep has zzz, celebrate has stars, walking moves the feet", () => {
    const s = (pose: CreaturePose) => new XMLSerializer().serializeToString(drawCreature(document, "cat", pose));
    expect(s("sleep")).not.toBe(s("idle"));
    expect(s("celebrate")).not.toBe(s("idle"));
    expect(s("walk-a")).not.toBe(s("walk-b"));
    expect(s("wave-a")).not.toBe(s("wave-b"));
    expect(s("blink")).not.toBe(s("idle"));
  });
});
