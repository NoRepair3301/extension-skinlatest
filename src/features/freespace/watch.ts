import { computeGutters, pickCorner, type Gutters } from "./index.ts";
import { collectContentRects, type MeasureOptions, type RectOf } from "./measure.ts";
import { recordError } from "../../core/diag.ts";

export const RESIZE_DEBOUNCE_MS = 200;
export const MUTATION_MIN_GAP_MS = 1000;
/** Late layout (web fonts, stylesheets, app shells) changes the page without a DOM change we see, so it is measured again at these times. */
export const RECHECK_MS: readonly number[] = [1000, 3000];

export interface WatchEnv {
  doc: Document;
  win: Window;
  getRect: RectOf;
  isHidden?: (el: Element) => boolean;
  textRect?: MeasureOptions["textRect"];
  ignore?: MeasureOptions["ignore"];
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
  now(): number;
}

export interface GutterWatch {
  current(): Gutters;
  /** Measure now (used on load). */
  refresh(): void;
  destroy(): void;
}

const same = (a: Gutters, b: Gutters): boolean => a.state === b.state && a.left?.w === b.left?.w && a.right?.x === b.right?.x && a.right?.w === b.right?.w && a.corner?.x === b.corner?.x && a.corner?.y === b.corner?.y;

/**
 * Measures the gutters on start, on the window's load event, 1 s and 3 s after start, after the window resized (debounced 200 ms) and
 * after DOM changes (at most once per second). `onChange` fires only when the result differs. A failed measurement is recorded and
 * keeps the last result; it never throws into the page.
 */
export function watchGutters(env: WatchEnv, onChange: (g: Gutters) => void): GutterWatch {
  const { doc, win } = env;
  let latest: Gutters = { state: "none" };
  let alive = true;
  let resizeTimer: number | undefined;
  let mutTimer: number | undefined;
  let lastMut = -Infinity;

  const measure = (): Gutters => {
    const vw = win.innerWidth;
    const dw = doc.documentElement.scrollWidth || vw;
    const rects = collectContentRects(doc, env.getRect, env.isHidden, { viewport: { w: vw, h: win.innerHeight }, ...(env.textRect ? { textRect: env.textRect } : {}), ...(env.ignore ? { ignore: env.ignore } : {}) });
    const g = computeGutters(rects, vw, dw);
    if (g.state !== "ok") {
      const corner = pickCorner(rects, vw, win.innerHeight);
      if (corner) g.corner = corner;
    }
    return g;
  };
  const refresh = () => {
    if (!alive) return;
    let next: Gutters;
    try {
      next = measure();
    } catch {
      recordError("scene-measure");
      return;
    }
    if (!same(next, latest)) {
      latest = next;
      onChange(next);
    }
  };

  const onResize = () => {
    if (resizeTimer !== undefined) env.clearTimeout(resizeTimer);
    resizeTimer = env.setTimeout(() => {
      resizeTimer = undefined;
      refresh();
    }, RESIZE_DEBOUNCE_MS);
  };
  win.addEventListener("resize", onResize);

  const mo = new (win as unknown as { MutationObserver: typeof MutationObserver }).MutationObserver(() => {
    if (!alive || mutTimer !== undefined) return;
    const wait = Math.max(0, MUTATION_MIN_GAP_MS - (env.now() - lastMut));
    mutTimer = env.setTimeout(() => {
      mutTimer = undefined;
      lastMut = env.now();
      refresh();
    }, wait);
  });
  mo.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true });

  const rechecks = RECHECK_MS.map((ms) => env.setTimeout(refresh, ms));
  const onLoad = () => refresh();
  if (doc.readyState !== "complete") win.addEventListener("load", onLoad, { once: true });

  refresh();

  return {
    current: () => latest,
    refresh,
    destroy() {
      alive = false;
      win.removeEventListener("resize", onResize);
      win.removeEventListener("load", onLoad);
      for (const id of rechecks) env.clearTimeout(id);
      mo.disconnect();
      if (resizeTimer !== undefined) env.clearTimeout(resizeTimer);
      if (mutTimer !== undefined) env.clearTimeout(mutTimer);
    },
  };
}
