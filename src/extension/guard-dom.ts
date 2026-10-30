import type { GuardProvider, GuardStyle } from "../plan/guard.ts";

const SKIP_TEXT = new Set(["script", "style", "noscript", "template", "textarea", "option", "title"]);
const WALK_CAP = 6000;
const BG_SCAN_CAP = 1500;
const MEDIA_SELECTOR = "img, picture, video, canvas, svg, iframe";
const EDITABLE_SELECTOR =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]):not([type="range"]):not([type="color"]):not([type="file"]), textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';

/** The real style provider: computed style and layout of this document, read only, every walk bounded. */
export function domGuardProvider(doc: Document): GuardProvider {
  const win = doc.defaultView!;
  const style = (el: Element): GuardStyle => {
    const s = win.getComputedStyle(el);
    return { color: s.color, backgroundColor: s.backgroundColor, backgroundImage: s.backgroundImage, caretColor: s.caretColor, display: s.display, visibility: s.visibility, opacity: s.opacity, filter: s.filter };
  };
  const area = (el: Element): number => {
    const r = el.getBoundingClientRect();
    return r.width * r.height;
  };
  const inView = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < win.innerHeight && r.left < win.innerWidth;
  };
  const ours = (el: Element): boolean => el.closest("[data-skinly-ui]") !== null;
  const root = (): Element => doc.body ?? doc.documentElement;

  return {
    style,
    parentOf: (el) => el.parentElement,
    textParents(max) {
      const out = new Set<Element>();
      const walker = doc.createTreeWalker(root(), 4 /* SHOW_TEXT */);
      for (let n = walker.nextNode(), i = 0; n && i < WALK_CAP && out.size < max; n = walker.nextNode(), i++) {
        const parent = n.parentElement;
        if (!parent || out.has(parent) || SKIP_TEXT.has(parent.localName) || (n.nodeValue ?? "").trim() === "") continue;
        if (!inView(parent) || ours(parent)) continue;
        const s = style(parent);
        if (s.visibility === "hidden" || s.display === "none") continue;
        out.add(parent);
      }
      return [...out];
    },
    editables: (max) =>
      Array.from(doc.querySelectorAll(EDITABLE_SELECTOR))
        .filter((el) => inView(el) && !ours(el))
        .slice(0, max),
    media(max) {
      const found: Array<{ el: Element; a: number }> = [];
      for (const el of Array.from(doc.querySelectorAll(MEDIA_SELECTOR)).slice(0, BG_SCAN_CAP)) if (inView(el)) found.push({ el, a: area(el) });
      for (const el of Array.from(root().querySelectorAll("*")).slice(0, BG_SCAN_CAP)) {
        if (el.matches(MEDIA_SELECTOR) || !inView(el) || ours(el)) continue;
        if (win.getComputedStyle(el).backgroundImage !== "none") found.push({ el, a: area(el) });
      }
      for (const el of [doc.body, doc.documentElement]) if (el && win.getComputedStyle(el).backgroundImage !== "none") found.push({ el, a: area(el) });
      return found.sort((x, y) => y.a - x.a).slice(0, max).map((f) => f.el);
    },
  };
}
