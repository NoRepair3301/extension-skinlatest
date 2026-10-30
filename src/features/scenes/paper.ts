import { anim, art, el, halo, rfill, softShadow, sparklePath, vfill } from "./svg.ts";
import type { Actor, SceneDef } from "./types.ts";

const INK = "#2b3a67";
const INK_D = "#18224a";

/** Pen draws a wavy line, then an eraser slides along and removes it. The clip rectangle grows, then slides away. */
const penWrite: Actor = {
  id: "pen-write",
  lane: "any",
  motion: "write",
  speed: 1,
  size: 150,
  ratio: 0.55,
  x: 0.5,
  y: 0.1,
  amp: 110,
  build: (ctx) =>
    art(ctx, 150, 82, (defs, g) => {
      const d = ctx.doc;
      const clipId = ctx.uid("clip");
      const clip = el(d, "clipPath", { id: clipId }, anim(el(d, "rect", { x: 14, y: 0, width: 110, height: 82 }), "write-clip"));
      defs.append(clip);
      const body = vfill(ctx, defs, [[0, "#6d86ff"], [0.5, "#3f57d8"], [1, "#27379b"]], [0, 0, 1, 0]);
      const gold = vfill(ctx, defs, [[0, "#fff3b0"], [0.5, "#e3b441"], [1, "#9a6d12"]], [0, 0, 1, 0]);
      const rub = vfill(ctx, defs, [[0, "#ffc1cf"], [1, "#f08aa2"]]);
      const sleeve = vfill(ctx, defs, [[0, "#cfd6e4"], [1, "#8a94ab"]]);
      g.append(softShadow(ctx, 75, 74, 62, 4, "#1b2440", 0.18));
      g.append(
        el(d, "g", { "clip-path": `url(#${clipId})` }, el(d, "path", { d: "M14 56 q14 -26 28 0 t28 0 t28 0 t24 -2", fill: "none", stroke: INK_D, "stroke-width": 5, "stroke-linecap": "round", opacity: 0.35 }), el(d, "path", { d: "M14 55 q14 -26 28 0 t28 0 t28 0 t24 -2", fill: "none", stroke: INK, "stroke-width": 3.2, "stroke-linecap": "round" })),
      );
      // pen: body, grip, gold band, tip, clip and highlight (tip at the left end of the line)
      g.append(
        anim(
          el(d, "g", {},
            el(d, "path", { d: "M14 55 L30 49 L30 61 Z", fill: "#f1e6d2", stroke: "#8a7a5a", "stroke-width": 0.8, "stroke-linejoin": "round" }),
            el(d, "path", { d: "M14 55 L20 52.8 L20 57.2 Z", fill: INK_D }),
            el(d, "rect", { x: 30, y: 48.5, width: 10, height: 13, rx: 2, fill: gold, stroke: "#7a5410", "stroke-width": 0.7 }),
            el(d, "rect", { x: 40, y: 47.5, width: 52, height: 15, rx: 5, fill: body, stroke: "#1d2a7d", "stroke-width": 1 }),
            el(d, "rect", { x: 44, y: 49.3, width: 40, height: 3.2, rx: 1.6, fill: "#fff", opacity: 0.45 }),
            el(d, "rect", { x: 92, y: 49, width: 4, height: 12, rx: 1.5, fill: gold }),
            el(d, "path", { d: "M96 52 h26 q4 0 4 3 q0 3 -4 3 h-26 z", fill: "#3149c9", stroke: "#1d2a7d", "stroke-width": 0.8 }),
            el(d, "path", { d: "M60 47.5 q2 -9 14 -8 v3", fill: "none", stroke: "#cfd6e4", "stroke-width": 2.2, "stroke-linecap": "round" }),
          ),
          "write-pen",
        ),
      );
      g.append(
        anim(
          el(d, "g", {},
            el(d, "rect", { x: -22, y: 46, width: 20, height: 17, rx: 3, fill: sleeve, stroke: "#5c667d", "stroke-width": 0.8 }),
            el(d, "rect", { x: -4, y: 46, width: 14, height: 17, rx: 3, fill: rub, stroke: "#c25a76", "stroke-width": 0.8 }),
            el(d, "rect", { x: -20, y: 48, width: 14, height: 3, rx: 1.5, fill: "#fff", opacity: 0.5 }),
          ),
          "write-eraser",
        ),
      );
      // a fixed small sparkle so the tile never looks empty before the pen starts
      g.append(el(d, "path", { d: sparklePath(136, 14, 5), fill: "#fff3b0", opacity: 0.9 }));
    }),
};

const pencil: Actor = {
  id: "pencil",
  lane: "any",
  motion: "float",
  speed: 0.9,
  size: 92,
  ratio: 0.5,
  x: 0.5,
  y: 0.33,
  amp: 10,
  build: (ctx) =>
    art(ctx, 120, 60, (defs, g) => {
      const d = ctx.doc;
      const yellow = vfill(ctx, defs, [[0, "#ffe27a"], [0.45, "#f6c53a"], [1, "#d29a14"]]);
      const wood = vfill(ctx, defs, [[0, "#f6dcb2"], [1, "#d8a96b"]]);
      const metal = vfill(ctx, defs, [[0, "#f4f6fa"], [0.5, "#aab3c4"], [1, "#6e7790"]]);
      const pink = vfill(ctx, defs, [[0, "#ffb6c8"], [1, "#ec7a98"]]);
      g.append(softShadow(ctx, 62, 52, 48, 3.5, "#2a2415", 0.2));
      g.append(
        el(d, "g", { transform: "rotate(-14 60 30)" },
          el(d, "path", { d: "M8 30 L28 21 L28 39 Z", fill: wood, stroke: "#9b6d34", "stroke-width": 0.9, "stroke-linejoin": "round" }),
          el(d, "path", { d: "M8 30 L15 26.8 L15 33.2 Z", fill: "#2e3441" }),
          el(d, "rect", { x: 28, y: 21, width: 62, height: 18, fill: yellow, stroke: "#9a6b0a", "stroke-width": 1 }),
          el(d, "rect", { x: 28, y: 21, width: 62, height: 4.5, fill: "#fff7c8", opacity: 0.55 }),
          el(d, "rect", { x: 28, y: 33.8, width: 62, height: 5.2, fill: "#b27d0c", opacity: 0.35 }),
          el(d, "rect", { x: 90, y: 20, width: 11, height: 20, fill: metal, stroke: "#4c556e", "stroke-width": 0.9 }),
          el(d, "path", { d: "M92 20 v20 M96 20 v20", stroke: "#4c556e", "stroke-width": 0.7, opacity: 0.6 }),
          el(d, "rect", { x: 101, y: 21, width: 11, height: 18, rx: 4, fill: pink, stroke: "#b34865", "stroke-width": 0.9 }),
          el(d, "rect", { x: 103, y: 23, width: 6, height: 3, rx: 1.5, fill: "#fff", opacity: 0.5 }),
        ),
      );
    }),
};

const notepad: Actor = {
  id: "notepad",
  lane: "any",
  motion: "float",
  speed: 0.7,
  size: 84,
  ratio: 1.1,
  x: 0.5,
  y: 0.33,
  amp: 8,
  build: (ctx) =>
    art(ctx, 80, 88, (defs, g) => {
      const d = ctx.doc;
      const sheet = vfill(ctx, defs, [[0, "#ffffff"], [1, "#e9edf6"]]);
      const cover = vfill(ctx, defs, [[0, "#6a8cf2"], [1, "#3f5fc4"]]);
      g.append(softShadow(ctx, 42, 82, 30, 3.5, "#1d2a55", 0.2));
      g.append(
        el(d, "rect", { x: 10, y: 8, width: 60, height: 72, rx: 5, fill: cover, stroke: "#2c4396", "stroke-width": 1 }),
        el(d, "rect", { x: 14, y: 14, width: 54, height: 66, rx: 3, fill: sheet, stroke: "#b8c2db", "stroke-width": 0.8 }),
      );
      for (let i = 0; i < 6; i++) g.append(el(d, "path", { d: `M20 ${30 + i * 8.5} h42`, stroke: "#9fb2e6", "stroke-width": 1, "stroke-linecap": "round" }));
      g.append(el(d, "path", { d: "M26 22 h26", stroke: "#4b63b5", "stroke-width": 2.2, "stroke-linecap": "round" }));
      // the turning page: a flap hinged on the left edge of the sheet
      g.append(
        anim(el(d, "path", { d: "M14 14 H68 V80 H14 Z", fill: "#f6f8ff", stroke: "#b8c2db", "stroke-width": 0.8 }), "page", { dur: 7 }),
      );
      for (let i = 0; i < 6; i++) g.append(el(d, "rect", { x: 5 + (i % 2) * 0.5, y: 14 + i * 11, width: 12, height: 5, rx: 2.5, fill: "#cfd6e4", stroke: "#5c667d", "stroke-width": 0.8 }));
    }),
};

const stickyNotes: Actor = {
  id: "sticky-notes",
  lane: "any",
  motion: "sway",
  speed: 0.6,
  size: 82,
  x: 0.5,
  y: 0.58,
  build: (ctx) =>
    art(ctx, 80, 80, (defs, g) => {
      const d = ctx.doc;
      const yellow = vfill(ctx, defs, [[0, "#fff39a"], [1, "#f8d84a"]], [0, 0, 1, 1]);
      const pink = vfill(ctx, defs, [[0, "#ffc6dc"], [1, "#f58fb6"]], [0, 0, 1, 1]);
      g.append(softShadow(ctx, 42, 72, 28, 3, "#3a2d12", 0.2));
      g.append(
        el(d, "g", { transform: "rotate(8 46 44)" }, el(d, "path", { d: "M26 22 H64 V58 L58 66 H26 Z", fill: pink, stroke: "#c8527f", "stroke-width": 0.9, "stroke-linejoin": "round" }), el(d, "path", { d: "M58 66 V58 H64 Z", fill: "#e56a99" })),
        el(d, "g", { transform: "rotate(-7 36 40)" },
          el(d, "path", { d: "M12 14 H52 V52 L45 60 H12 Z", fill: yellow, stroke: "#c59a12", "stroke-width": 0.9, "stroke-linejoin": "round" }),
          el(d, "path", { d: "M45 60 V52 H52 Z", fill: "#d6a921" }),
          el(d, "rect", { x: 12, y: 14, width: 40, height: 6, fill: "#fff", opacity: 0.35 }),
          el(d, "path", { d: "M18 28 h26 M18 35 h20 M18 42 h24", stroke: "#a77d0c", "stroke-width": 1.6, "stroke-linecap": "round", opacity: 0.7 }),
        ),
      );
    }),
};

const paperPlane: Actor = {
  id: "paper-plane",
  lane: "any",
  motion: "cross",
  speed: 0.8,
  size: 64,
  ratio: 0.8,
  x: 0.25,
  y: 0.5,
  delay: 1,
  build: (ctx) =>
    art(ctx, 80, 64, (defs, g) => {
      const d = ctx.doc;
      const top = vfill(ctx, defs, [[0, "#ffffff"], [1, "#dde4f6"]], [0, 0, 1, 1]);
      const under = vfill(ctx, defs, [[0, "#c3cdea"], [1, "#8d9acc"]], [0, 0, 1, 1]);
      g.append(
        el(d, "path", { d: "M72 6 L6 30 L28 36 Z", fill: top, stroke: "#7482b8", "stroke-width": 1, "stroke-linejoin": "round" }),
        el(d, "path", { d: "M28 36 L72 6 L36 54 Z", fill: under, stroke: "#6d7bb2", "stroke-width": 1, "stroke-linejoin": "round" }),
        el(d, "path", { d: "M28 36 L36 54 L40 42 Z", fill: "#a7b3dc", stroke: "#6d7bb2", "stroke-width": 0.8, "stroke-linejoin": "round" }),
        el(d, "path", { d: "M10 31 L66 9", stroke: "#fff", "stroke-width": 1.2, opacity: 0.8, "stroke-linecap": "round" }),
        el(d, "path", { d: "M2 40 q6 -3 10 0 M-6 46 q8 -4 14 0", stroke: "#9aa7d4", "stroke-width": 1.2, fill: "none", "stroke-linecap": "round", opacity: 0.6, "stroke-dasharray": "3 3" }),
      );
    }),
};

const inkDrop: Actor = {
  id: "ink-drop",
  lane: "any",
  motion: "pulse",
  speed: 0.7,
  size: 40,
  ratio: 1.3,
  x: 0.5,
  y: 0.84,
  build: (ctx) =>
    art(ctx, 40, 52, (defs, g) => {
      const d = ctx.doc;
      const fill = rfill(ctx, defs, [[0, "#7f93f2"], [0.5, "#34459f"], [1, "#171f57"]], [0.35, 0.55]);
      g.append(softShadow(ctx, 20, 49, 11, 2.5, "#10143a", 0.25));
      g.append(
        el(d, "path", { d: "M20 3 C20 3 5 24 5 33 a15 15 0 0 0 30 0 C35 24 20 3 20 3 Z", fill, stroke: "#10143a", "stroke-width": 1, "stroke-linejoin": "round" }),
        el(d, "ellipse", { cx: 13.5, cy: 31, rx: 3, ry: 6, fill: "#fff", opacity: 0.55, transform: "rotate(14 13.5 31)" }),
        el(d, "circle", { cx: 26, cy: 41, r: 1.8, fill: "#fff", opacity: 0.35 }),
      );
    }),
};

const coffee: Actor = {
  id: "coffee-cup",
  lane: "any",
  motion: "float",
  speed: 0.5,
  size: 76,
  ratio: 0.95,
  x: 0.5,
  y: 0.13,
  amp: 4,
  build: (ctx) =>
    art(ctx, 80, 76, (defs, g) => {
      const d = ctx.doc;
      const cup = vfill(ctx, defs, [[0, "#ffffff"], [0.6, "#f1ece4"], [1, "#d9cfc0"]], [0, 0, 1, 0]);
      const coffeeFill = vfill(ctx, defs, [[0, "#7a4a2a"], [1, "#4a2a15"]]);
      const saucer = vfill(ctx, defs, [[0, "#f7f3ec"], [1, "#cfc5b4"]]);
      g.append(softShadow(ctx, 38, 70, 30, 4, "#2b1a0a", 0.22));
      g.append(
        el(d, "ellipse", { cx: 38, cy: 64, rx: 30, ry: 7, fill: saucer, stroke: "#a99c86", "stroke-width": 0.9 }),
        el(d, "path", { d: "M58 36 q14 0 14 10 t-14 10", fill: "none", stroke: "#a99c86", "stroke-width": 5, "stroke-linecap": "round" }),
        el(d, "path", { d: "M58 36 q14 0 14 10 t-14 10", fill: "none", stroke: "#f4efe6", "stroke-width": 2.8, "stroke-linecap": "round" }),
        el(d, "path", { d: "M12 32 H62 V46 a24 22 0 0 1 -24 20 h-2 a24 22 0 0 1 -24 -20 Z", fill: cup, stroke: "#a99c86", "stroke-width": 1, "stroke-linejoin": "round" }),
        el(d, "ellipse", { cx: 37, cy: 32, rx: 25, ry: 6, fill: "#efe7da", stroke: "#a99c86", "stroke-width": 0.9 }),
        el(d, "ellipse", { cx: 37, cy: 33, rx: 21, ry: 4.4, fill: coffeeFill }),
        el(d, "ellipse", { cx: 30, cy: 32, rx: 7, ry: 1.4, fill: "#b27a4d", opacity: 0.7 }),
        el(d, "path", { d: "M18 40 q1 12 8 20", stroke: "#fff", "stroke-width": 2.4, "stroke-linecap": "round", fill: "none", opacity: 0.8 }),
      );
      [26, 38, 50].forEach((x, i) => g.append(anim(el(d, "path", { d: `M${x} 24 q-4 -5 0 -9 t0 -9`, fill: "none", stroke: "#c9c2b6", "stroke-width": 2.4, "stroke-linecap": "round" }), "steam", { dur: 3.2 + i * 0.5, delay: i * 0.9 })));
    }),
};

const paperclip: Actor = {
  id: "paperclip",
  lane: "any",
  motion: "sway",
  speed: 0.6,
  size: 36,
  ratio: 2,
  x: 0.5,
  y: 0.68,
  build: (ctx) =>
    art(ctx, 36, 72, (defs, g) => {
      const d = ctx.doc;
      const metal = vfill(ctx, defs, [[0, "#f4f6fa"], [0.5, "#aeb7c8"], [1, "#79839c"]], [0, 0, 1, 0]);
      const path = "M12 52 V16 a8 8 0 0 1 16 0 V54 a11 11 0 0 1 -22 0 V22";
      g.append(
        el(d, "path", { d: path, fill: "none", stroke: "#4d566d", "stroke-width": 5.4, "stroke-linecap": "round", "stroke-linejoin": "round" }),
        el(d, "path", { d: path, fill: "none", stroke: metal, "stroke-width": 3.4, "stroke-linecap": "round", "stroke-linejoin": "round" }),
        el(d, "path", { d: "M20 12 V50", stroke: "#fff", "stroke-width": 1, opacity: 0.7, "stroke-linecap": "round" }),
      );
    }),
};

const ruler: Actor = {
  id: "ruler",
  lane: "any",
  motion: "drift",
  speed: 0.6,
  size: 100,
  ratio: 0.28,
  x: 0.5,
  y: 0.93,
  amp: 8,
  build: (ctx) =>
    art(ctx, 120, 34, (defs, g) => {
      const d = ctx.doc;
      const wood = vfill(ctx, defs, [[0, "#f6e0ad"], [1, "#d9b36a"]]);
      g.append(softShadow(ctx, 60, 30, 52, 3, "#2d2108", 0.2));
      g.append(
        el(d, "rect", { x: 4, y: 4, width: 112, height: 24, rx: 3, fill: wood, stroke: "#9a7536", "stroke-width": 1 }),
        el(d, "rect", { x: 4, y: 4, width: 112, height: 6, rx: 3, fill: "#fff", opacity: 0.35 }),
      );
      for (let i = 0; i <= 22; i++) g.append(el(d, "path", { d: `M${10 + i * 4.6} 28 v${i % 5 === 0 ? -10 : -5}`, stroke: "#6b4f1a", "stroke-width": 1, "stroke-linecap": "round" }));
      g.append(halo(ctx, 108, 10, 5, "#fff", 0.2));
    }),
};

export const PAPER: SceneDef = {
  id: "paper",
  name: "Paper",
  actors: [penWrite, coffee, notepad, pencil, paperPlane, stickyNotes, paperclip, inkDrop, ruler],
};
