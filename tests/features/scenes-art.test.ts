import { describe, expect, it } from "vitest";
import { computeGutters } from "../../src/features/freespace/index.ts";
import { createSceneEngine, NODE_BUDGET } from "../../src/features/scenes/engine.ts";
import { getScene, SCENES, SCENE_IDS } from "../../src/features/scenes/index.ts";
import { SVG_NS } from "../../src/features/scenes/svg.ts";

const gutters = computeGutters([{ x: 360, w: 600 }], 1320, 1320);
const ctxFor = () => {
  let n = 0;
  return { doc: document, accent: "#336699", uid: (s: string) => `${s}${++n}` };
};

describe("built-in scenes", () => {
  it("every scene id except none has art, and none has none", () => {
    expect(getScene("none")).toBeUndefined();
    for (const id of SCENE_IDS) if (id !== "none") expect(getScene(id)?.actors.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(SCENES.map((s) => s.id).sort()).toEqual(SCENE_IDS.filter((i) => i !== "none").sort());
  });

  it("each actor builds a pure SVG tree: SVG namespace only, no images, links, scripts or foreign objects", () => {
    for (const scene of SCENES) {
      for (const a of scene.actors) {
        const svg = a.build(ctxFor());
        expect(svg.namespaceURI).toBe(SVG_NS);
        for (const e of [svg, ...Array.from(svg.querySelectorAll("*"))]) {
          expect(e.namespaceURI).toBe(SVG_NS);
          expect(["image", "a", "script", "foreignObject", "use", "style", "animate", "set"]).not.toContain(e.localName);
          for (const at of Array.from(e.attributes)) {
            expect(at.name.startsWith("on")).toBe(false);
            expect(at.name === "href" || at.name === "xlink:href").toBe(false);
            expect(at.value).not.toMatch(/https?:|data:|javascript:/i);
          }
        }
      }
    }
  });

  it("every gradient and clip reference points at an id defined in the same actor, and ids are unique inside one actor", () => {
    for (const scene of SCENES) {
      for (const a of scene.actors) {
        const svg = a.build(ctxFor());
        const ids = Array.from(svg.querySelectorAll("[id]")).map((e) => e.getAttribute("id")!);
        expect(new Set(ids).size, `${scene.id}/${a.id} has duplicate ids`).toBe(ids.length);
        for (const e of Array.from(svg.querySelectorAll("*"))) {
          for (const at of Array.from(e.attributes)) {
            for (const m of at.value.matchAll(/url\(#([^)]+)\)/g)) expect(ids, `${scene.id}/${a.id}: ${at.name} -> ${m[1]}`).toContain(m[1]);
          }
        }
      }
    }
  });

  it("art is shaded: every actor uses a gradient or layered shapes (no single flat circle)", () => {
    for (const scene of SCENES) {
      for (const a of scene.actors) {
        const svg = a.build(ctxFor());
        const shapes = svg.querySelectorAll("circle,ellipse,path,rect").length;
        const gradients = svg.querySelectorAll("linearGradient,radialGradient").length;
        expect(shapes, `${scene.id}/${a.id}`).toBeGreaterThanOrEqual(3);
        expect(gradients > 0 || shapes >= 6, `${scene.id}/${a.id} is flat`).toBe(true);
      }
    }
  });

  it("each scene stays inside the node budget at high density and keeps every animation on transform or opacity names", () => {
    for (const scene of SCENES) {
      const engine = createSceneEngine({ doc: document, win: window });
      expect(engine.show({ scene, density: "high", lane: "both", gutters, accent: "#336699" })).toBe("shown");
      expect(engine.animatedCount(), scene.id).toBeLessThanOrEqual(NODE_BUDGET);
      expect(engine.animatedCount(), scene.id).toBeGreaterThan(0);
      engine.destroy();
    }
  });

  it("a scene moves and animates (at least one animated actor) and the whole stylesheet only animates transform and opacity", async () => {
    const { SCENE_CSS } = await import("../../src/features/scenes/css.ts");
    const frames = SCENE_CSS.match(/@keyframes [^{]+\{(?:[^{}]*\{[^}]*\})+\}/g) ?? [];
    expect(frames.length).toBeGreaterThan(20);
    for (const f of frames) {
      for (const decl of f.match(/[a-z-]+(?=:)/g) ?? []) {
        if (/^k-|^from$|^to$/.test(decl)) continue;
        expect(["transform", "opacity"], f).toContain(decl);
      }
    }
  });
});

import { ARMY_WEAPON_PROPS } from "../../src/config.ts";
import { FIELD } from "../../src/features/scenes/field.ts";
import { actorCount } from "../../src/features/scenes/engine.ts";

describe("Field scene shows its signature props at every density", () => {
  it("has a tank, a helicopter and (when ARMY_WEAPON_PROPS is true) the rifle prop", () => {
    const ids = FIELD.actors.map((a) => a.id);
    expect(ids).toContain("tank");
    expect(ids).toContain("helicopter");
    expect(ARMY_WEAPON_PROPS).toBe(true);
    expect(ids).toContain("rifle-prop");
  });
  it.each(["low", "normal", "high"] as const)("%s density keeps tank, helicopter and rifle", (density) => {
    const shown = FIELD.actors.slice(0, actorCount(FIELD.actors.length, density)).map((a) => a.id);
    for (const id of ["tank", "helicopter", "rifle-prop"]) expect(shown).toContain(id);
  });
});
