import { anim, art, el, halo, rfill, sparklePath, vfill } from "./svg.ts";
import type { Actor, SceneDef } from "./types.ts";

const moon: Actor = {
  id: "crescent-moon",
  lane: "any",
  motion: "float",
  speed: 0.35,
  size: 84,
  x: 0.5,
  y: 0.14,
  amp: 8,
  build: (ctx) =>
    art(ctx, 84, 84, (defs, g) => {
      const d = ctx.doc;
      const fill = vfill(ctx, defs, [[0, "#fffbe3"], [0.6, "#f4e3a6"], [1, "#d6b866"]], [0, 0, 1, 1]);
      g.append(halo(ctx, 42, 42, 40, "#fff0b8", 0.55));
      g.append(
        // crescent: an outer arc and a deeper inner arc
        el(d, "path", { d: "M52 8 A34 34 0 1 0 74 56 A27 27 0 1 1 52 8 Z", fill, stroke: "#b08f3a", "stroke-width": 1, "stroke-linejoin": "round" }),
        el(d, "path", { d: "M44 14 A28 28 0 0 0 22 40", fill: "none", stroke: "#fff", "stroke-width": 2.4, "stroke-linecap": "round", opacity: 0.7 }),
        el(d, "circle", { cx: 26, cy: 52, r: 3.2, fill: "#d3b66b", opacity: 0.5 }),
        el(d, "circle", { cx: 38, cy: 64, r: 2.2, fill: "#d3b66b", opacity: 0.5 }),
        el(d, "circle", { cx: 20, cy: 34, r: 1.8, fill: "#d3b66b", opacity: 0.5 }),
      );
    }),
};

const stars: Actor = {
  id: "twinkling-stars",
  lane: "any",
  motion: "float",
  speed: 0.2,
  size: 120,
  ratio: 1.2,
  x: 0.5,
  y: 0.36,
  amp: 3,
  build: (ctx) =>
    art(ctx, 120, 144, (_defs, g) => {
      const d = ctx.doc;
      const list: Array<[number, number, number, string]> = [[18, 18, 6, "#fff8d6"], [88, 40, 4.4, "#d6e6ff"], [44, 70, 5.4, "#fff"], [100, 104, 6, "#ffe9b8"], [20, 120, 4, "#d6e6ff"], [66, 22, 3.4, "#fff"]];
      list.forEach(([x, y, r, c], i) => {
        g.append(halo(ctx, x, y, r * 2.2, c, 0.25), anim(el(d, "path", { d: sparklePath(x, y, r), fill: c }), "twinkle", { dur: 1.6 + i * 0.35, delay: i * 0.45 }));
      });
      for (const [x, y] of [[8, 70], [58, 130], [110, 70], [74, 92], [30, 94]] as const) g.append(el(d, "circle", { cx: x, cy: y, r: 1.2, fill: "#fff", opacity: 0.85 }));
    }),
};

const shooting: Actor = {
  id: "shooting-star",
  lane: "any",
  motion: "cross",
  speed: 0.6,
  size: 84,
  ratio: 0.5,
  x: 0.6,
  y: 0.08,
  delay: 2,
  build: (ctx) =>
    art(ctx, 84, 42, (defs, g) => {
      const d = ctx.doc;
      const trail = vfill(ctx, defs, [[0, "#ffffff", 0], [1, "#fff6c8", 0.95]], [0, 0, 1, 0]);
      g.append(el(d, "path", { d: "M4 8 L64 20 L64 24 Z", fill: trail }), halo(ctx, 68, 22, 10, "#fff2b8", 0.6), el(d, "path", { d: sparklePath(68, 22, 8), fill: "#fff" }));
    }),
};

const cloud = (id: string, y: number, w: number, delay: number): Actor => ({
  id,
  lane: "any",
  motion: "drift",
  speed: 0.35,
  size: w,
  ratio: 0.5,
  x: 0.5,
  y,
  amp: 20,
  delay,
  build: (ctx) =>
    art(ctx, 100, 50, (defs, g) => {
      const d = ctx.doc;
      const fill = vfill(ctx, defs, [[0, "#5b6aa8"], [1, "#2e3a73"]]);
      g.append(
        el(d, "path", { d: "M18 40 a14 14 0 0 1 4 -27 a18 18 0 0 1 34 -4 a15 15 0 0 1 26 12 a11 11 0 0 1 -2 19 Z", fill, stroke: "#1b2352", "stroke-width": 1, "stroke-linejoin": "round" }),
        el(d, "path", { d: "M24 20 a12 12 0 0 1 12 -8", fill: "none", stroke: "#a6b4f0", "stroke-width": 2.2, "stroke-linecap": "round", opacity: 0.6 }),
        el(d, "path", { d: "M40 14 a14 14 0 0 1 14 -4", fill: "none", stroke: "#a6b4f0", "stroke-width": 2, "stroke-linecap": "round", opacity: 0.45 }),
      );
    }),
});

const fireflies: Actor = {
  id: "fireflies",
  lane: "any",
  motion: "drift",
  speed: 0.3,
  size: 100,
  ratio: 1.2,
  x: 0.5,
  y: 0.82,
  amp: 10,
  build: (ctx) =>
    art(ctx, 100, 120, (defs, g) => {
      const d = ctx.doc;
      const glow = rfill(ctx, defs, [[0, "#f6ff9e", 0.95], [0.4, "#c8f45a", 0.5], [1, "#8fd13a", 0]]);
      [[22, 30], [70, 18], [48, 64], [80, 92], [18, 100]].forEach(([x, y], i) => {
        g.append(anim(el(d, "g", {}, el(d, "circle", { cx: x, cy: y, r: 9, fill: glow }), el(d, "circle", { cx: x, cy: y, r: 2.2, fill: "#fdffd0" })), "twinkle", { dur: 1.8 + i * 0.5, delay: i * 0.7 }));
      });
    }),
};

export const MIDNIGHT: SceneDef = {
  id: "midnight-stars",
  name: "Midnight stars",
  actors: [moon, stars, shooting, cloud("cloud-a", 0.58, 96, 0), fireflies, cloud("cloud-b", 0.68, 74, 4)],
};
