import { createBoundedObserver, type BoundedObserver } from "../../extension/observer.ts";
import { adoptCss } from "../mount.ts";

export const PAGE_BLUR_HOST = "blur-page";
/** Highest z-index a page can have. This is a deliberate full-viewport privacy veil, unlike the pet's bounded one. */
export const PAGE_BLUR_Z = 2147483647;

/**
 * The veil is a backdrop-filter, the only blur besides the picked-element template in apply.ts (scripts/rules.ts allows both
 * only under src/features/blur/). The host and the veil ignore the pointer; only the Unblur button receives it.
 */
const CSS =
  ":host{all:initial}" +
  ".veil{position:fixed;top:0;left:0;right:0;bottom:0;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);pointer-events:none}" +
  "button{position:fixed;top:12px;right:12px;pointer-events:auto;font:600 13px/1.2 system-ui,sans-serif;padding:6px 12px;border-radius:8px;border:2px solid #1d4ed8;background:#fff;color:#111827;cursor:pointer}" +
  "button:focus-visible{outline:3px solid #1d4ed8;outline-offset:2px}";

export interface PageBlur {
  /** Idempotent. */
  on(): void;
  /** Idempotent. */
  off(): void;
  toggle(): boolean;
  isOn(): boolean;
  /** Same as off(). */
  destroy(): void;
}

export interface PageBlurOptions {
  /** Called when the Unblur button turns the veil off. */
  onUnblur?: () => void;
}

export function createPageBlur(doc: Document, opts: PageBlurOptions = {}): PageBlur {
  let host: HTMLElement | undefined;
  let observer: BoundedObserver | undefined;

  const build = (): HTMLElement => {
    const el = doc.createElement("div");
    el.setAttribute("data-skinly-ui", PAGE_BLUR_HOST);
    const s = el.style;
    s.setProperty("all", "initial");
    s.setProperty("position", "fixed");
    s.setProperty("top", "0");
    s.setProperty("left", "0");
    s.setProperty("right", "0");
    s.setProperty("bottom", "0");
    s.setProperty("pointer-events", "none");
    s.setProperty("z-index", String(PAGE_BLUR_Z));
    const root = el.attachShadow({ mode: "open" });
    const veil = doc.createElement("div");
    veil.className = "veil";
    const button = doc.createElement("button");
    button.type = "button";
    button.textContent = "Unblur";
    button.setAttribute("aria-label", "Unblur the page");
    button.addEventListener("click", () => {
      api.off();
      opts.onUnblur?.();
    });
    adoptCss(doc, root, CSS);
    root.append(veil, button);
    return el;
  };

  /** Puts the host back if the page removed it. Bounded by the observer (debounced, at most 5 checks a minute). */
  const reattach = (): void => {
    if (host && !host.isConnected) doc.documentElement.appendChild(host);
  };

  const api: PageBlur = {
    on() {
      if (host) return;
      host = build();
      doc.documentElement.appendChild(host);
      observer = createBoundedObserver(doc, doc.documentElement, reattach);
    },
    off() {
      observer?.disconnect();
      observer = undefined;
      host?.remove();
      host = undefined;
    },
    toggle() {
      if (host) api.off();
      else api.on();
      return host !== undefined;
    },
    isOn: () => host !== undefined,
    destroy: () => api.off(),
  };
  return api;
}
