import { createBoundedObserver, type BoundedObserver } from "../../extension/observer.ts";
import { MAX_SELECTORS, resolveSelectors } from "./selector.ts";

export const BLUR_ATTR = "data-skinly-blur";
export const SHARE_ATTR = "data-skinly-share";
/** The only use of `filter` in the extension. */
export const BLUR_CSS = `html[${SHARE_ATTR}="on"] [${BLUR_ATTR}="1"]{filter:blur(6px)}`;
const MEDIA = "img, video, canvas";

export interface StyleSheetHost {
  add(css: string): { remove(): void };
}

export interface BlurState {
  share: boolean;
  count: number;
  missing: number;
  images: boolean;
}

export interface BlurController {
  /** Marks the elements for these selectors (and all media when `images`). Replaces the earlier selector set. */
  setTargets(selectors: readonly string[], images: boolean): BlurState;
  /** Marks one element the user picked in pick mode. */
  mark(el: Element): void;
  unmark(el: Element): void;
  isMarked(el: Element): boolean;
  /** Share mode on blurs everything marked; off removes the blur but keeps the marks. */
  setShare(on: boolean): void;
  state(): BlurState;
  /** Removes marks, the stylesheet, the share attribute and the observer. */
  restore(): void;
}

export function createBlurController(doc: Document, style: StyleSheetHost): BlurController {
  const marked = new Set<Element>();
  let selectors: string[] = [];
  let images = false;
  let share = false;
  let missing = 0;
  let sheet: { remove(): void } | undefined;
  let observer: BoundedObserver | undefined;
  const html = doc.documentElement;

  const setMark = (el: Element, on: boolean) => {
    if (on) {
      el.setAttribute(BLUR_ATTR, "1");
      marked.add(el);
    } else {
      el.removeAttribute(BLUR_ATTR);
      marked.delete(el);
    }
  };

  /** Re-resolves selectors and media; marks added by the picker stay. */
  const reapply = () => {
    const wanted = new Set<Element>();
    const r = resolveSelectors(doc, selectors);
    r.found.forEach((el) => wanted.add(el));
    missing = r.missing;
    if (images) doc.querySelectorAll(MEDIA).forEach((el) => wanted.add(el));
    for (const el of wanted) if (!marked.has(el)) setMark(el, true);
  };

  const ensureObserver = () => {
    if (observer || !doc.body) return;
    observer = createBoundedObserver(doc, doc.body, reapply);
  };

  const state = (): BlurState => ({ share, count: marked.size, missing, images });

  return {
    setTargets(next, withImages) {
      selectors = next.slice(0, MAX_SELECTORS);
      images = withImages;
      reapply();
      ensureObserver();
      return state();
    },
    mark: (el) => setMark(el, true),
    unmark: (el) => setMark(el, false),
    isMarked: (el) => marked.has(el),
    setShare(on) {
      share = on;
      if (on) {
        sheet ??= style.add(BLUR_CSS);
        html.setAttribute(SHARE_ATTR, "on");
      } else {
        html.removeAttribute(SHARE_ATTR);
        sheet?.remove();
        sheet = undefined;
      }
    },
    state,
    restore() {
      observer?.disconnect();
      observer = undefined;
      for (const el of Array.from(marked)) setMark(el, false);
      html.removeAttribute(SHARE_ATTR);
      sheet?.remove();
      sheet = undefined;
      selectors = [];
      images = false;
      share = false;
      missing = 0;
    },
  };
}
