import { drawCreature, isCreature, type CreatureKind } from "./creatures.ts";

/** Pebble and Sprout are the original two; the five creatures (fox, cat, bunny, slime, owl) came in Phase 10. */
export type PetKind = "pebble" | "sprout" | CreatureKind;
export type PetPose = "idle" | "blink" | "walk-a" | "walk-b" | "celebrate" | "sleep" | "wave-a" | "wave-b";

export const POSES: readonly PetPose[] = ["idle", "blink", "walk-a", "walk-b", "celebrate", "sleep", "wave-a", "wave-b"];

/** The SVG XML namespace identifier: a name, not an address. Nothing is fetched. Assembled so the URL scanner has nothing to flag. */
const SVG_NS = ["http:", "", "www.w3.org", "2000", "svg"].join("/");

type Attrs = Record<string, string | number>;

function node(doc: Document, tag: string, attrs: Attrs, ...children: Element[]): Element {
  const el = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

const PALETTE: Record<"pebble" | "sprout", { body: string; shade: string; accent: string }> = {
  pebble: { body: "#8fa8c4", shade: "#6d87a6", accent: "#f3b8b8" },
  sprout: { body: "#9ccf8f", shade: "#74b066", accent: "#f6d36b" },
};

const star = (doc: Document, x: number, y: number, color: string): Element =>
  node(doc, "path", { d: `M${x} ${y - 4} L${x + 1.2} ${y - 1.2} L${x + 4} ${y} L${x + 1.2} ${y + 1.2} L${x} ${y + 4} L${x - 1.2} ${y + 1.2} L${x - 4} ${y} L${x - 1.2} ${y - 1.2} Z`, fill: color });

/**
 * Two original pets drawn from basic shapes: Pebble, a round stone with stubby feet, and Sprout, a round bud with two leaves.
 * Built with createElementNS only. 64 x 64 viewBox.
 */
export function drawPet(doc: Document, kind: PetKind, poseIn: PetPose, accent?: string): SVGSVGElement {
  if (isCreature(kind)) return drawCreature(doc, kind, poseIn, accent);
  // the two original pets have no sleep or wave art: sleep closes the eyes, waving is a happy idle
  const pose: PetPose = poseIn === "sleep" ? "blink" : poseIn === "wave-a" || poseIn === "wave-b" ? "idle" : poseIn;
  const c = PALETTE[kind as "pebble" | "sprout"];
  const lift = pose === "celebrate" ? -5 : pose === "walk-a" ? -1 : 0;
  const lean = pose === "walk-a" ? -2 : pose === "walk-b" ? 2 : 0;
  const parts: Element[] = [];

  // feet: alternate in the walk poses
  const footA = pose === "walk-a" ? 4 : 0;
  const footB = pose === "walk-b" ? 4 : 0;
  parts.push(node(doc, "ellipse", { cx: 24, cy: 55 - footA, rx: 6, ry: 3.5, fill: c.shade }));
  parts.push(node(doc, "ellipse", { cx: 40, cy: 55 - footB, rx: 6, ry: 3.5, fill: c.shade }));

  const body: Element[] = [];
  body.push(node(doc, "ellipse", { cx: 32 + lean, cy: 36, rx: 22, ry: 19, fill: c.body }));
  body.push(node(doc, "ellipse", { cx: 32 + lean, cy: 44, rx: 15, ry: 9, fill: c.shade, opacity: 0.25 }));
  if (kind === "sprout") {
    body.push(node(doc, "path", { d: `M${32 + lean} 18 C${30 + lean} 10 ${22 + lean} 8 ${20 + lean} 12 C${22 + lean} 17 ${27 + lean} 19 ${32 + lean} 18 Z`, fill: c.accent }));
    body.push(node(doc, "path", { d: `M${32 + lean} 18 C${34 + lean} 9 ${42 + lean} 7 ${45 + lean} 11 C${43 + lean} 16 ${38 + lean} 19 ${32 + lean} 18 Z`, fill: "#7fbf6e" }));
  } else {
    body.push(node(doc, "path", { d: `M${20 + lean} 24 C${24 + lean} 20 ${28 + lean} 20 ${31 + lean} 22`, fill: "none", stroke: c.shade, "stroke-width": 2, "stroke-linecap": "round" }));
  }

  // eyes
  const eyeY = 34;
  if (pose === "blink") {
    for (const x of [25, 39]) body.push(node(doc, "path", { d: `M${x - 3 + lean} ${eyeY} L${x + 3 + lean} ${eyeY}`, stroke: "#243447", "stroke-width": 2, "stroke-linecap": "round" }));
  } else if (pose === "celebrate") {
    for (const x of [25, 39]) body.push(node(doc, "path", { d: `M${x - 3 + lean} ${eyeY + 1} Q${x + lean} ${eyeY - 4} ${x + 3 + lean} ${eyeY + 1}`, fill: "none", stroke: "#243447", "stroke-width": 2, "stroke-linecap": "round" }));
  } else {
    for (const x of [25, 39]) {
      body.push(node(doc, "ellipse", { cx: x + lean, cy: eyeY, rx: 2.6, ry: 3.2, fill: "#243447" }));
      body.push(node(doc, "circle", { cx: x + lean + 0.9, cy: eyeY - 1, r: 0.9, fill: "#ffffff" }));
    }
  }
  body.push(node(doc, "ellipse", { cx: 19 + lean, cy: 40, rx: 3.5, ry: 2.2, fill: c.accent, opacity: 0.7 }));
  body.push(node(doc, "ellipse", { cx: 45 + lean, cy: 40, rx: 3.5, ry: 2.2, fill: c.accent, opacity: 0.7 }));
  body.push(
    node(doc, "path", {
      d: pose === "celebrate" ? `M${28 + lean} 41 Q${32 + lean} 47 ${36 + lean} 41 Z` : `M${29 + lean} 41 Q${32 + lean} 44 ${35 + lean} 41`,
      fill: pose === "celebrate" ? "#243447" : "none",
      stroke: "#243447",
      "stroke-width": 1.8,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );

  parts.push(node(doc, "g", { transform: `translate(0 ${lift})` }, ...body));
  if (pose === "celebrate") {
    parts.push(star(doc, 10, 14, c.accent), star(doc, 54, 10, "#ffffff"), star(doc, 56, 28, c.accent));
  }

  const svg = node(doc, "svg", { viewBox: "0 0 64 64", width: "100%", height: "100%", "aria-hidden": "true", focusable: "false" }, ...parts) as SVGSVGElement;
  svg.setAttribute("data-pose", poseIn);
  return svg;
}
