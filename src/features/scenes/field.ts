import { ARMY_WEAPON_PROPS } from "../../config.ts";
import { anim, art, el, rfill, softShadow, vfill } from "./svg.ts";
import type { Actor, SceneDef } from "./types.ts";

const OLIVE = "#6b7a3a";
const OLIVE_D = "#3c4722";
const KHAKI = "#c2b280";
const GREEN_D = "#2f3d22";

/** Soft camouflage patches for the gutter background. Generic blob colours, no pattern copied from any uniform. */
const camo: Actor = {
  id: "camo-patch",
  lane: "any",
  motion: "pulse",
  speed: 0.15,
  size: 150,
  ratio: 2,
  x: 0.5,
  y: 0.5,
  back: true,
  build: (ctx) =>
    art(ctx, 150, 300, (defs, g) => {
      const d = ctx.doc;
      const blob = (x: number, y: number, rx: number, ry: number, c: string, rot: number) => el(d, "ellipse", { cx: x, cy: y, rx, ry, fill: rfill(ctx, defs, [[0, c, 0.5], [0.7, c, 0.28], [1, c, 0]], [0.5, 0.5]), transform: `rotate(${rot} ${x} ${y})` });
      g.append(blob(40, 40, 46, 24, OLIVE, -20), blob(110, 90, 34, 40, KHAKI, 10), blob(50, 150, 40, 22, GREEN_D, 25), blob(105, 210, 44, 26, OLIVE, -15), blob(40, 262, 36, 28, KHAKI, 30));
    }),
};

/** Top-down generic tank silhouette that rolls up and down its lane while the turret turns slowly. */
const tank: Actor = {
  id: "tank",
  lane: "any",
  motion: "patrol",
  speed: 0.7,
  size: 74,
  ratio: 1.4,
  x: 0.5,
  y: 0.1,
  build: (ctx) =>
    art(ctx, 74, 104, (defs, g) => {
      const d = ctx.doc;
      const hull = vfill(ctx, defs, [[0, "#8a9a4c"], [1, "#55642c"]], [0, 0, 1, 0]);
      const turret = rfill(ctx, defs, [[0, "#a3b360"], [0.6, "#6d7d38"], [1, "#46551f"]], [0.35, 0.3]);
      const track = vfill(ctx, defs, [[0, "#3b3f35"], [1, "#1f221b"]], [0, 0, 1, 0]);
      g.append(softShadow(ctx, 37, 98, 30, 3, "#101808", 0.25));
      for (const x of [6, 54]) {
        g.append(el(d, "rect", { x, y: 14, width: 14, height: 78, rx: 5, fill: track, stroke: "#14170f", "stroke-width": 1 }));
        for (let i = 0; i < 8; i++) g.append(el(d, "path", { d: `M${x + 1} ${20 + i * 9.2} h12`, stroke: "#6a6f5e", "stroke-width": 1.2, opacity: 0.7 }));
      }
      g.append(
        el(d, "rect", { x: 14, y: 16, width: 46, height: 74, rx: 7, fill: hull, stroke: OLIVE_D, "stroke-width": 1.2 }),
        el(d, "rect", { x: 18, y: 20, width: 38, height: 10, rx: 3, fill: KHAKI, opacity: 0.35 }),
        el(d, "path", { d: "M20 72 h34 M20 78 h34", stroke: OLIVE_D, "stroke-width": 1, opacity: 0.6 }),
        anim(
          el(d, "g", {},
            el(d, "rect", { x: 33, y: -2, width: 8, height: 40, rx: 2.5, fill: "#3f4b21", stroke: "#1f2810", "stroke-width": 1 }),
            el(d, "rect", { x: 31.5, y: -3, width: 11, height: 6, rx: 2, fill: "#2a3314" }),
            el(d, "ellipse", { cx: 37, cy: 52, rx: 19, ry: 20, fill: turret, stroke: OLIVE_D, "stroke-width": 1.2 }),
            el(d, "circle", { cx: 44, cy: 56, r: 5, fill: "#4a5a26", stroke: OLIVE_D, "stroke-width": 0.9 }),
            el(d, "ellipse", { cx: 30, cy: 44, rx: 7, ry: 3.6, fill: "#fff", opacity: 0.28, transform: "rotate(-30 30 44)" }),
          ),
          "turret",
          { dur: 7 },
        ),
      );
    }),
};

const helicopter: Actor = {
  id: "helicopter",
  lane: "any",
  motion: "float",
  speed: 0.6,
  size: 96,
  ratio: 1.1,
  x: 0.5,
  y: 0.32,
  amp: 8,
  build: (ctx) =>
    art(ctx, 96, 106, (defs, g) => {
      const d = ctx.doc;
      const body = vfill(ctx, defs, [[0, "#8fa04e"], [1, "#4d5c27"]], [0, 0, 1, 0]);
      const glass = rfill(ctx, defs, [[0, "#cfeeff"], [0.6, "#6aa6c8"], [1, "#2d5b7a"]]);
      g.append(softShadow(ctx, 48, 100, 28, 3, "#101808", 0.2));
      g.append(
        el(d, "rect", { x: 45, y: 58, width: 6, height: 40, rx: 3, fill: "#55642c", stroke: OLIVE_D, "stroke-width": 1 }),
        anim(el(d, "g", {}, el(d, "ellipse", { cx: 48, cy: 96, rx: 3, ry: 11, fill: "#2f3a18" }), el(d, "ellipse", { cx: 48, cy: 96, rx: 11, ry: 3, fill: "#2f3a18" })), "rotor", { dur: 0.35 }),
        el(d, "path", { d: "M48 12 C66 12 70 34 66 54 C64 66 58 72 48 72 C38 72 32 66 30 54 C26 34 30 12 48 12 Z", fill: body, stroke: OLIVE_D, "stroke-width": 1.2 }),
        el(d, "path", { d: "M48 16 C60 16 62 28 60 36 H36 C34 28 36 16 48 16 Z", fill: glass, stroke: "#27424f", "stroke-width": 1 }),
        el(d, "path", { d: "M40 22 q3 -5 9 -5", fill: "none", stroke: "#fff", "stroke-width": 2, "stroke-linecap": "round", opacity: 0.7 }),
        el(d, "path", { d: "M32 44 L22 48 M64 44 L74 48", stroke: OLIVE_D, "stroke-width": 3, "stroke-linecap": "round" }),
        el(d, "rect", { x: 40, y: 46, width: 16, height: 20, rx: 4, fill: "#55642c", opacity: 0.6 }),
        el(d, "circle", { cx: 48, cy: 46, r: 4, fill: "#2f3a18", stroke: "#1b230d", "stroke-width": 1 }),
      );
      // the main rotor: a faint disc plus two blades that spin
      g.append(el(d, "circle", { cx: 48, cy: 46, r: 40, fill: "#e5edc9", opacity: 0.1 }));
      g.append(anim(el(d, "g", {}, el(d, "rect", { x: 6, y: 44, width: 84, height: 4, rx: 2, fill: "#2a3314", opacity: 0.85 }), el(d, "rect", { x: 46, y: 4, width: 4, height: 84, rx: 2, fill: "#2a3314", opacity: 0.85 })), "rotor", { dur: 0.6 }));
      g.append(el(d, "circle", { cx: 48, cy: 46, r: 4.4, fill: "#bcc78a", stroke: "#2a3314", "stroke-width": 1 }));
    }),
};

const jeep: Actor = {
  id: "jeep",
  lane: "any",
  motion: "float",
  speed: 0.4,
  size: 62,
  ratio: 1.3,
  x: 0.5,
  y: 0.58,
  amp: 4,
  build: (ctx) =>
    art(ctx, 62, 80, (defs, g) => {
      const d = ctx.doc;
      const body = vfill(ctx, defs, [[0, "#8a9a4c"], [1, "#55642c"]], [0, 0, 1, 0]);
      g.append(softShadow(ctx, 31, 76, 24, 2.6, "#101808", 0.22));
      for (const [x, y] of [[6, 14], [48, 14], [6, 54], [48, 54]] as const) g.append(el(d, "rect", { x, y, width: 8, height: 14, rx: 3, fill: "#23261c", stroke: "#0f110b", "stroke-width": 0.8 }));
      g.append(
        el(d, "rect", { x: 12, y: 8, width: 38, height: 66, rx: 8, fill: body, stroke: OLIVE_D, "stroke-width": 1.2 }),
        el(d, "rect", { x: 16, y: 24, width: 30, height: 10, rx: 3, fill: "#a7d1e4", stroke: "#2d5b7a", "stroke-width": 1 }),
        el(d, "path", { d: "M18 28 h10", stroke: "#fff", "stroke-width": 1.6, "stroke-linecap": "round", opacity: 0.8 }),
        el(d, "rect", { x: 16, y: 40, width: 30, height: 26, rx: 4, fill: OLIVE_D, opacity: 0.4 }),
        el(d, "rect", { x: 22, y: 12, width: 18, height: 8, rx: 2, fill: KHAKI, opacity: 0.4 }),
        el(d, "circle", { cx: 18, cy: 11, r: 2.2, fill: "#fff2a8", stroke: "#8a7a2a", "stroke-width": 0.6 }),
        el(d, "circle", { cx: 44, cy: 11, r: 2.2, fill: "#fff2a8", stroke: "#8a7a2a", "stroke-width": 0.6 }),
      );
    }),
};

const radar: Actor = {
  id: "radar",
  lane: "any",
  motion: "pulse",
  speed: 0.2,
  size: 78,
  x: 0.5,
  y: 0.7,
  build: (ctx) =>
    art(ctx, 78, 78, (defs, g) => {
      const d = ctx.doc;
      const screen = rfill(ctx, defs, [[0, "#2c4a2a"], [1, "#0f1d0f"]], [0.5, 0.5]);
      const sweep = vfill(ctx, defs, [[0, "#7bff7b", 0.0], [1, "#7bff7b", 0.65]], [0, 0, 1, 0]);
      g.append(
        el(d, "circle", { cx: 39, cy: 39, r: 36, fill: "#4a5a2a", stroke: OLIVE_D, "stroke-width": 1.4 }),
        el(d, "circle", { cx: 39, cy: 39, r: 31, fill: screen, stroke: "#97c38f", "stroke-width": 1 }),
        el(d, "circle", { cx: 39, cy: 39, r: 21, fill: "none", stroke: "#4f8a4f", "stroke-width": 0.8 }),
        el(d, "circle", { cx: 39, cy: 39, r: 10, fill: "none", stroke: "#4f8a4f", "stroke-width": 0.8 }),
        el(d, "path", { d: "M39 8 v62 M8 39 h62", stroke: "#4f8a4f", "stroke-width": 0.8 }),
      );
      g.append(anim(el(d, "g", {}, el(d, "path", { d: "M39 39 L39 8 A31 31 0 0 1 61 17 Z", fill: sweep }), el(d, "path", { d: "M39 39 L39 8", stroke: "#9dff9d", "stroke-width": 1.4 })), "sweep", { dur: 4 }));
      for (const [x, y, i] of [[52, 26, 0], [26, 50, 1], [48, 52, 2]] as const) g.append(anim(el(d, "circle", { cx: x, cy: y, r: 1.8, fill: "#c9ffc9" }), "twinkle", { dur: 2.2 + i * 0.6, delay: i * 0.8 }));
      g.append(el(d, "ellipse", { cx: 26, cy: 22, rx: 9, ry: 4, fill: "#fff", opacity: 0.18, transform: "rotate(-35 26 22)" }));
    }),
};

const supply: Actor = {
  id: "supply-crate",
  lane: "any",
  motion: "cross",
  speed: 0.45,
  size: 64,
  ratio: 1.3,
  x: 0.4,
  y: 0.06,
  delay: 2,
  build: (ctx) =>
    art(ctx, 64, 84, (defs, g) => {
      const d = ctx.doc;
      const chute = vfill(ctx, defs, [[0, "#f3ecd0"], [1, "#c2b280"]]);
      const crate = vfill(ctx, defs, [[0, "#a58a52"], [1, "#6f5a30"]], [0, 0, 1, 1]);
      g.append(
        el(d, "path", { d: "M32 4 C10 4 4 22 4 32 H60 C60 22 54 4 32 4 Z", fill: chute, stroke: "#8b7d4e", "stroke-width": 1, "stroke-linejoin": "round" }),
        el(d, "path", { d: "M32 4 C24 12 20 22 20 32 M32 4 C40 12 44 22 44 32 M32 4 V32", fill: "none", stroke: "#8b7d4e", "stroke-width": 0.9 }),
        el(d, "path", { d: "M12 10 C16 7 22 5 26 5", fill: "none", stroke: "#fff", "stroke-width": 2, "stroke-linecap": "round", opacity: 0.6 }),
        el(d, "path", { d: "M4 32 L26 62 M60 32 L38 62 M32 32 V62", stroke: "#6e6446", "stroke-width": 0.9 }),
        el(d, "rect", { x: 22, y: 60, width: 20, height: 18, rx: 2, fill: crate, stroke: "#3f3118", "stroke-width": 1 }),
        el(d, "path", { d: "M22 66 h20 M32 60 v18", stroke: "#3f3118", "stroke-width": 1, opacity: 0.6 }),
        el(d, "rect", { x: 24, y: 61.5, width: 16, height: 3, fill: "#fff", opacity: 0.25 }),
      );
    }),
};

const dogTags: Actor = {
  id: "dog-tags",
  lane: "any",
  motion: "sway",
  speed: 0.35,
  size: 50,
  ratio: 1.6,
  x: 0.5,
  y: 0.84,
  build: (ctx) =>
    art(ctx, 50, 80, (defs, g) => {
      const d = ctx.doc;
      const metal = vfill(ctx, defs, [[0, "#f6f8fb"], [0.5, "#b0b9c6"], [1, "#6e7889"]], [0, 0, 1, 1]);
      const tag = (x: number, y: number, rot: number) =>
        el(d, "g", { transform: `translate(${x} ${y}) rotate(${rot})` },
          el(d, "rect", { x: -9, y: 0, width: 18, height: 28, rx: 8, fill: metal, stroke: "#4a5365", "stroke-width": 1 }),
          el(d, "circle", { cx: 0, cy: 5, r: 1.8, fill: "#4a5365" }),
          el(d, "rect", { x: -5, y: 11, width: 10, height: 2, rx: 1, fill: "#4a5365", opacity: 0.55 }),
          el(d, "rect", { x: -5, y: 16, width: 10, height: 2, rx: 1, fill: "#4a5365", opacity: 0.55 }),
          el(d, "rect", { x: -5, y: 21, width: 7, height: 2, rx: 1, fill: "#4a5365", opacity: 0.55 }),
          el(d, "path", { d: "M-6 3 q0 -2 3 -2", fill: "none", stroke: "#fff", "stroke-width": 1.6, "stroke-linecap": "round", opacity: 0.8 }),
        );
      g.append(el(d, "path", { d: "M8 0 Q25 14 42 0", fill: "none", stroke: "#7d8798", "stroke-width": 1.6, "stroke-dasharray": "2 1.5" }));
      g.append(anim(el(d, "g", {}, tag(25, 14, -4), tag(30, 22, 8)), "swing", { dur: 3.2 }));
    }),
};

const compass: Actor = {
  id: "compass",
  lane: "any",
  motion: "float",
  speed: 0.3,
  size: 72,
  x: 0.5,
  y: 0.46,
  amp: 4,
  build: (ctx) =>
    art(ctx, 72, 72, (defs, g) => {
      const d = ctx.doc;
      const face = rfill(ctx, defs, [[0, "#fbf3d8"], [1, "#d9c78f"]], [0.4, 0.3]);
      const rim = vfill(ctx, defs, [[0, "#d7b45a"], [1, "#7c5d1a"]], [0, 0, 1, 1]);
      g.append(softShadow(ctx, 36, 68, 24, 2.6, "#201a08", 0.22));
      g.append(
        el(d, "circle", { cx: 36, cy: 36, r: 32, fill: rim, stroke: "#4c3a0c", "stroke-width": 1 }),
        el(d, "circle", { cx: 36, cy: 36, r: 27, fill: face, stroke: "#7c5d1a", "stroke-width": 1 }),
      );
      for (let i = 0; i < 12; i++) g.append(el(d, "path", { d: `M36 11 v${i % 3 === 0 ? 6 : 3}`, stroke: "#5c4512", "stroke-width": i % 3 === 0 ? 1.6 : 0.9, transform: `rotate(${i * 30} 36 36)` }));
      g.append(
        anim(el(d, "g", {}, el(d, "path", { d: "M36 14 L41 36 L36 34 L31 36 Z", fill: "#c8362f", stroke: "#6b1511", "stroke-width": 0.8, "stroke-linejoin": "round" }), el(d, "path", { d: "M36 58 L41 36 L36 38 L31 36 Z", fill: "#e8e4d6", stroke: "#6b6554", "stroke-width": 0.8, "stroke-linejoin": "round" })), "sway", { dur: 3.4 }),
        el(d, "circle", { cx: 36, cy: 36, r: 2.6, fill: "#7c5d1a", stroke: "#3a2c08", "stroke-width": 0.6 }),
        el(d, "ellipse", { cx: 26, cy: 22, rx: 10, ry: 4, fill: "#fff", opacity: 0.35, transform: "rotate(-35 26 22)" }),
      );
    }),
};

/** One flat, stylised rifle silhouette. It never moves, has no muzzle flash and no target. Removable with ARMY_WEAPON_PROPS in src/config.ts. */
const rifleProp: Actor = {
  id: "rifle-prop",
  lane: "any",
  motion: "sway",
  speed: 0.2,
  size: 96,
  ratio: 0.35,
  x: 0.5,
  y: 0.96,
  build: (ctx) =>
    art(ctx, 96, 34, (defs, g) => {
      const d = ctx.doc;
      const wood = vfill(ctx, defs, [[0, "#9a7447"], [1, "#6a4a26"]]);
      g.append(
        el(d, "path", { d: "M4 14 L22 12 L30 17 L30 24 L12 26 Q4 24 4 14 Z", fill: wood, stroke: "#3c2a14", "stroke-width": 1, "stroke-linejoin": "round" }),
        el(d, "rect", { x: 28, y: 12, width: 38, height: 9, rx: 2, fill: "#4a5560", stroke: "#242a31", "stroke-width": 1 }),
        el(d, "rect", { x: 66, y: 14, width: 26, height: 4, rx: 1.5, fill: "#39424b", stroke: "#242a31", "stroke-width": 0.8 }),
        el(d, "path", { d: "M44 21 v8 q0 2 3 2 h4 q2 0 2 -3 v-7 Z", fill: "#39424b", stroke: "#242a31", "stroke-width": 0.9, "stroke-linejoin": "round" }),
        el(d, "rect", { x: 32, y: 13, width: 28, height: 2.4, rx: 1.2, fill: "#fff", opacity: 0.25 }),
      );
    }),
};

const camoBadge: Actor = {
  id: "camo-badge",
  lane: "any",
  motion: "pulse",
  speed: 0.25,
  size: 52,
  x: 0.5,
  y: 0.2,
  build: (ctx) =>
    art(ctx, 52, 52, (defs, g) => {
      const d = ctx.doc;
      const clipId = ctx.uid("c");
      defs.append(el(d, "clipPath", { id: clipId }, el(d, "circle", { cx: 26, cy: 26, r: 22 })));
      g.append(
        el(d, "circle", { cx: 26, cy: 26, r: 24, fill: "#2a3318", stroke: "#1a2210", "stroke-width": 1 }),
        el(d, "g", { "clip-path": `url(#${clipId})` },
          el(d, "rect", { x: 0, y: 0, width: 52, height: 52, fill: OLIVE }),
          el(d, "ellipse", { cx: 16, cy: 16, rx: 14, ry: 8, fill: KHAKI, transform: "rotate(-20 16 16)" }),
          el(d, "ellipse", { cx: 36, cy: 22, rx: 10, ry: 14, fill: GREEN_D }),
          el(d, "ellipse", { cx: 22, cy: 38, rx: 16, ry: 7, fill: GREEN_D, transform: "rotate(14 22 38)" }),
          el(d, "ellipse", { cx: 40, cy: 42, rx: 9, ry: 6, fill: KHAKI }),
        ),
        el(d, "path", { d: "M26 12 l3.4 9 9.6 .4 -7.6 6 2.6 9.2 -8 -5.3 -8 5.3 2.6 -9.2 -7.6 -6 9.6 -.4 Z", fill: "#f3e7b8", opacity: 0.92, stroke: "#8a7a3a", "stroke-width": 0.6, "stroke-linejoin": "round" }),
        el(d, "ellipse", { cx: 18, cy: 14, rx: 8, ry: 3, fill: "#fff", opacity: 0.25, transform: "rotate(-30 18 14)" }),
      );
    }),
};

export const FIELD: SceneDef = {
  id: "field",
  name: "Field",
  // Camo ground, tank, helicopter and (when allowed) the rifle prop come first so even the lowest density shows them.
  actors: [camo, tank, helicopter, ...(ARMY_WEAPON_PROPS ? [rifleProp] : []), camoBadge, radar, supply, jeep, compass, dogTags],
};
