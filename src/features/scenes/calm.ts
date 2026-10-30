import { anim, art, el, halo, vfill } from "./svg.ts";
import type { Actor, SceneDef } from "./types.ts";

const sun: Actor = {
  id: "sun-glow",
  lane: "any",
  motion: "pulse",
  speed: 0.3,
  size: 96,
  x: 0.5,
  y: 0.1,
  build: (ctx) =>
    art(ctx, 96, 96, (defs, g) => {
      const d = ctx.doc;
      const core = vfill(ctx, defs, [[0, "#fff6c2"], [1, "#ffc94a"]], [0.3, 0, 0.7, 1]);
      g.append(halo(ctx, 48, 48, 46, "#ffe9a0", 0.6));
      const rays = el(d, "g", {});
      for (let i = 0; i < 10; i++) rays.append(el(d, "path", { d: "M48 8 v10", stroke: "#ffd56a", "stroke-width": 3, "stroke-linecap": "round", opacity: 0.8, transform: `rotate(${i * 36} 48 48)` }));
      g.append(anim(rays, "spin", { dur: 60 }));
      g.append(el(d, "circle", { cx: 48, cy: 48, r: 18, fill: core, stroke: "#e0a120", "stroke-width": 1 }), el(d, "ellipse", { cx: 42, cy: 41, rx: 6, ry: 3.4, fill: "#fff", opacity: 0.6, transform: "rotate(-30 42 41)" }));
    }),
};

const cloud = (id: string, y: number, w: number, delay: number): Actor => ({
  id,
  lane: "any",
  motion: "drift",
  speed: 0.3,
  size: w,
  ratio: 0.55,
  x: 0.5,
  y,
  amp: 22,
  delay,
  build: (ctx) =>
    art(ctx, 100, 55, (defs, g) => {
      const d = ctx.doc;
      const fill = vfill(ctx, defs, [[0, "#ffffff"], [1, "#d6e6f6"]]);
      g.append(
        el(d, "path", { d: "M18 44 a14 14 0 0 1 4 -27 a18 18 0 0 1 34 -5 a16 16 0 0 1 28 12 a12 12 0 0 1 -2 20 Z", fill, stroke: "#9db6d4", "stroke-width": 1, "stroke-linejoin": "round" }),
        el(d, "path", { d: "M26 22 a12 12 0 0 1 12 -9", fill: "none", stroke: "#fff", "stroke-width": 3, "stroke-linecap": "round" }),
        el(d, "path", { d: "M20 42 H80", stroke: "#b9cfe8", "stroke-width": 3, "stroke-linecap": "round", opacity: 0.55 }),
      );
    }),
});

const birds: Actor = {
  id: "birds",
  lane: "any",
  motion: "drift",
  speed: 0.5,
  size: 80,
  ratio: 0.6,
  x: 0.5,
  y: 0.34,
  amp: 18,
  build: (ctx) =>
    art(ctx, 80, 48, (defs, g) => {
      const d = ctx.doc;
      const belly = vfill(ctx, defs, [[0, "#7d8fb5"], [1, "#3b4c6b"]]);
      const bird = (x: number, y: number, s: number, delay: number) =>
        anim(el(d, "g", { transform: `translate(${x} ${y}) scale(${s})` },
          el(d, "path", { d: "M-14 2 Q-7 -9 0 0 Q7 -9 14 2", fill: "none", stroke: "#3b4c6b", "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" }),
          el(d, "ellipse", { cx: 0, cy: 2.2, rx: 2.8, ry: 3.4, fill: belly, stroke: "#2b3a57", "stroke-width": 0.6 }),
          el(d, "circle", { cx: 0.8, cy: 1.2, r: 0.7, fill: "#fff" }),
        ), "flap", { dur: 0.9, delay });
      g.append(bird(24, 28, 1, 0), bird(56, 14, 0.7, 0.3));
    }),
};

const leaves: Actor = {
  id: "leaves",
  lane: "any",
  motion: "cross",
  speed: 0.5,
  size: 56,
  x: 0.5,
  y: 0.08,
  delay: 1,
  build: (ctx) =>
    art(ctx, 56, 56, (defs, g) => {
      const d = ctx.doc;
      const leaf = vfill(ctx, defs, [[0, "#c8e58a"], [1, "#5f9f3c"]], [0, 0, 1, 1]);
      const warm = vfill(ctx, defs, [[0, "#ffd48a"], [1, "#d9792e"]], [0, 0, 1, 1]);
      const one = (x: number, y: number, rot: number, fill: string, edge: string) =>
        el(d, "g", { transform: `translate(${x} ${y}) rotate(${rot})` },
          el(d, "path", { d: "M0 -14 C12 -8 12 8 0 14 C-12 8 -12 -8 0 -14 Z", fill, stroke: edge, "stroke-width": 1, "stroke-linejoin": "round" }),
          el(d, "path", { d: "M0 -12 V13", stroke: edge, "stroke-width": 0.9, opacity: 0.7 }),
          el(d, "path", { d: "M0 -4 L6 -8 M0 3 L6 -1 M0 -4 L-6 -8 M0 3 L-6 -1", stroke: edge, "stroke-width": 0.7, opacity: 0.5 }),
        );
      g.append(one(18, 20, -30, leaf, "#3d6f23"), one(38, 36, 40, warm, "#9a4d17"));
    }),
};

const lowCloud = cloud("cloud-c", 0.78, 70, 5);

export const CALM: SceneDef = {
  id: "calm",
  name: "Calm",
  actors: [sun, cloud("cloud-a", 0.24, 100, 0), birds, leaves, cloud("cloud-b", 0.56, 78, 3), lowCloud],
};
