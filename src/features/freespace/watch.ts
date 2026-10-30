import { computeGutters, type Gutters } from "./index.ts";
import { collectContentRects, type RectOf } from "./measure.ts";

export const RESIZE_DEBOUNCE_MS = 200;
export const MUTATION_MIN_GAP_MS = 1000;

export interface WatchEnv {
  doc: Document;
  win: Window;
  getRect: RectOf;
  isHidden?: (el: Element) => boolean;
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

const same = (a: Gutters, b: Gutters): boolean => a.state === b.state && a.left?.w === b.left?.w && a.right?.x === b.right?.x && a.right?.w === b.right?.w;

/**
 * Measures the gutters on start, after the window resized (debounced 200 ms) and after DOM changes (at most once per second).
 * `onChange` fires only when the result differs.
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
    return computeGutters(collectContentRects(doc, env.getRect, env.isHidden), vw, dw);
  };
  const refresh = () => {
    if (!alive) return;
    const next = measure();
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
  if (doc.body) mo.observe(doc.body, { childList: true, subtree: true });

  refresh();

  return {
    current: () => latest,
    refresh,
    destroy() {
      alive = false;
      win.removeEventListener("resize", onResize);
      mo.disconnect();
      if (resizeTimer !== undefined) env.clearTimeout(resizeTimer);
      if (mutTimer !== undefined) env.clearTimeout(mutTimer);
    },
  };
}
