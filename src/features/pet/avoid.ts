import type { Corner, Size } from "./overlay.ts";
import { MARGIN_PX, SIZE_PX } from "./overlay.ts";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Viewport {
  w: number;
  h: number;
}

export const CORNERS: readonly Corner[] = ["bottom-right", "bottom-left", "top-right", "top-left"];

/** Where the pet sits for a corner, size and viewport. */
export function petBox(corner: Corner, size: Size, vp: Viewport): Box {
  const px = SIZE_PX[size];
  return {
    x: corner.endsWith("right") ? vp.w - MARGIN_PX - px : MARGIN_PX,
    y: corner.startsWith("bottom") ? vp.h - MARGIN_PX - px : MARGIN_PX,
    w: px,
    h: px,
  };
}

export const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Pure. Keeps the current corner when it is free, otherwise the first free corner, otherwise the current one. */
export function nextCorner(current: Corner, size: Size, vp: Viewport, obstacles: readonly Box[]): Corner {
  const free = (c: Corner): boolean => {
    const box = petBox(c, size, vp);
    return !obstacles.some((o) => overlaps(box, o));
  };
  if (free(current)) return current;
  return CORNERS.find((c) => c !== current && free(c)) ?? current;
}

export type RectOf = (el: Element) => Box;

const FIELDS = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select';
const SUBMITS = 'button[type="submit"], input[type="submit"], form button:not([type])';
const DIALOGS = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]';
const CLOSE = /close|dismiss/i;
const MAX_CHECKED = 300;

const inView = (b: Box, vp: Viewport): boolean => b.w > 0 && b.h > 0 && b.x < vp.w && b.y < vp.h && b.x + b.w > 0 && b.y + b.h > 0;

/**
 * Boxes the pet must not cover: password inputs, submit buttons, visible modal close controls and form fields in view.
 * Reads attributes and rectangles only; nothing is stored or sent.
 */
export function collectObstacles(doc: Document, vp: Viewport, rectOf: RectOf): Box[] {
  const out: Box[] = [];
  const add = (el: Element) => {
    const b = rectOf(el);
    if (inView(b, vp)) out.push(b);
  };
  for (const el of Array.from(doc.querySelectorAll(FIELDS)).slice(0, MAX_CHECKED)) add(el);
  for (const el of Array.from(doc.querySelectorAll(SUBMITS)).slice(0, MAX_CHECKED)) add(el);
  for (const dialog of Array.from(doc.querySelectorAll(DIALOGS)).slice(0, 10)) {
    for (const el of Array.from(dialog.querySelectorAll("button, [role=\"button\"], a")).slice(0, MAX_CHECKED)) {
      const label = `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""} ${el.className && typeof el.className === "string" ? el.className : ""}`;
      if (CLOSE.test(label)) add(el);
    }
  }
  return out;
}
