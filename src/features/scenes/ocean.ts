import { anim, art, el, rfill, softShadow, vfill } from "./svg.ts";
import type { Actor, SceneDef } from "./types.ts";

const fish = (id: string, y: number, body: [string, string, string], fin: string, delay: number, motion: Actor["motion"] = "drift"): Actor => ({
  id,
  lane: "any",
  motion,
  speed: 0.7,
  size: 66,
  ratio: 0.6,
  x: 0.5,
  y,
  amp: 18,
  delay,
  build: (ctx) =>
    art(ctx, 66, 40, (defs, g) => {
      const d = ctx.doc;
      const fill = vfill(ctx, defs, [[0, body[0]], [0.55, body[1]], [1, body[2]]]);
      const clipId = ctx.uid("c");
      const shape = "M8 20 C16 6 38 4 50 20 C38 36 16 34 8 20 Z";
      defs.append(el(d, "clipPath", { id: clipId }, el(d, "path", { d: shape })));
      g.append(
        anim(el(d, "path", { d: "M46 20 L64 8 Q60 20 64 32 Z", fill: fin, stroke: body[2], "stroke-width": 0.8, "stroke-linejoin": "round" }), "flap", { dur: 0.7 }),
        el(d, "path", { d: "M22 9 Q30 0 38 10 Z", fill: fin, stroke: body[2], "stroke-width": 0.8, "stroke-linejoin": "round" }),
        el(d, "path", { d: shape, fill, stroke: body[2], "stroke-width": 1, "stroke-linejoin": "round" }),
        el(d, "g", { "clip-path": `url(#${clipId})` }, el(d, "path", { d: "M14 8 v24 M22 6 v28 M30 8 v24", stroke: "#fff", "stroke-width": 2.6, opacity: 0.25 }), el(d, "ellipse", { cx: 28, cy: 12, rx: 18, ry: 5, fill: "#fff", opacity: 0.3 })),
        el(d, "path", { d: "M17 24 q3 3 7 0", fill: "none", stroke: body[2], "stroke-width": 1.1, "stroke-linecap": "round" }),
        el(d, "circle", { cx: 16, cy: 17, r: 3.4, fill: "#fff", stroke: body[2], "stroke-width": 0.8 }),
        el(d, "circle", { cx: 15.2, cy: 17, r: 1.9, fill: "#0e2a47" }),
        el(d, "circle", { cx: 14.6, cy: 16.2, r: 0.7, fill: "#fff" }),
      );
    }),
});

const jellyfish: Actor = {
  id: "jellyfish",
  lane: "any",
  motion: "pulse",
  speed: 0.6,
  size: 64,
  ratio: 1.4,
  x: 0.5,
  y: 0.3,
  build: (ctx) =>
    art(ctx, 64, 90, (defs, g) => {
      const d = ctx.doc;
      const bell = rfill(ctx, defs, [[0, "#ffe0f6", 0.95], [0.6, "#e08bff", 0.8], [1, "#8c5bd6", 0.75]], [0.4, 0.3]);
      g.append(
        ...[18, 28, 38, 48].map((x, i) =>
          anim(el(d, "path", { d: `M${x} 38 q-5 12 0 22 t0 22`, fill: "none", stroke: "#e9a9ff", "stroke-width": 2.2, "stroke-linecap": "round", opacity: 0.75 }), "bob", { dur: 1.6 + i * 0.3, delay: i * 0.2 }),
        ),
        el(d, "path", { d: "M6 40 C6 8 58 8 58 40 Q50 34 44 40 Q38 34 32 40 Q26 34 20 40 Q14 34 6 40 Z", fill: bell, stroke: "#6b3fb0", "stroke-width": 1, "stroke-linejoin": "round" }),
        el(d, "path", { d: "M14 26 C16 16 26 12 34 13", fill: "none", stroke: "#fff", "stroke-width": 2.6, "stroke-linecap": "round", opacity: 0.7 }),
        el(d, "circle", { cx: 26, cy: 28, r: 2.2, fill: "#fff", opacity: 0.35 }),
        el(d, "circle", { cx: 42, cy: 24, r: 1.6, fill: "#fff", opacity: 0.35 }),
      );
    }),
};

const bubbles: Actor = {
  id: "bubbles",
  lane: "any",
  motion: "sway",
  speed: 0.1,
  size: 60,
  ratio: 2.2,
  x: 0.5,
  y: 0.86,
  back: true,
  build: (ctx) =>
    art(ctx, 60, 132, (defs, g) => {
      const d = ctx.doc;
      const sh = rfill(ctx, defs, [[0, "#ffffff", 0.9], [0.7, "#bfeaff", 0.25], [1, "#7fcbf0", 0.5]], [0.3, 0.3]);
      [[16, 118, 7], [38, 124, 5], [28, 116, 9], [46, 120, 4]].forEach(([x, y, r], i) => {
        const b = el(d, "g", {}, el(d, "circle", { cx: x, cy: y, r, fill: sh, stroke: "#6fb8dd", "stroke-width": 0.8 }), el(d, "ellipse", { cx: x! - r! * 0.3, cy: y! - r! * 0.35, rx: r! * 0.28, ry: r! * 0.16, fill: "#fff", opacity: 0.9 }));
        g.append(anim(b, "rise", { dur: 5 + i * 1.3, delay: i * 1.2, amp: -100 }));
      });
    }),
};

const turtle: Actor = {
  id: "turtle",
  lane: "any",
  motion: "drift",
  speed: 0.4,
  size: 92,
  ratio: 0.75,
  x: 0.5,
  y: 0.52,
  amp: 14,
  build: (ctx) =>
    art(ctx, 92, 70, (defs, g) => {
      const d = ctx.doc;
      const shell = rfill(ctx, defs, [[0, "#8fe0a2"], [0.6, "#3fa36a"], [1, "#1f6b4a"]], [0.35, 0.3]);
      const skin = vfill(ctx, defs, [[0, "#d6efa0"], [1, "#8cc063"]]);
      g.append(softShadow(ctx, 46, 64, 32, 3.4, "#06303a", 0.2));
      g.append(
        anim(el(d, "path", { d: "M20 38 Q6 46 4 58 Q16 58 28 46 Z", fill: skin, stroke: "#4f7d34", "stroke-width": 1, "stroke-linejoin": "round" }), "flap", { dur: 2.2 }),
        anim(el(d, "path", { d: "M62 38 Q76 46 78 58 Q66 58 54 46 Z", fill: skin, stroke: "#4f7d34", "stroke-width": 1, "stroke-linejoin": "round" }), "flap", { dur: 2.2, delay: 1.1 }),
        el(d, "path", { d: "M12 36 L4 46 Q10 48 18 42 Z", fill: skin, stroke: "#4f7d34", "stroke-width": 1, "stroke-linejoin": "round" }),
        el(d, "path", { d: "M70 22 Q92 18 90 32 Q88 40 74 36 Z", fill: skin, stroke: "#4f7d34", "stroke-width": 1, "stroke-linejoin": "round" }),
        el(d, "circle", { cx: 82, cy: 27, r: 2.2, fill: "#fff", stroke: "#2d4a1d", "stroke-width": 0.7 }),
        el(d, "circle", { cx: 82.6, cy: 27, r: 1.1, fill: "#10230a" }),
        el(d, "path", { d: "M80 33 q3 1.6 6 -0.4", fill: "none", stroke: "#4f7d34", "stroke-width": 1, "stroke-linecap": "round" }),
        el(d, "path", { d: "M14 40 C14 14 66 10 72 36 C72 46 60 50 42 50 C26 50 14 48 14 40 Z", fill: shell, stroke: "#14503a", "stroke-width": 1.2, "stroke-linejoin": "round" }),
        el(d, "path", { d: "M28 22 L42 18 L56 22 L60 34 L42 40 L24 34 Z", fill: "none", stroke: "#14503a", "stroke-width": 1, opacity: 0.55, "stroke-linejoin": "round" }),
        el(d, "path", { d: "M42 18 V40 M24 34 L14 40 M60 34 L70 38", stroke: "#14503a", "stroke-width": 1, opacity: 0.45 }),
        el(d, "path", { d: "M22 22 C28 14 40 12 50 14", fill: "none", stroke: "#fff", "stroke-width": 2.6, "stroke-linecap": "round", opacity: 0.55 }),
      );
    }),
};

const submarine: Actor = {
  id: "submarine",
  lane: "any",
  motion: "float",
  speed: 0.5,
  size: 100,
  ratio: 0.55,
  x: 0.5,
  y: 0.7,
  amp: 8,
  build: (ctx) =>
    art(ctx, 100, 56, (defs, g) => {
      const d = ctx.doc;
      const hull = vfill(ctx, defs, [[0, "#ffe27a"], [0.5, "#f1b92e"], [1, "#b57d12"]]);
      const glass = rfill(ctx, defs, [[0, "#c9f6ff"], [0.6, "#4ab3e0"], [1, "#1c5f8a"]]);
      g.append(
        anim(el(d, "g", {}, el(d, "ellipse", { cx: 6, cy: 34, rx: 2, ry: 9, fill: "#cfd6e4", stroke: "#566078", "stroke-width": 0.8 })), "flap", { dur: 0.5 }),
        el(d, "path", { d: "M42 14 h8 q3 0 3 4 v6 h-14 v-6 q0 -4 3 -4 Z", fill: hull, stroke: "#7b520a", "stroke-width": 1, "stroke-linejoin": "round" }),
        el(d, "path", { d: "M46 14 v-8 h8", fill: "none", stroke: "#566078", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }),
        el(d, "ellipse", { cx: 50, cy: 34, rx: 42, ry: 17, fill: hull, stroke: "#7b520a", "stroke-width": 1.2 }),
        el(d, "ellipse", { cx: 50, cy: 26, rx: 34, ry: 5, fill: "#fff", opacity: 0.3 }),
        ...[26, 42, 58].map((x) => el(d, "g", {}, el(d, "circle", { cx: x, cy: 34, r: 6, fill: "#6b7390", stroke: "#3c4460", "stroke-width": 1 }), el(d, "circle", { cx: x, cy: 34, r: 4.4, fill: glass }), el(d, "ellipse", { cx: x - 1.4, cy: 32.4, rx: 1.6, ry: 0.9, fill: "#fff", opacity: 0.85 }))),
        el(d, "path", { d: "M82 48 l8 8 h-8 z M82 20 l8 -6 v10 z", fill: "#c98d1c", stroke: "#7b520a", "stroke-width": 0.9, "stroke-linejoin": "round" }),
      );
    }),
};

const seaweed: Actor = {
  id: "seaweed",
  lane: "any",
  motion: "sway",
  speed: 0.5,
  size: 56,
  ratio: 1.9,
  x: 0.5,
  y: 0.95,
  build: (ctx) =>
    art(ctx, 56, 106, (defs, g) => {
      const d = ctx.doc;
      const leaf = vfill(ctx, defs, [[0, "#8ae38b"], [1, "#1d7a4d"]]);
      const blade = (x: number, h: number, c: number) => el(d, "path", { d: `M${x} 104 C${x - c} ${104 - h * 0.35} ${x + c} ${104 - h * 0.65} ${x} ${104 - h} C${x + c + 7} ${104 - h * 0.6} ${x - c + 7} ${104 - h * 0.3} ${x + 6} 104 Z`, fill: leaf, stroke: "#14573a", "stroke-width": 1, "stroke-linejoin": "round" });
      g.append(anim(blade(14, 90, 9), "sway", { dur: 4.5 }), anim(blade(28, 100, -8), "sway", { dur: 5.2, delay: 0.6 }), anim(blade(42, 76, 8), "sway", { dur: 4, delay: 1.2 }));
    }),
};

const rays: Actor = {
  id: "light-rays",
  lane: "any",
  motion: "float",
  speed: 0.1,
  size: 160,
  ratio: 2,
  x: 0.5,
  y: 0.3,
  amp: 2,
  back: true,
  build: (ctx) =>
    art(ctx, 160, 320, (defs, g) => {
      const d = ctx.doc;
      const ray = vfill(ctx, defs, [[0, "#ffffff", 0.55], [1, "#c9f0ff", 0]]);
      [[20, 30], [60, 26], [96, 34], [130, 22]].forEach(([x, w], i) => g.append(anim(el(d, "path", { d: `M${x} 0 h${w} L${x! + w! + 20} 320 h-${w! + 8} Z`, fill: ray }), "ray", { dur: 4 + i, delay: i * 0.8 })));
    }),
};

export const OCEAN: SceneDef = {
  id: "ocean",
  name: "Ocean",
  actors: [rays, fish("fish-orange", 0.2, ["#ffc27a", "#ff8a3d", "#c24f12"], "#ffb066", 0), jellyfish, bubbles, turtle, fish("fish-blue", 0.62, ["#9fe4ff", "#3fa9e8", "#1c5fa6"], "#7fd0ff", 1.5), submarine, seaweed, fish("fish-pink", 0.45, ["#ffd1e8", "#ff8cc0", "#c2457f"], "#ffa6d0", 3)],
};
