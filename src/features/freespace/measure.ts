import type { ContentRect } from "./index.ts";

export type RectOf = (el: Element) => { x: number; y: number; w: number; h: number };

/** Optional helpers that make the measure accurate on app-style pages. All are injected so the module stays testable. */
export interface MeasureOptions {
  viewport?: { w: number; h: number };
  /** Rectangle of just the text an element holds (so a full-width block with a short label counts as its label). */
  textRect?: (el: Element) => { x: number; y: number; w: number; h: number } | undefined;
  /** True for slim fixed or sticky bars (toolbars, headers): the side lanes pass beside or behind them. */
  ignore?: (el: Element, rect: { x: number; y: number; w: number; h: number }) => boolean;
}

/** Anything smaller than this is a hidden skip link, a spacer or a screen-reader-only node, not content. */
const MIN_SIDE = 4;

const CONTENT = "a,button,input,select,textarea,img,svg,video,canvas,iframe,picture,table,h1,h2,h3,h4,h5,h6,p,li,td,th,label,summary,pre,code,blockquote,figcaption,span,b,i,em,strong,small,dt,dd";
const MAX_ELEMENTS = 2500;

const ours = (el: Element): boolean => el.closest("[data-skinly-ui],[data-skinly-scene]") !== null;

const hasOwnText = (el: Element): boolean => {
  for (const n of Array.from(el.childNodes)) if (n.nodeType === 3 && (n.textContent ?? "").trim().length > 0) return true;
  return false;
};

const isMedia = (el: Element): boolean => /^(?:img|svg|video|canvas|iframe|picture|table|input|select|textarea|button|a)$/i.test(el.tagName);

/**
 * Content rectangles of the visible elements that carry text, links, form controls, images or media.
 * Empty wrappers (a full-width div that only holds other elements) do not count. Our own hosts are skipped.
 * Reads rectangles and attributes only; nothing is stored. `getRect` is injected so the module is testable.
 */
export function collectContentRects(doc: Document, getRect: RectOf, isHidden: (el: Element) => boolean = () => false, opts: MeasureOptions = {}): ContentRect[] {
  const out: ContentRect[] = [];
  const body = doc.body;
  if (!body) return out;
  let seen = 0;
  for (const el of Array.from(body.querySelectorAll(CONTENT))) {
    if (++seen > MAX_ELEMENTS) break;
    if (!isMedia(el) && !hasOwnText(el)) continue;
    if (ours(el)) continue;
    let r = getRect(el);
    if (r.w < MIN_SIDE || r.h < MIN_SIDE || isHidden(el)) continue;
    const vp = opts.viewport;
    if (vp) {
      // Off to the side, or far above or below the part of the page that is on screen: not part of what the lanes sit beside.
      if (r.x + r.w <= 0 || r.x >= vp.w || r.y + r.h < -vp.h || r.y > vp.h * 2) continue;
    }
    if (opts.ignore?.(el, r)) continue;
    if (!isMedia(el)) {
      const t = opts.textRect?.(el);
      if (t && t.w > 0 && t.h > 0) r = t;
    }
    const x = vp ? Math.max(0, r.x) : r.x;
    const right = vp ? Math.min(vp.w, r.x + r.w) : r.x + r.w;
    if (right - x < MIN_SIDE) continue;
    out.push({ x, w: right - x, y: r.y, h: r.h });
  }
  return out;
}
