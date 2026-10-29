import type { BlurController } from "./apply.ts";
import { addSelector, buildSelector, MAX_SELECTORS } from "./selector.ts";

export const PICK_BANNER = "Pick mode: click what you want to blur. Press Escape or Done to finish.";

export interface PickDeps {
  doc: Document;
  blur: BlurController;
  /** Selectors picked so far (shared with the caller so they can be saved). */
  selectors: string[];
  onChange?(): void;
}

export interface PickSession {
  stop(): void;
  active(): boolean;
}

const ours = (el: Element | null): boolean => !!el?.closest("[data-skinly-ui]");

/**
 * Pick mode. Hover outlines the element under the pointer (a data attribute plus our own overlay box),
 * a click toggles its blur mark and never reaches the site. Escape or Done removes every listener and the banner.
 */
export function startPick(deps: PickDeps): PickSession {
  const { doc, blur } = deps;
  const win = doc.defaultView!;
  let live = true;

  const host = doc.createElement("div");
  host.setAttribute("data-skinly-ui", "pick");
  const root = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent =
    ":host{all:initial}.bar{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483000;display:flex;gap:10px;align-items:center;" +
    "padding:8px 12px;border-radius:8px;background:#1f2933;color:#fff;font:13px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.35)}" +
    "button{font:inherit;padding:3px 10px;border-radius:5px;cursor:pointer}" +
    ".box{position:fixed;pointer-events:none;border:2px solid #1d4ed8;background:rgba(29,78,216,.12);z-index:2147482999}";
  const bar = doc.createElement("div");
  bar.className = "bar";
  bar.setAttribute("role", "status");
  const text = doc.createElement("span");
  text.textContent = PICK_BANNER;
  const done = doc.createElement("button");
  done.type = "button";
  done.textContent = "Done";
  done.setAttribute("aria-label", "Done picking");
  bar.append(text, done);
  const box = doc.createElement("div");
  box.className = "box";
  box.style.display = "none";
  root.append(style, box, bar);

  const outline = (el: Element | undefined) => {
    if (!el) {
      box.style.display = "none";
      return;
    }
    const r = el.getBoundingClientRect();
    box.style.cssText = `display:block;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
  };

  const onMove = (e: Event) => {
    const t = e.target as Element | null;
    outline(t && !ours(t) ? t : undefined);
  };

  const onClick = (e: Event) => {
    const t = e.target as Element | null;
    if (!t || ours(t)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const sel = buildSelector(t);
    if (blur.isMarked(t)) {
      blur.unmark(t);
      const i = deps.selectors.indexOf(sel);
      if (i >= 0) deps.selectors.splice(i, 1);
    } else if (deps.selectors.length < MAX_SELECTORS || deps.selectors.includes(sel)) {
      blur.mark(t);
      addSelector(deps.selectors, sel);
    }
    deps.onChange?.();
  };

  // Other pointer events must not trigger the site's own handlers while picking.
  const swallow = (e: Event) => {
    const t = e.target as Element | null;
    if (t && !ours(t)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const onKey = (e: Event) => {
    if ((e as KeyboardEvent).key === "Escape") stop();
  };

  const types = ["mousedown", "mouseup", "pointerdown", "pointerup", "auxclick", "contextmenu", "submit"] as const;
  doc.addEventListener("mousemove", onMove, true);
  doc.addEventListener("click", onClick, true);
  doc.addEventListener("keydown", onKey, true);
  for (const t of types) doc.addEventListener(t, swallow, true);
  done.addEventListener("click", () => stop());
  const onScroll = () => outline(undefined);
  win.addEventListener("scroll", onScroll, true);
  doc.documentElement.append(host);

  function stop() {
    if (!live) return;
    live = false;
    doc.removeEventListener("mousemove", onMove, true);
    doc.removeEventListener("click", onClick, true);
    doc.removeEventListener("keydown", onKey, true);
    for (const t of types) doc.removeEventListener(t, swallow, true);
    win.removeEventListener("scroll", onScroll, true);
    host.remove();
  }

  return { stop, active: () => live };
}
