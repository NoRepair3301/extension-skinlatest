/** Horizontal extent of one piece of real content, in viewport coordinates. */
export interface ContentRect {
  x: number;
  w: number;
}

export interface Gutter {
  x: number;
  w: number;
}

/** ok: at least one gutter is usable. narrow: there is some space, but less than MIN_GUTTER. none: no space (or no content to measure against). */
export type GutterState = "ok" | "narrow" | "none";

export interface Gutters {
  left?: Gutter;
  right?: Gutter;
  state: GutterState;
}

/** A gutter is usable at this width or more. */
export const MIN_GUTTER = 120;
/** Anything thinner than this is not worth reporting as narrow space. */
const SLIVER = 24;

/**
 * Pure. Free side space left and right of the content: the content's overall extent is the union of all rects,
 * so a gutter never lies beside only part of the page. A document wider than the viewport (sideways scrolling) clamps to the viewport.
 */
export function computeGutters(contentRects: readonly ContentRect[], viewportWidth: number, documentWidth: number): Gutters {
  const width = Math.max(0, viewportWidth);
  void documentWidth;
  const rects = contentRects.filter((r) => Number.isFinite(r.x) && Number.isFinite(r.w) && r.w > 0);
  if (rects.length === 0 || width <= 0) return { state: "none" };
  let min = Infinity;
  let max = -Infinity;
  for (const r of rects) {
    min = Math.min(min, r.x);
    max = Math.max(max, r.x + r.w);
  }
  const leftW = Math.max(0, Math.floor(Math.min(min, width)));
  const rightX = Math.ceil(Math.max(max, 0));
  const rightW = Math.max(0, Math.floor(width - rightX));
  const out: Gutters = { state: "none" };
  const best = Math.max(leftW, rightW);
  if (leftW >= SLIVER) out.left = { x: 0, w: leftW };
  if (rightW >= SLIVER) out.right = { x: rightX, w: rightW };
  out.state = best >= MIN_GUTTER ? "ok" : best >= SLIVER ? "narrow" : "none";
  return out;
}

/** The gutters a scene may actually use (>= MIN_GUTTER), by lane choice. */
export function usableGutters(g: Gutters, lane: "both" | "left" | "right"): Gutter[] {
  const out: Gutter[] = [];
  if (g.left && g.left.w >= MIN_GUTTER && lane !== "right") out.push(g.left);
  if (g.right && g.right.w >= MIN_GUTTER && lane !== "left") out.push(g.right);
  return out;
}

/** One line for the popup when no art is shown. Fixed text. */
export const FREESPACE_WHY: Record<GutterState, string> = {
  ok: "",
  narrow: "This page has almost no empty side space, so no scene art is shown.",
  none: "This page uses the full width, so no scene art is shown.",
};
