import { anim, art, el, halo, rfill, softShadow, sparklePath, sphere, vfill } from "./svg.ts";
import type { Actor, SceneDef } from "./types.ts";

const gasGiant: Actor = {
  id: "gas-giant",
  lane: "any",
  motion: "orbit",
  speed: 0.4,
  size: 120,
  ratio: 0.8,
  x: 0.5,
  y: 0.16,
  amp: 14,
  build: (ctx) =>
    art(ctx, 120, 96, (defs, g) => {
      const d = ctx.doc;
      const clipId = ctx.uid("c");
      const backClip = ctx.uid("c");
      const frontClip = ctx.uid("c");
      defs.append(
        el(d, "clipPath", { id: clipId }, el(d, "circle", { cx: 60, cy: 48, r: 30 })),
        el(d, "clipPath", { id: backClip }, el(d, "rect", { x: 0, y: 0, width: 120, height: 48 })),
        el(d, "clipPath", { id: frontClip }, el(d, "rect", { x: 0, y: 48, width: 120, height: 48 })),
      );
      const ring = vfill(ctx, defs, [[0, "#f6e3c4", 0.2], [0.5, "#f2d2a0"], [1, "#c99a66", 0.4]], [0, 0, 1, 0]);
      const shade = rfill(ctx, defs, [[0, "#fff", 0.28], [0.5, "#fff", 0], [0.85, "#1c1230", 0.35], [1, "#1c1230", 0.7]], [0.34, 0.3]);
      const base = vfill(ctx, defs, [[0, "#f4c089"], [1, "#c9714a"]]);
      const ringEll = (cls: string) => el(d, "ellipse", { cx: 60, cy: 48, rx: 56, ry: 13, fill: "none", stroke: cls, "stroke-width": 7 });
      g.append(el(d, "g", { transform: "rotate(-16 60 48)" }, el(d, "g", { "clip-path": `url(#${backClip})` }, ringEll(ring))));
      g.append(
        el(d, "circle", { cx: 60, cy: 48, r: 30, fill: base, stroke: "#6b3a2a", "stroke-width": 1, "stroke-opacity": 0.5 }),
        el(d, "g", { "clip-path": `url(#${clipId})` },
          el(d, "rect", { x: 28, y: 28, width: 64, height: 7, fill: "#e8956b", opacity: 0.75 }),
          el(d, "rect", { x: 28, y: 40, width: 64, height: 9, fill: "#fbe0b5", opacity: 0.8 }),
          el(d, "rect", { x: 28, y: 53, width: 64, height: 6, fill: "#b25a43", opacity: 0.7 }),
          el(d, "rect", { x: 28, y: 63, width: 64, height: 8, fill: "#f2c58f", opacity: 0.6 }),
          el(d, "ellipse", { cx: 72, cy: 51, rx: 7, ry: 3.6, fill: "#c24a35", opacity: 0.8 }),
        ),
        el(d, "circle", { cx: 60, cy: 48, r: 30, fill: shade }),
      );
      g.append(el(d, "g", { transform: "rotate(-16 60 48)" }, el(d, "g", { "clip-path": `url(#${frontClip})` }, ringEll("#3a2330"), ringEll(ring))));
    }),
};

const rocky: Actor = {
  id: "rocky-planet",
  lane: "any",
  motion: "orbit",
  speed: 0.5,
  size: 70,
  x: 0.5,
  y: 0.18,
  amp: 10,
  build: (ctx) =>
    art(ctx, 70, 70, (defs, g) => {
      const d = ctx.doc;
      const clipId = ctx.uid("c");
      defs.append(el(d, "clipPath", { id: clipId }, el(d, "circle", { cx: 35, cy: 35, r: 28 })));
      g.append(sphere(ctx, defs, 35, 35, 28, "#d9c1a5", "#a07b5f", "#4d3a2f"));
      const crater = (x: number, y: number, r: number) =>
        el(d, "g", {}, el(d, "ellipse", { cx: x, cy: y, rx: r, ry: r * 0.8, fill: "#5d4636", opacity: 0.55 }), el(d, "path", { d: `M${x - r} ${y} a${r} ${r * 0.8} 0 0 0 ${r * 2} 0`, fill: "none", stroke: "#f3dcc2", "stroke-width": 1.1, opacity: 0.6 }));
      g.append(el(d, "g", { "clip-path": `url(#${clipId})` }, crater(26, 28, 6), crater(44, 40, 7.5), crater(30, 48, 4), crater(47, 22, 3.4)));
      g.append(el(d, "circle", { cx: 35, cy: 35, r: 28, fill: rfill(ctx, defs, [[0.6, "#000", 0], [1, "#000", 0.45]], [0.34, 0.3]) }));
    }),
};

const icePlanet: Actor = {
  id: "ice-planet",
  lane: "any",
  motion: "orbit",
  speed: 0.45,
  size: 60,
  x: 0.5,
  y: 0.5,
  amp: 12,
  delay: 2,
  build: (ctx) =>
    art(ctx, 60, 60, (defs, g) => {
      const d = ctx.doc;
      const clipId = ctx.uid("c");
      defs.append(el(d, "clipPath", { id: clipId }, el(d, "circle", { cx: 30, cy: 30, r: 24 })));
      g.append(sphere(ctx, defs, 30, 30, 24, "#f1fcff", "#8fd3ec", "#3b6ea5"));
      g.append(
        el(d, "g", { "clip-path": `url(#${clipId})` },
          el(d, "path", { d: "M4 26 q12 -8 26 0 t26 -2", fill: "none", stroke: "#fff", "stroke-width": 3, opacity: 0.55, "stroke-linecap": "round" }),
          el(d, "path", { d: "M4 38 q14 6 26 0 t26 3", fill: "none", stroke: "#5aa6d6", "stroke-width": 2.4, opacity: 0.5, "stroke-linecap": "round" }),
        ),
        el(d, "circle", { cx: 30, cy: 30, r: 24, fill: rfill(ctx, defs, [[0.6, "#0b1f4a", 0], [1, "#0b1f4a", 0.4]], [0.34, 0.3]) }),
      );
    }),
};

const rocket: Actor = {
  id: "rocket",
  lane: "any",
  motion: "float",
  speed: 0.8,
  size: 52,
  ratio: 1.8,
  x: 0.5,
  y: 0.34,
  amp: 14,
  build: (ctx) =>
    art(ctx, 52, 94, (defs, g) => {
      const d = ctx.doc;
      const body = vfill(ctx, defs, [[0, "#ffffff"], [0.55, "#e8edf8"], [1, "#a9b4d0"]], [0, 0, 1, 0]);
      const red = vfill(ctx, defs, [[0, "#ff8a7a"], [1, "#c9342f"]], [0, 0, 1, 0]);
      const glass = rfill(ctx, defs, [[0, "#bff4ff"], [0.6, "#3a9ad8"], [1, "#1a4a8a"]]);
      const flame = vfill(ctx, defs, [[0, "#fff3b0"], [0.5, "#ffb03a"], [1, "#ff5a1f", 0]]);
      g.append(
        anim(el(d, "path", { d: "M18 66 Q26 94 34 66 Z", fill: flame }), "glow", { dur: 0.35 }),
        el(d, "path", { d: "M26 4 C40 18 42 40 40 68 H12 C10 40 12 18 26 4 Z", fill: body, stroke: "#5c6788", "stroke-width": 1, "stroke-linejoin": "round" }),
        el(d, "path", { d: "M26 4 C33 11 37 19 38 27 H14 C15 19 19 11 26 4 Z", fill: red, stroke: "#8c1f1c", "stroke-width": 0.9, "stroke-linejoin": "round" }),
        el(d, "path", { d: "M12 52 L2 70 L12 66 Z M40 52 L50 70 L40 66 Z", fill: red, stroke: "#8c1f1c", "stroke-width": 0.9, "stroke-linejoin": "round" }),
        el(d, "rect", { x: 12, y: 62, width: 28, height: 8, rx: 2, fill: "#7782a3", stroke: "#4a5472", "stroke-width": 0.8 }),
        el(d, "circle", { cx: 26, cy: 40, r: 8, fill: "#6a7597", stroke: "#4a5472", "stroke-width": 1 }),
        el(d, "circle", { cx: 26, cy: 40, r: 6, fill: glass }),
        el(d, "ellipse", { cx: 23.5, cy: 37.5, rx: 2.4, ry: 1.4, fill: "#fff", opacity: 0.8, transform: "rotate(-30 23.5 37.5)" }),
        el(d, "path", { d: "M18 12 C14 26 14 44 16 60", fill: "none", stroke: "#fff", "stroke-width": 2, "stroke-linecap": "round", opacity: 0.7 }),
      );
    }),
};

const satellite: Actor = {
  id: "satellite",
  lane: "any",
  motion: "drift",
  speed: 0.5,
  size: 88,
  ratio: 0.7,
  x: 0.5,
  y: 0.62,
  amp: 10,
  build: (ctx) =>
    art(ctx, 88, 62, (defs, g) => {
      const d = ctx.doc;
      const panel = vfill(ctx, defs, [[0, "#5a8cf0"], [1, "#1f3a8a"]], [0, 0, 1, 1]);
      const body = vfill(ctx, defs, [[0, "#f4f6fa"], [1, "#9aa5be"]], [0, 0, 1, 0]);
      const gold = vfill(ctx, defs, [[0, "#ffe9a6"], [1, "#c4902a"]]);
      const solar = (x: number) => {
        const p = el(d, "g", {}, el(d, "rect", { x, y: 18, width: 26, height: 26, rx: 1.5, fill: panel, stroke: "#142a6a", "stroke-width": 1 }));
        for (let i = 1; i < 4; i++) p.append(el(d, "path", { d: `M${x + i * 6.5} 18 v26`, stroke: "#9ec0ff", "stroke-width": 0.6, opacity: 0.7 }));
        p.append(el(d, "path", { d: `M${x} 31 h26`, stroke: "#9ec0ff", "stroke-width": 0.6, opacity: 0.7 }), el(d, "path", { d: `M${x + 2} 20 h8`, stroke: "#fff", "stroke-width": 1.2, opacity: 0.5, "stroke-linecap": "round" }));
        return p;
      };
      g.append(
        el(d, "path", { d: "M30 31 h6 M52 31 h6", stroke: "#6b7694", "stroke-width": 2 }),
        solar(4),
        solar(58),
        el(d, "rect", { x: 34, y: 20, width: 20, height: 22, rx: 3, fill: body, stroke: "#4c5672", "stroke-width": 1 }),
        el(d, "rect", { x: 34, y: 26, width: 20, height: 5, fill: gold, opacity: 0.9 }),
        el(d, "path", { d: "M44 20 v-8 M36 8 q8 -6 16 0 q-8 4 -16 0 z", fill: "#cfd6e4", stroke: "#4c5672", "stroke-width": 1, "stroke-linejoin": "round" }),
        el(d, "circle", { cx: 44, cy: 36, r: 2.2, fill: "#2b3350" }),
      );
      g.append(halo(ctx, 49, 23, 6, "#ff4a4a", 0.5));
      g.append(anim(el(d, "circle", { cx: 49, cy: 23, r: 2, fill: "#ff6b6b" }), "blink", { dur: 2 }));
    }),
};

const astronaut: Actor = {
  id: "astronaut",
  lane: "any",
  motion: "float",
  speed: 0.5,
  size: 74,
  ratio: 1.15,
  x: 0.5,
  y: 0.78,
  amp: 12,
  build: (ctx) =>
    art(ctx, 74, 86, (defs, g) => {
      const d = ctx.doc;
      const suit = vfill(ctx, defs, [[0, "#ffffff"], [1, "#c5cde0"]], [0, 0, 1, 1]);
      const visor = rfill(ctx, defs, [[0, "#6fd0ff"], [0.5, "#26529a"], [1, "#101c4a"]], [0.3, 0.25]);
      g.append(softShadow(ctx, 37, 82, 20, 2.6, "#050a24", 0.3));
      g.append(
        el(d, "rect", { x: 14, y: 34, width: 14, height: 30, rx: 6, fill: "#aab3cb", stroke: "#4c5672", "stroke-width": 1 }),
        el(d, "path", { d: "M24 40 L8 56 q-3 4 1 6 q4 2 7 -2 L30 50 Z", fill: suit, stroke: "#5c6788", "stroke-width": 1, "stroke-linejoin": "round" }),
        el(d, "path", { d: "M50 40 L64 48 q4 3 1 7 q-3 3 -7 0 L46 50 Z", fill: suit, stroke: "#5c6788", "stroke-width": 1, "stroke-linejoin": "round" }),
        el(d, "rect", { x: 22, y: 36, width: 30, height: 30, rx: 10, fill: suit, stroke: "#5c6788", "stroke-width": 1 }),
        el(d, "rect", { x: 29, y: 46, width: 16, height: 8, rx: 2, fill: "#34457a" }),
        el(d, "circle", { cx: 33, cy: 50, r: 1.6, fill: "#ff6b6b" }),
        el(d, "circle", { cx: 40, cy: 50, r: 1.6, fill: "#6bff9b" }),
        el(d, "path", { d: "M25 64 l-3 14 q0 4 5 4 q5 0 5 -4 l1 -14 Z M45 64 l3 14 q0 4 -5 4 q-5 0 -5 -4 l-1 -14 Z", fill: suit, stroke: "#5c6788", "stroke-width": 1, "stroke-linejoin": "round" }),
        el(d, "circle", { cx: 37, cy: 24, r: 18, fill: suit, stroke: "#5c6788", "stroke-width": 1.2 }),
        el(d, "ellipse", { cx: 37, cy: 25, rx: 13, ry: 11, fill: visor, stroke: "#101c4a", "stroke-width": 1.2 }),
        el(d, "ellipse", { cx: 31, cy: 20, rx: 5, ry: 2.6, fill: "#fff", opacity: 0.7, transform: "rotate(-24 31 20)" }),
        el(d, "path", { d: "M42 31 q4 -2 6 -6", fill: "none", stroke: "#8fe0ff", "stroke-width": 1, opacity: 0.6, "stroke-linecap": "round" }),
      );
    }),
};

const comet: Actor = {
  id: "comet",
  lane: "any",
  motion: "cross",
  speed: 0.7,
  size: 90,
  ratio: 0.6,
  x: 0.7,
  y: 0.05,
  delay: 3,
  build: (ctx) =>
    art(ctx, 90, 54, (defs, g) => {
      const d = ctx.doc;
      const tail = vfill(ctx, defs, [[0, "#ffffff", 0.9], [0.4, "#9ad8ff", 0.5], [1, "#6a7bff", 0]], [1, 1, 0, 0]);
      g.append(
        el(d, "path", { d: "M82 44 L4 4 L62 4 Z", fill: tail, opacity: 0.85, transform: "rotate(6 60 24)" }),
        halo(ctx, 80, 44, 12, "#bfe6ff", 0.6),
        el(d, "circle", { cx: 80, cy: 44, r: 6, fill: "#fff" }),
        el(d, "circle", { cx: 78.5, cy: 42.5, r: 2, fill: "#e4f6ff" }),
      );
    }),
};

const stars: Actor = {
  id: "stars",
  lane: "any",
  motion: "float",
  speed: 0.2,
  size: 120,
  ratio: 1.1,
  x: 0.5,
  y: 0.42,
  amp: 3,
  back: true,
  build: (ctx) =>
    art(ctx, 120, 132, (_defs, g) => {
      const d = ctx.doc;
      const pts: Array<[number, number, number, string]> = [[14, 16, 5, "#fff"], [96, 30, 3.6, "#cfe8ff"], [52, 56, 4.4, "#ffe9c4"], [22, 92, 3.2, "#fff"], [100, 100, 5, "#e8d6ff"], [64, 122, 3.4, "#fff"]];
      pts.forEach(([x, y, r, c], i) => {
        g.append(anim(el(d, "path", { d: sparklePath(x, y, r), fill: c }), "twinkle", { dur: 1.8 + i * 0.4, delay: i * 0.5 }));
      });
      for (const [x, y] of [[36, 30], [80, 70], [10, 60], [110, 8], [72, 14], [40, 108], [90, 126]] as const) g.append(el(d, "circle", { cx: x, cy: y, r: 1.1, fill: "#fff", opacity: 0.8 }));
    }),
};

const nebula: Actor = {
  id: "nebula",
  lane: "any",
  motion: "pulse",
  speed: 0.2,
  size: 200,
  ratio: 1.6,
  x: 0.5,
  y: 0.7,
  back: true,
  build: (ctx) =>
    art(ctx, 200, 320, (defs, g) => {
      const d = ctx.doc;
      const blob = (cx: number, cy: number, r: number, c: string, op: number) =>
        el(d, "circle", { cx, cy, r, fill: rfill(ctx, defs, [[0, c, op], [1, c, 0]], [0.5, 0.5]) });
      g.append(blob(90, 90, 90, "#8a5cff", 0.4), blob(120, 170, 100, "#ff5fb4", 0.28), blob(80, 240, 90, "#3fd3ff", 0.28));
    }),
};

export const SPACE: SceneDef = {
  id: "space",
  name: "Space",
  actors: [nebula, stars, gasGiant, rocket, rocky, satellite, icePlanet, astronaut, comet],
};
