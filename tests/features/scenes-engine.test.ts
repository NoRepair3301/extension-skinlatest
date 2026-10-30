import { afterEach, describe, expect, it, vi } from "vitest";
import { computeGutters } from "../../src/features/freespace/index.ts";
import { actorCount, assignActors, createSceneEngine, NODE_BUDGET } from "../../src/features/scenes/engine.ts";
import { SCENE_CSS } from "../../src/features/scenes/css.ts";
import { anim, el, root } from "../../src/features/scenes/svg.ts";
import { MOTIONS, type Actor, type SceneDef } from "../../src/features/scenes/types.ts";
import { compare, snapshot } from "../../src/plan/invariants.ts";

const fakeActor = (i: number, over: Partial<Actor> = {}): Actor => ({
  id: `a${i}`,
  lane: "any",
  motion: MOTIONS[i % MOTIONS.length]!,
  speed: 1,
  size: 60,
  x: 0.5,
  y: ((i * 37) % 100) / 100,
  build: (ctx) => {
    const r = root(ctx, 10, 10, el(ctx.doc, "circle", { cx: 5, cy: 5, r: 4 }));
    // three animated parts per actor
    for (let k = 0; k < 3; k++) r.append(anim(el(ctx.doc, "circle", { cx: k, cy: k, r: 1 }), "twinkle", { dur: 2 }));
    return r;
  },
  ...over,
});
const scene = (n: number): SceneDef => ({ id: "paper", name: "t", actors: Array.from({ length: n }, (_, i) => fakeActor(i)) });
const centred = computeGutters([{ x: 300, w: 600 }], 1200, 1200);

const shadowOf = () => (document.querySelector("[data-skinly-scene]") as HTMLElement | null)?.shadowRoot ?? undefined;

afterEach(() => {
  document.documentElement.querySelectorAll("[data-skinly-scene]").forEach((n) => n.remove());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("scene engine", () => {
  it("builds one clipped lane per usable gutter and every actor sits inside a lane", () => {
    const engine = createSceneEngine({ doc: document, win: window });
    expect(engine.show({ scene: scene(6), density: "high", lane: "both", gutters: centred, accent: "#336699" })).toBe("shown");
    const lanes = shadowOf()!.querySelectorAll(".lane");
    expect(lanes).toHaveLength(2);
    const actors = shadowOf()!.querySelectorAll(".actor");
    expect(actors.length).toBe(6);
    actors.forEach((a) => expect(a.parentElement?.className).toBe("lane"));
    expect(SCENE_CSS).toMatch(/\.lane\{[^}]*overflow:hidden/);
    expect(SCENE_CSS).toMatch(/\.root\{[^}]*pointer-events:none/);
    // actors are never wider than their lane
    actors.forEach((a) => expect(parseFloat((a as HTMLElement).style.width)).toBeLessThanOrEqual(300));
    engine.destroy();
  });

  it("lane choice left or right gives a single lane", () => {
    const engine = createSceneEngine({ doc: document, win: window });
    engine.show({ scene: scene(4), density: "normal", lane: "left", gutters: centred, accent: "#336699" });
    expect([...shadowOf()!.querySelectorAll(".lane")].map((l) => l.getAttribute("data-lane"))).toEqual(["left"]);
    engine.show({ scene: scene(4), density: "normal", lane: "right", gutters: centred, accent: "#336699" });
    expect([...shadowOf()!.querySelectorAll(".lane")].map((l) => l.getAttribute("data-lane"))).toEqual(["right"]);
    engine.destroy();
  });

  it("the node budget holds at every density, and density changes the actor count", () => {
    const engine = createSceneEngine({ doc: document, win: window });
    const counts: number[] = [];
    for (const density of ["low", "normal", "high"] as const) {
      engine.show({ scene: scene(16), density, lane: "both", gutters: centred, accent: "#336699" });
      expect(engine.animatedCount()).toBeLessThanOrEqual(NODE_BUDGET);
      counts.push(shadowOf()!.querySelectorAll(".actor").length);
    }
    expect(counts[0]!).toBeLessThan(counts[1]!);
    expect(counts[1]!).toBeLessThanOrEqual(counts[2]!);
    expect(NODE_BUDGET).toBe(40);
    engine.destroy();
  });

  it("actorCount never returns zero for a non-empty scene", () => {
    expect(actorCount(1, "low")).toBe(1);
    expect(actorCount(10, "low")).toBe(4);
    expect(actorCount(10, "high")).toBe(10);
    expect(actorCount(0, "high")).toBe(0);
  });

  it("assignActors honours explicit lanes and alternates the rest", () => {
    const a = [fakeActor(0, { lane: "left" }), fakeActor(1, { lane: "right" }), fakeActor(2), fakeActor(3)];
    const out = assignActors(a, 2, "both", ["left", "right"]);
    expect(out[0]!.map((x) => x.id)).toEqual(["a0", "a2"]);
    expect(out[1]!.map((x) => x.id)).toEqual(["a1", "a3"]);
    expect(assignActors(a, 1, "left", ["left"])[0]).toHaveLength(4);
  });

  it("shows nothing and creates no host when the page has no free gutter", () => {
    const engine = createSceneEngine({ doc: document, win: window });
    expect(engine.show({ scene: scene(4), density: "high", lane: "both", gutters: computeGutters([{ x: 0, w: 1200 }], 1200, 1200), accent: "#336699" })).toBe("no-gutter");
    expect(document.querySelector("[data-skinly-scene]")).toBeNull();
  });

  it("the host ignores the pointer and sits on the document element", () => {
    const engine = createSceneEngine({ doc: document, win: window });
    engine.show({ scene: scene(2), density: "low", lane: "both", gutters: centred, accent: "#336699" });
    const host = document.querySelector("[data-skinly-scene]") as HTMLElement;
    expect(host.parentElement).toBe(document.documentElement);
    expect(host.style.getPropertyValue("pointer-events")).toBe("none");
    expect(host.style.getPropertyValue("position")).toBe("fixed");
    engine.destroy();
  });

  it("reduced motion gives a still scene and a hidden document pauses it", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
    const engine = createSceneEngine({ doc: document, win: window });
    engine.show({ scene: scene(2), density: "low", lane: "both", gutters: centred, accent: "#336699" });
    expect(shadowOf()!.querySelector(".root")!.classList.contains("still")).toBe(true);
    expect(SCENE_CSS).toContain(".still [data-anim]{animation:none}");
    vi.unstubAllGlobals();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
    engine.show({ scene: scene(2), density: "low", lane: "both", gutters: centred, accent: "#336699" });
    const r = shadowOf()!.querySelector(".root")!;
    expect(r.classList.contains("paused")).toBe(false);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(r.classList.contains("paused")).toBe(true);
    expect(SCENE_CSS).toContain(".paused [data-anim]{animation-play-state:paused}");
    engine.destroy();
  });

  it("destroy removes the host and its listeners; later visibility events change nothing", () => {
    const engine = createSceneEngine({ doc: document, win: window });
    engine.show({ scene: scene(3), density: "high", lane: "both", gutters: centred, accent: "#336699" });
    engine.destroy();
    expect(document.querySelector("[data-skinly-scene]")).toBeNull();
    expect(engine.host()).toBeUndefined();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(document.querySelector("[data-skinly-scene]")).toBeNull();
  });

  it("changes no site element: the page DOM is equal before, during and after, and the invariants hold", () => {
    document.body.innerHTML = '<main><a href="/x">link</a><form action="/f"><input name="q"><button>go</button></form><p>text</p></main>';
    const before = document.body.outerHTML;
    const snap = snapshot(document);
    const engine = createSceneEngine({ doc: document, win: window });
    engine.show({ scene: scene(6), density: "high", lane: "both", gutters: centred, accent: "#336699" });
    expect(document.body.outerHTML).toBe(before);
    expect(compare(snap, snapshot(document))).toEqual([]);
    engine.destroy();
    expect(document.body.outerHTML).toBe(before);
    expect(document.documentElement.querySelector("[data-skinly-scene]")).toBeNull();
  });

  it("a failing actor is skipped and does not stop the others", () => {
    const bad = fakeActor(0, { build: () => { throw new Error("x"); } });
    const engine = createSceneEngine({ doc: document, win: window });
    engine.show({ scene: { id: "paper", name: "t", actors: [bad, fakeActor(1)] }, density: "high", lane: "left", gutters: centred, accent: "#336699" });
    expect(shadowOf()!.querySelectorAll(".actor")).toHaveLength(1);
    engine.destroy();
  });
});
