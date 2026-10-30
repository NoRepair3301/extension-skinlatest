import { afterEach, describe, expect, it, vi } from "vitest";
import { drawPet, POSES } from "../../src/features/pet/art.ts";
import { createAnimator, poseAt } from "../../src/features/pet/animate.ts";
import { collectObstacles, nextCorner, petBox, type Box } from "../../src/features/pet/avoid.ts";
import { createOverlay } from "../../src/features/pet/overlay.ts";
import { createPetController, type PetConfig, type PetEnv } from "../../src/features/pet/pet.ts";
import { parseSettings, defaultSettings } from "../../src/extension/settings.ts";

const cfg = (over: Partial<PetConfig> = {}): PetConfig => ({ enabled: true, kind: "pebble", size: "medium", corner: "bottom-right", disabledOrigins: [], ...over });

function makeEnv(opts: { reduced?: boolean } = {}) {
  let nextId = 1;
  const frames = new Map<number, (t: number) => void>();
  const timers = new Map<number, () => void>();
  // jsdom has no matchMedia
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: Boolean(opts.reduced) && q.includes("reduce"), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
  const env: PetEnv = {
    doc: document,
    win: window,
    raf: (cb) => (frames.set(nextId, cb), nextId++),
    caf: (id) => void frames.delete(id),
    setTimeout: (fn) => (timers.set(nextId, fn), nextId++),
    clearTimeout: (id) => void timers.delete(id),
  };
  return { env, frames, timers };
}

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.querySelectorAll("[data-skinly-ui]").forEach((n) => n.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const hosts = () => document.querySelectorAll('[data-skinly-ui="pet"]');

describe("art", () => {
  it("draws every pose for both pets from SVG shapes only", () => {
    for (const kind of ["pebble", "sprout"] as const) {
      for (const pose of POSES) {
        const svg = drawPet(document, kind, pose);
        expect(svg.namespaceURI).toContain("svg");
        expect(svg.querySelector("script,image,foreignObject")).toBeNull();
        expect(svg.getAttribute("data-pose")).toBe(pose);
      }
    }
  });
});

describe("controller: off costs nothing", () => {
  it("creates no host, listener, timer or frame while disabled", () => {
    const { env, frames, timers } = makeEnv();
    const add = vi.spyOn(window, "addEventListener");
    const ctl = createPetController(env);
    ctl.sync(cfg({ enabled: false }), "https://a.test", true);
    ctl.sync(cfg(), "https://a.test", false);
    ctl.sync(cfg({ disabledOrigins: ["https://a.test"] }), "https://a.test", true);
    expect(hosts().length).toBe(0);
    expect(frames.size).toBe(0);
    expect(timers.size).toBe(0);
    expect(add).not.toHaveBeenCalled();
    expect(ctl.mounted()).toBe(false);
  });

  it("disabling removes host, listeners, timers and frames", () => {
    const { env, frames, timers } = makeEnv();
    const remove = vi.spyOn(window, "removeEventListener");
    const ctl = createPetController(env);
    ctl.sync(cfg(), "https://a.test", true);
    expect(hosts().length).toBe(1);
    expect(frames.size).toBe(0); // a still pet never asks for an animation frame
    expect(timers.size).toBeGreaterThan(0); // blink, wave and the corner check use timers
    ctl.sync(cfg({ enabled: false }), "https://a.test", true);
    expect(hosts().length).toBe(0);
    expect(frames.size).toBe(0);
    expect(timers.size).toBe(0);
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
  });

  it("destroy is idempotent and a changed setting leaves one host only", () => {
    const { env } = makeEnv();
    const ctl = createPetController(env);
    ctl.sync(cfg(), undefined, true);
    ctl.sync(cfg({ size: "large" }), undefined, true);
    expect(hosts().length).toBe(1);
    ctl.destroy();
    ctl.destroy();
    expect(hosts().length).toBe(0);
  });
});

describe("overlay", () => {
  it("host ignores the pointer and uses a bounded z-index", () => {
    const o = createOverlay(document, { kind: "pebble", size: "small", corner: "top-left", onHide: () => undefined, onPetClick: () => undefined });
    expect(o.host.style.getPropertyValue("pointer-events")).toBe("none");
    expect(Number(o.host.style.getPropertyValue("z-index"))).toBeLessThan(2147483647);
    expect(o.host.style.getPropertyValue("top")).toBe("12px");
    expect(o.host.style.getPropertyValue("left")).toBe("12px");
    o.destroy();
  });
  it("hide button is focusable and labelled; Escape hides", () => {
    const onHide = vi.fn();
    const o = createOverlay(document, { kind: "sprout", size: "medium", corner: "bottom-right", onHide, onPetClick: () => undefined });
    const root = o.host.shadowRoot!;
    const hide = root.querySelector<HTMLButtonElement>("button.hide")!;
    expect(hide.getAttribute("aria-label")).toBe("Hide pet");
    expect(hide.tabIndex).toBeGreaterThanOrEqual(0);
    hide.click();
    expect(onHide).toHaveBeenCalledTimes(1);
    const pet = root.querySelector<HTMLButtonElement>("button.pet")!;
    expect(pet.getAttribute("aria-label")).toBeTruthy();
    pet.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onHide).toHaveBeenCalledTimes(2);
    o.destroy();
  });
  it("hiding through the controller removes the host", () => {
    const { env } = makeEnv();
    const ctl = createPetController(env);
    ctl.sync(cfg(), undefined, true);
    hosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>("button.hide")!.click();
    expect(hosts().length).toBe(0);
    expect(ctl.mounted()).toBe(false);
  });
});

describe("animation", () => {
  it("reduced motion: no frame loop", () => {
    const { env, frames } = makeEnv({ reduced: true });
    const ctl = createPetController(env);
    ctl.sync(cfg(), undefined, true);
    expect(frames.size).toBe(0);
    ctl.destroy();
  });
  it("hidden tab pauses; becoming visible resumes", () => {
    let hidden = true;
    let envCb: (() => void) | undefined;
    const frames = new Map<number, () => void>();
    let id = 1;
    const a = createAnimator({
      setPose: () => undefined,
      reducedMotion: () => false,
      isHidden: () => hidden,
      raf: (cb) => (frames.set(id, () => cb(0)), id++),
      caf: (i) => void frames.delete(i),
      timer: () => () => undefined,
      onEnvChange: (cb) => ((envCb = cb), () => undefined),
      place: () => undefined,
      walking: () => undefined,
      walk: () => undefined,
      sleepWhenIdle: () => false,
      onActivity: () => () => undefined,
    });
    a.start();
    expect(a.running()).toBe(false);
    hidden = false;
    envCb!();
    expect(a.running()).toBe(true);
    hidden = true;
    envCb!();
    expect(a.running()).toBe(false);
    expect(frames.size).toBe(0);
    a.destroy();
  });
  it("poseAt cycles idle and blink (walking poses now come from real walking)", () => {
    const seen = new Set<string>();
    for (let t = 0; t < 30000; t += 40) seen.add(poseAt(t));
    expect(seen).toEqual(new Set(["idle", "blink"]));
  });
});

describe("avoid", () => {
  const vp = { w: 1000, h: 800 };
  const at = (corner: "bottom-right" | "bottom-left" | "top-right" | "top-left"): Box => petBox(corner, "medium", vp);
  it("keeps the corner when nothing overlaps", () => {
    expect(nextCorner("bottom-right", "medium", vp, [{ x: 400, y: 300, w: 100, h: 40 }])).toBe("bottom-right");
  });
  it("moves when an obstacle overlaps the current corner", () => {
    expect(nextCorner("bottom-right", "medium", vp, [at("bottom-right")])).toBe("bottom-left");
    expect(nextCorner("bottom-right", "medium", vp, [at("bottom-right"), at("bottom-left")])).toBe("top-right");
  });
  it("stays put when every corner is blocked", () => {
    const all = (["bottom-right", "bottom-left", "top-right", "top-left"] as const).map(at);
    expect(nextCorner("top-left", "medium", vp, all)).toBe("top-left");
  });
  const rectOf = (el: Element): Box => {
    const r = el.getAttribute("data-box")!.split(",").map(Number);
    return { x: r[0]!, y: r[1]!, w: r[2]!, h: r[3]! };
  };
  const BR = "916,716,72,72";
  const cases: Array<[string, string]> = [
    ["password input", `<input type="password" data-box="${BR}">`],
    ["submit button", `<form><button type="submit" data-box="${BR}">x</button></form>`],
    ["form field", `<input type="text" data-box="${BR}">`],
    ["modal close control", `<div role="dialog"><button aria-label="Close" data-box="${BR}">x</button></div>`],
  ];
  for (const [name, html] of cases) {
    it(`finds and avoids a ${name}`, () => {
      document.body.innerHTML = html;
      const obstacles = collectObstacles(document, vp, rectOf);
      expect(obstacles.length).toBeGreaterThan(0);
      expect(nextCorner("bottom-right", "medium", vp, obstacles)).not.toBe("bottom-right");
    });
  }
  it("ignores off-screen and unrelated elements", () => {
    document.body.innerHTML = `<input type="text" data-box="5000,5000,50,20"><button data-box="916,716,72,72">ok</button><div role="dialog"><button data-box="916,716,72,72">Next</button></div>`;
    expect(collectObstacles(document, vp, rectOf)).toEqual([]);
  });
});

describe("pet settings", () => {
  it("is off by default and validates input", () => {
    expect(defaultSettings().pet.enabled).toBe(false);
    expect(defaultSettings().pet).toMatchObject({ kind: "fox", motion: "still", keepInFreeSpace: true, sleepWhenIdle: false, speed: "normal" });
    const s = parseSettings({ pet: { enabled: true, kind: "sprout", size: "huge", corner: "top-left", disabledOrigins: ["https://a.test", "https://a.test/x", 5] } });
    expect(s.pet).toEqual({ ...defaultSettings().pet, enabled: true, kind: "sprout", size: "medium", corner: "top-left", disabledOrigins: ["https://a.test"] });
    expect(parseSettings({ pet: "x" }).pet).toEqual(defaultSettings().pet);
  });
});
