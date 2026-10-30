/** Horizontal extent of one piece of real content, in viewport coordinates. */
export interface ContentRect {
  x: number;
  w: number;
  /** Vertical extent, when known (used to choose a corner). */
  y?: number;
  h?: number;
}

/** A box in viewport coordinates. */
export interface CornerBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The small strip scene art may use when a page has no usable gutter. */
export const CORNER_W = 120;
export const CORNER_H = 160;
const CORNER_INSET = 8;

/**
 * Pure. Of the four viewport corners, the box (CORNER_W by CORNER_H) that covers the least content, or undefined when the window is too small.
 * Rectangles without a vertical extent count as full height. Ties go to the bottom right.
 */
export function pickCorner(rects: readonly ContentRect[], vw: number, vh: number): CornerBox | undefined {
  if (vw < CORNER_W * 3 || vh < CORNER_H * 2) return undefined;
  const boxes: CornerBox[] = [
    { x: vw - CORNER_W - CORNER_INSET, y: vh - CORNER_H - CORNER_INSET, w: CORNER_W, h: CORNER_H },
    { x: CORNER_INSET, y: vh - CORNER_H - CORNER_INSET, w: CORNER_W, h: CORNER_H },
    { x: vw - CORNER_W - CORNER_INSET, y: CORNER_INSET, w: CORNER_W, h: CORNER_H },
    { x: CORNER_INSET, y: CORNER_INSET, w: CORNER_W, h: CORNER_H },
  ];
  const overlap = (c: CornerBox): number => {
    let sum = 0;
    for (const r of rects) {
      const ry = r.y ?? 0;
      const rh = r.h ?? vh;
      const ox = Math.max(0, Math.min(c.x + c.w, r.x + r.w) - Math.max(c.x, r.x));
      const oy = Math.max(0, Math.min(c.y + c.h, ry + rh) - Math.max(c.y, ry));
      sum += ox * oy;
    }
    return sum;
  };
  let best = boxes[0]!;
  let bestScore = overlap(best);
  for (const c of boxes.slice(1)) {
    const s = overlap(c);
    if (s < bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best;
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
  /** Set by the watcher when no gutter is usable: the least covered corner. */
  corner?: CornerBox;
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
