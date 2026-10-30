import type { ContentRect } from "./index.ts";

export type RectOf = (el: Element) => { x: number; y: number; w: number; h: number };

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
export function collectContentRects(doc: Document, getRect: RectOf, isHidden: (el: Element) => boolean = () => false): ContentRect[] {
  const out: ContentRect[] = [];
  const body = doc.body;
  if (!body) return out;
  let seen = 0;
  for (const el of Array.from(body.querySelectorAll(CONTENT))) {
    if (++seen > MAX_ELEMENTS) break;
    if (!isMedia(el) && !hasOwnText(el)) continue;
    if (ours(el)) continue;
    const r = getRect(el);
    if (r.w <= 0 || r.h <= 0 || isHidden(el)) continue;
    out.push({ x: r.x, w: r.w });
  }
  return out;
}
