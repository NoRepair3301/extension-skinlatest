import { SVG_NS } from "../scenes/svg.ts";

export const CREATURES = ["fox", "cat", "bunny", "slime", "owl"] as const;
export type CreatureKind = (typeof CREATURES)[number];
export const isCreature = (k: string): k is CreatureKind => (CREATURES as readonly string[]).includes(k);

export type CreaturePose = "idle" | "blink" | "walk-a" | "walk-b" | "celebrate" | "sleep" | "wave-a" | "wave-b";

type Attrs = Record<string, string | number>;
const n = (doc: Document, tag: string, attrs: Attrs, ...kids: Array<Element | undefined>): SVGElement => {
  const e = doc.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  for (const c of kids) if (c) e.append(c);
  return e;
};

interface Look {
  light: string;
  base: string;
  dark: string;
  /** Muzzle, belly and inner ear colour. */
  cream: string;
  inner: string;
  ink: string;
}

const LOOKS: Record<CreatureKind, Look> = {
  fox: { light: "#ffb877", base: "#f08a3c", dark: "#b25416", cream: "#fff2dd", inner: "#6a3412", ink: "#2d1b1b" },
  cat: { light: "#d2d9e6", base: "#9ea8bd", dark: "#667188", cream: "#f5efe6", inner: "#f4a9c0", ink: "#26263a" },
  bunny: { light: "#ffffff", base: "#f4eeee", dark: "#c9bdc2", cream: "#fff8f8", inner: "#f7b6c8", ink: "#3a2a35" },
  slime: { light: "#d7ffe9", base: "#7ee8b0", dark: "#2fa77a", cream: "#eafff4", inner: "#ffffff", ink: "#16463a" },
  owl: { light: "#d9a874", base: "#a8784a", dark: "#6b4627", cream: "#f2dfbf", inner: "#d9a874", ink: "#2a1c14" },
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_ACCENT = "#e5484d";

/** Shade a #rrggbb colour (negative darkens, positive lightens). */
function shade(hex: string, amount: number): string {
  const v = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amount < 0 ? c : 255 - c) * amount)));
  return "#" + [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => f(c).toString(16).padStart(2, "0")).join("");
}

/**
 * Five original pets, each drawn from basic shapes with gradients: big head, small body, simple eyes with highlights, blush,
 * two-tone outline. The scarf or bow takes the theme accent. Built with createElementNS only. 64 x 64 viewBox.
 * Facing right; the page flips the whole sprite when it walks left.
 */
export function drawCreature(doc: Document, kind: CreatureKind, pose: CreaturePose, accentIn?: string): SVGSVGElement {
  const L = LOOKS[kind];
  const accent = accentIn && HEX.test(accentIn) ? accentIn : DEFAULT_ACCENT;
  const accentDark = shade(accent, -0.35);
  const id = `p${kind}`;
  const defs = n(doc, "defs", {});
  const grad = (name: string, a: string, b: string, c: string, x2 = 0, y2 = 1) => {
    defs.append(n(doc, "linearGradient", { id: `${id}-${name}`, x1: 0, y1: 0, x2, y2 }, n(doc, "stop", { offset: 0, "stop-color": a }), n(doc, "stop", { offset: 0.55, "stop-color": b }), n(doc, "stop", { offset: 1, "stop-color": c })));
    return `url(#${id}-${name})`;
  };
  const body = grad("body", L.light, L.base, L.dark, 0.35, 1);
  const belly = grad("belly", "#ffffff", L.cream, shade(L.cream, -0.12));
  const scarf = grad("scarf", shade(accent, 0.3), accent, accentDark);

  const walkA = pose === "walk-a";
  const walkB = pose === "walk-b";
  const jump = pose === "celebrate";
  const asleep = pose === "sleep";
  const lift = jump ? -7 : walkA || walkB ? -1 : 0;
  const lean = walkA ? -1.5 : walkB ? 1.5 : 0;
  const tilt = asleep ? 5 : 0;
  const slime = kind === "slime";
  const stroke = { stroke: L.dark, "stroke-width": 1.3, "stroke-linejoin": "round" } as const;

  const parts: SVGElement[] = [];
  // ground shadow (does not lift with the jump)
  parts.push(n(doc, "ellipse", { cx: 32, cy: 60.5, rx: jump ? 10 : 15, ry: 2.6, fill: "#000", opacity: jump ? 0.12 : 0.2 }));

  const g: SVGElement[] = [];

  // back parts: tails and ears are drawn before the body so the body overlaps them
  if (kind === "fox") {
    g.push(n(doc, "path", { d: "M44 52 C60 52 62 34 54 28 C54 40 48 44 42 44 Z", fill: body, ...stroke }));
    g.push(n(doc, "path", { d: "M54 28 C58 32 60 38 58 44 C57 38 55 34 52 31 Z", fill: belly, stroke: L.dark, "stroke-width": 0.8 }));
  } else if (kind === "cat") {
    g.push(n(doc, "path", { d: "M44 54 C58 56 62 44 56 34", fill: "none", stroke: L.dark, "stroke-width": 7, "stroke-linecap": "round" }));
    g.push(n(doc, "path", { d: "M44 54 C58 56 62 44 56 34", fill: "none", stroke: body, "stroke-width": 5, "stroke-linecap": "round" }));
    g.push(n(doc, "path", { d: "M54 46 l4 -1 M56 40 l4 -1", stroke: L.dark, "stroke-width": 1.2, "stroke-linecap": "round", opacity: 0.7 }));
  } else if (kind === "bunny") {
    g.push(n(doc, "circle", { cx: 46, cy: 54, r: 5.5, fill: belly, stroke: L.dark, "stroke-width": 1 }));
  } else if (kind === "owl") {
    g.push(n(doc, "ellipse", { cx: 14, cy: 44, rx: 6, ry: 11, fill: L.dark, stroke: L.dark, "stroke-width": 1, transform: `rotate(${walkA ? -10 : 8} 14 36)` }));
    g.push(n(doc, "ellipse", { cx: 50, cy: 44, rx: 6, ry: 11, fill: L.dark, stroke: L.dark, "stroke-width": 1, transform: `rotate(${walkB ? 10 : -8} 50 36)` }));
  }

  // feet
  if (!slime) {
    const fa = walkA ? 3 : 0;
    const fb = walkB ? 3 : 0;
    const footFill = kind === "owl" ? "#f2a33c" : L.dark;
    g.push(n(doc, "ellipse", { cx: 25, cy: 58 - fa, rx: 6.2, ry: 3.4, fill: footFill, stroke: L.dark, "stroke-width": 0.8 }));
    g.push(n(doc, "ellipse", { cx: 39, cy: 58 - fb, rx: 6.2, ry: 3.4, fill: footFill, stroke: L.dark, "stroke-width": 0.8 }));
  }

  // body
  if (slime) {
    const sx = walkA ? 1.06 : walkB ? 0.95 : 1;
    const sy = walkA ? 0.94 : walkB ? 1.06 : jump ? 1.08 : 1;
    g.push(
      n(doc, "g", { transform: `translate(32 58) scale(${sx} ${sy}) translate(-32 -58)` },
        n(doc, "path", { d: "M8 54 C6 36 18 12 32 12 C46 12 58 36 56 54 C56 59 50 60 44 59 Q40 62 36 59 Q32 62 28 59 Q24 62 20 59 C14 60 8 59 8 54 Z", fill: body, ...stroke }),
        n(doc, "path", { d: "M14 50 C14 38 22 24 32 24 C42 24 50 38 50 50 C44 54 20 54 14 50 Z", fill: L.cream, opacity: 0.35 }),
        n(doc, "path", { d: "M16 34 C18 24 26 17 33 17", fill: "none", stroke: "#fff", "stroke-width": 3, "stroke-linecap": "round", opacity: 0.75 }),
        n(doc, "circle", { cx: 46, cy: 44, r: 2, fill: "#fff", opacity: 0.55 }),
        n(doc, "circle", { cx: 40, cy: 50, r: 1.2, fill: "#fff", opacity: 0.45 }),
      ),
    );
  } else if (kind === "owl") {
    g.push(n(doc, "path", { d: "M32 12 C48 12 54 28 52 44 C51 55 42 60 32 60 C22 60 13 55 12 44 C10 28 16 12 32 12 Z", fill: body, ...stroke }));
    g.push(n(doc, "ellipse", { cx: 32, cy: 46, rx: 14, ry: 12, fill: belly, opacity: 0.95 }));
    for (const [x, y] of [[27, 42], [37, 42], [32, 48], [26, 50], [38, 50]] as const) g.push(n(doc, "path", { d: `M${x - 3} ${y} q3 3 6 0`, fill: "none", stroke: L.dark, "stroke-width": 1, "stroke-linecap": "round", opacity: 0.55 }));
  } else {
    g.push(n(doc, "ellipse", { cx: 32 + lean, cy: 49, rx: 13.5, ry: 10, fill: body, ...stroke }));
    g.push(n(doc, "ellipse", { cx: 32 + lean, cy: 51, rx: 8, ry: 6.5, fill: belly, opacity: 0.95 }));
  }

  // scarf (not for the slime and the owl, which carry it differently)
  if (kind === "fox" || kind === "cat" || kind === "bunny") {
    g.push(n(doc, "path", { d: `M${19 + lean} 40 Q${32 + lean} 47 ${45 + lean} 40 L${44 + lean} 45 Q${32 + lean} 52 ${20 + lean} 45 Z`, fill: scarf, stroke: accentDark, "stroke-width": 1, "stroke-linejoin": "round" }));
    g.push(n(doc, "path", { d: `M${40 + lean} 45 l3 9 l4 -3 l-2 -8 Z`, fill: scarf, stroke: accentDark, "stroke-width": 1, "stroke-linejoin": "round" }));
    g.push(n(doc, "path", { d: `M${22 + lean} 42.5 Q${32 + lean} 48 ${42 + lean} 42.5`, fill: "none", stroke: "#fff", "stroke-width": 1.2, "stroke-linecap": "round", opacity: 0.45 }));
  } else if (kind === "owl") {
    g.push(n(doc, "path", { d: "M17 34 Q32 42 47 34 L46 39 Q32 47 18 39 Z", fill: scarf, stroke: accentDark, "stroke-width": 1, "stroke-linejoin": "round" }));
    g.push(n(doc, "path", { d: "M20 36.5 Q32 42 44 36.5", fill: "none", stroke: "#fff", "stroke-width": 1.1, "stroke-linecap": "round", opacity: 0.45 }));
  }

  // head
  const headCy = slime ? 38 : kind === "owl" ? 27 : 26;
  const head: SVGElement[] = [];
  if (kind === "fox") {
    head.push(n(doc, "path", { d: "M14 20 L15 3 L28 12 Z", fill: body, ...stroke }));
    head.push(n(doc, "path", { d: "M50 20 L49 3 L36 12 Z", fill: body, ...stroke }));
    head.push(n(doc, "path", { d: "M17 15 L17.5 7 L24 12 Z", fill: L.inner }));
    head.push(n(doc, "path", { d: "M47 15 L46.5 7 L40 12 Z", fill: L.inner }));
    head.push(n(doc, "ellipse", { cx: 32, cy: 27, rx: 20, ry: 16, fill: body, ...stroke }));
    head.push(n(doc, "path", { d: "M12 30 Q22 28 24 36 Q20 40 12 36 Z M52 30 Q42 28 40 36 Q44 40 52 36 Z", fill: belly, stroke: L.dark, "stroke-width": 0.8, "stroke-linejoin": "round" }));
    head.push(n(doc, "ellipse", { cx: 32, cy: 34, rx: 8.5, ry: 6, fill: belly }));
  } else if (kind === "cat") {
    head.push(n(doc, "path", { d: "M14 22 L14 4 L28 13 Z", fill: body, ...stroke }));
    head.push(n(doc, "path", { d: "M50 22 L50 4 L36 13 Z", fill: body, ...stroke }));
    head.push(n(doc, "path", { d: "M17.5 17 L17.5 8.5 L25 13 Z", fill: L.inner }));
    head.push(n(doc, "path", { d: "M46.5 17 L46.5 8.5 L39 13 Z", fill: L.inner }));
    head.push(n(doc, "ellipse", { cx: 32, cy: 27, rx: 20, ry: 16, fill: body, ...stroke }));
    head.push(n(doc, "path", { d: "M32 11 v5 M26 12 l1.5 4 M38 12 l-1.5 4", stroke: L.dark, "stroke-width": 1.5, "stroke-linecap": "round", opacity: 0.6 }));
    head.push(n(doc, "ellipse", { cx: 32, cy: 34, rx: 7.5, ry: 5.2, fill: belly }));
    for (const s of [-1, 1]) head.push(n(doc, "path", { d: `M${32 + s * 12} 33 l${s * 9} -2 M${32 + s * 12} 36 l${s * 9} 1`, stroke: L.dark, "stroke-width": 0.9, "stroke-linecap": "round", opacity: 0.8 }));
  } else if (kind === "bunny") {
    const ear = (x: number, rot: number) => {
      const wob = walkA ? -3 : walkB ? 3 : 0;
      return n(doc, "g", { transform: `rotate(${rot + wob} ${x} 16)` }, n(doc, "ellipse", { cx: x, cy: 5, rx: 5.4, ry: 14, fill: body, ...stroke }), n(doc, "ellipse", { cx: x, cy: 6, rx: 2.6, ry: 10, fill: L.inner }));
    };
    head.push(ear(23, -8), ear(41, 8));
    head.push(n(doc, "ellipse", { cx: 32, cy: 27, rx: 19, ry: 15.5, fill: body, ...stroke }));
    head.push(n(doc, "ellipse", { cx: 32, cy: 34, rx: 7.5, ry: 5, fill: belly }));
  } else if (kind === "owl") {
    head.push(n(doc, "path", { d: "M14 20 L12 6 L25 14 Z", fill: body, ...stroke }));
    head.push(n(doc, "path", { d: "M50 20 L52 6 L39 14 Z", fill: body, ...stroke }));
    head.push(n(doc, "ellipse", { cx: 24, cy: 27, rx: 10.5, ry: 10.5, fill: belly, stroke: L.dark, "stroke-width": 1 }));
    head.push(n(doc, "ellipse", { cx: 40, cy: 27, rx: 10.5, ry: 10.5, fill: belly, stroke: L.dark, "stroke-width": 1 }));
  } else {
    head.push(n(doc, "path", { d: "M32 8 q6 -3 9 1 q-4 5 -9 4 Z", fill: shade(L.base, -0.1), stroke: L.dark, "stroke-width": 1, "stroke-linejoin": "round" }));
    // the slime's bow takes the accent
    head.push(n(doc, "path", { d: "M44 17 l7 -5 l1 9 Z M44 17 l-4 -7 l-3 8 Z", fill: scarf, stroke: accentDark, "stroke-width": 1, "stroke-linejoin": "round" }), n(doc, "circle", { cx: 44, cy: 17, r: 2.6, fill: accent, stroke: accentDark, "stroke-width": 1 }));
  }

  // shine on the head (two-tone: light top-left, soft shade bottom-right)
  if (!slime && kind !== "owl") {
    head.push(n(doc, "path", { d: "M17 22 C19 15 25 12 31 12", fill: "none", stroke: "#fff", "stroke-width": 2.6, "stroke-linecap": "round", opacity: 0.55 }));
    head.push(n(doc, "path", { d: "M50 32 C48 38 42 41 36 41", fill: "none", stroke: L.dark, "stroke-width": 2, "stroke-linecap": "round", opacity: 0.25 }));
  }

  // face
  const ex = kind === "owl" ? [24, 40] : kind === "fox" || kind === "cat" ? [23.5, 40.5] : [24, 40];
  const ey = slime ? headCy - 2 : kind === "owl" ? 27 : 27.5;
  const happy = jump || pose.startsWith("wave");
  if (asleep || pose === "blink") {
    for (const x of ex) head.push(n(doc, "path", { d: asleep ? `M${x - 3.6} ${ey} Q${x} ${ey + 3.4} ${x + 3.6} ${ey}` : `M${x - 3.4} ${ey} L${x + 3.4} ${ey}`, fill: "none", stroke: L.ink, "stroke-width": 1.8, "stroke-linecap": "round" }));
  } else if (happy) {
    for (const x of ex) head.push(n(doc, "path", { d: `M${x - 3.6} ${ey + 1} Q${x} ${ey - 4.6} ${x + 3.6} ${ey + 1}`, fill: "none", stroke: L.ink, "stroke-width": 1.9, "stroke-linecap": "round" }));
  } else {
    for (const x of ex) {
      const r = kind === "owl" ? 4.2 : 3.1;
      if (kind === "owl") head.push(n(doc, "circle", { cx: x, cy: ey, r: 6.5, fill: "#fff", stroke: L.dark, "stroke-width": 0.8 }));
      head.push(n(doc, "ellipse", { cx: x, cy: ey, rx: r, ry: r * 1.2, fill: L.ink }));
      head.push(n(doc, "circle", { cx: x + 1.1, cy: ey - 1.4, r: 1.25, fill: "#fff" }), n(doc, "circle", { cx: x - 1, cy: ey + 1.4, r: 0.6, fill: "#fff", opacity: 0.8 }));
    }
  }
  const my = slime ? headCy + 5 : kind === "owl" ? 36 : 36;
  if (kind === "owl") {
    head.push(n(doc, "path", { d: "M28.5 32 L35.5 32 L32 38.5 Z", fill: "#f2a33c", stroke: "#a8651a", "stroke-width": 0.9, "stroke-linejoin": "round" }));
  } else {
    if (kind === "fox") head.push(n(doc, "ellipse", { cx: 32, cy: 31.6, rx: 2.4, ry: 1.7, fill: L.ink }));
    if (kind === "cat") head.push(n(doc, "path", { d: "M30 31 h4 l-2 2.6 Z", fill: "#e98aa6", stroke: "#b8587a", "stroke-width": 0.6, "stroke-linejoin": "round" }));
    if (kind === "bunny") head.push(n(doc, "path", { d: "M30.2 31.4 h3.6 l-1.8 2.2 Z", fill: "#f090aa" }));
    head.push(n(doc, "path", { d: jump ? `M28 ${my - 1} Q32 ${my + 6} 36 ${my - 1} Z` : `M28.6 ${my - 0.6} Q30.3 ${my + 1.8} 32 ${my - 0.4} Q33.7 ${my + 1.8} 35.4 ${my - 0.6}`, fill: jump ? "#7b2a3a" : "none", stroke: L.ink, "stroke-width": 1.4, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    if (jump) head.push(n(doc, "path", { d: `M29.6 ${my + 2.2} Q32 ${my + 4.6} 34.4 ${my + 2.2}`, fill: "#ff8fa8", stroke: "none" }));
  }
  const bx = kind === "owl" ? [17, 47] : [17.5, 46.5];
  const by = slime ? headCy + 3 : kind === "owl" ? 36 : 33.5;
  for (const x of bx) head.push(n(doc, "ellipse", { cx: x, cy: by, rx: 3.8, ry: 2.3, fill: "#ff8fa8", opacity: 0.55 }));

  g.push(n(doc, "g", { transform: `rotate(${tilt} 32 50) translate(${lean} 0)` }, ...head));

  // arms: the wave poses raise one paw
  if (pose === "wave-a" || pose === "wave-b") {
    const a = pose === "wave-a" ? -18 : 12;
    g.push(n(doc, "g", { transform: `rotate(${a} 48 46)` }, n(doc, "ellipse", { cx: 50, cy: 38, rx: 3.8, ry: 7.5, fill: body, ...stroke })));
  }

  const lifted = n(doc, "g", { transform: `translate(0 ${lift})` }, ...g);
  parts.push(lifted);

  if (asleep) {
    const z = (x: number, y: number, s: number, o: number) => n(doc, "path", { d: `M${x} ${y} h${5 * s} l${-5 * s} ${5 * s} h${5 * s}`, fill: "none", stroke: "#6b7a99", "stroke-width": 1.4 * s, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: o });
    parts.push(z(46, 12, 1, 0.95), z(53, 5, 0.7, 0.7), z(41, 18, 0.5, 0.5));
  }
  if (jump) {
    const star = (x: number, y: number, c: string) => n(doc, "path", { d: `M${x} ${y - 4} L${x + 1.2} ${y - 1.2} L${x + 4} ${y} L${x + 1.2} ${y + 1.2} L${x} ${y + 4} L${x - 1.2} ${y + 1.2} L${x - 4} ${y} L${x - 1.2} ${y - 1.2} Z`, fill: c });
    parts.push(star(8, 14, "#ffd86b"), star(57, 10, "#fff"), star(58, 30, "#ffd86b"));
  }

  const svg = n(doc, "svg", { viewBox: "0 0 64 64", width: "100%", height: "100%", "aria-hidden": "true", focusable: "false" }, defs, ...parts) as SVGSVGElement;
  svg.setAttribute("data-pose", pose);
  return svg;
}
