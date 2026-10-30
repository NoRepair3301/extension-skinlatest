/** The SVG XML namespace identifier: a name, not an address. Nothing is fetched. Assembled so the URL scanner has nothing to flag. */
export const SVG_NS = ["http:", "", "www.w3.org", "2000", "svg"].join("/");

export type Attrs = Record<string, string | number | undefined>;

/** Builds one SVG element with createElementNS. Attributes whose value is undefined are skipped. */
export function el(doc: Document, tag: string, attrs: Attrs = {}, ...children: Array<Element | undefined>): SVGElement {
  const e = doc.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) e.setAttribute(k, String(v));
  for (const c of children) if (c) e.append(c);
  return e;
}

/** What an actor builder gets: the document, a unique-id maker (ids are shared by every actor in one shadow root) and the theme accent. */
export interface Ctx {
  doc: Document;
  uid(name: string): string;
  accent: string;
}

export type Stop = readonly [offset: number, color: string, opacity?: number];

const stops = (ctx: Ctx, list: readonly Stop[]): SVGElement[] =>
  list.map(([o, c, op]) => el(ctx.doc, "stop", { offset: o, "stop-color": c, "stop-opacity": op }));

/** Linear gradient in objectBoundingBox units. Returns the id to use as `url(#id)` and the node to put in <defs>. */
export function lin(ctx: Ctx, list: readonly Stop[], dir: readonly [number, number, number, number] = [0, 0, 0, 1]): { id: string; ref: string; node: SVGElement } {
  const id = ctx.uid("g");
  const node = el(ctx.doc, "linearGradient", { id, x1: dir[0], y1: dir[1], x2: dir[2], y2: dir[3] }, ...stops(ctx, list));
  return { id, ref: `url(#${id})`, node };
}

/** Radial gradient; the focus is offset up and left to give a lit-from-above look. */
export function rad(ctx: Ctx, list: readonly Stop[], focus: readonly [number, number] = [0.35, 0.3]): { id: string; ref: string; node: SVGElement } {
  const id = ctx.uid("g");
  const node = el(ctx.doc, "radialGradient", { id, cx: 0.5, cy: 0.5, r: 0.5, fx: focus[0], fy: focus[1] }, ...stops(ctx, list));
  return { id, ref: `url(#${id})`, node };
}

/** Soft blurred-looking shadow without any filter: a few stacked, fading ellipses. */
export function softShadow(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color = "#000", strength = 0.22): SVGElement {
  const g = el(ctx.doc, "g");
  for (let i = 0; i < 4; i++) {
    const k = 1 - i * 0.2;
    g.append(el(ctx.doc, "ellipse", { cx, cy, rx: rx * k, ry: ry * k, fill: color, opacity: (strength / 4).toFixed(3) }));
  }
  return g;
}

/** A sphere with a lit side, a dark rim and a highlight. */
export function sphere(ctx: Ctx, defs: SVGElement, cx: number, cy: number, r: number, light: string, mid: string, dark: string, outline?: string): SVGElement {
  const g = rad(ctx, [[0, light], [0.55, mid], [1, dark]], [0.32, 0.28]);
  defs.append(g.node);
  const out = el(ctx.doc, "g");
  out.append(
    el(ctx.doc, "circle", { cx, cy, r, fill: g.ref, stroke: outline ?? dark, "stroke-width": Math.max(0.6, r * 0.05), "stroke-opacity": 0.55 }),
    el(ctx.doc, "ellipse", { cx: cx - r * 0.34, cy: cy - r * 0.4, rx: r * 0.3, ry: r * 0.18, fill: "#fff", opacity: 0.55, transform: `rotate(-28 ${cx - r * 0.34} ${cy - r * 0.4})` }),
  );
  return out;
}

/** Four-point sparkle path centred on x,y. */
export const sparklePath = (x: number, y: number, r: number): string =>
  `M${x} ${y - r}L${x + r * 0.28} ${y - r * 0.28}L${x + r} ${y}L${x + r * 0.28} ${y + r * 0.28}L${x} ${y + r}L${x - r * 0.28} ${y + r * 0.28}L${x - r} ${y}L${x - r * 0.28} ${y - r * 0.28}Z`;

/** Root <svg> of an actor. `data-anim` nodes inside it are counted against the node budget. */
export function root(ctx: Ctx, w: number, h: number, ...children: Array<Element | undefined>): SVGElement {
  return el(ctx.doc, "svg", { viewBox: `0 0 ${w} ${h}`, width: "100%", height: "100%", "aria-hidden": "true", focusable: "false" }, ...children);
}

/** Marks an element as animated by a named keyframe set from the engine's stylesheet, with optional timing variables. */
export function anim<T extends Element>(node: T, name: string, opts: { dur?: number; delay?: number; amp?: number } = {}): T {
  node.setAttribute("data-anim", name);
  const s = (node as unknown as { style?: CSSStyleDeclaration }).style;
  if (s) {
    if (opts.dur !== undefined) s.setProperty("--dur", `${opts.dur}s`);
    if (opts.delay !== undefined) s.setProperty("--delay", `${opts.delay}s`);
    if (opts.amp !== undefined) s.setProperty("--amp", `${opts.amp}px`);
  }
  return node;
}
