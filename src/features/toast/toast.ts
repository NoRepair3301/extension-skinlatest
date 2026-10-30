export const TOAST_MS = 2000;
export const TOAST_HOST = "toast";
/** Below the pet and the page-blur veil, above ordinary page content. */
const Z = 2147482999;

const CSS =
  ":host{all:initial}" +
  ".t{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(90vw,28rem);padding:10px 16px;border-radius:10px;" +
  "background:#111827;color:#fff;border:1px solid #374151;font:600 14px/1.3 system-ui,sans-serif;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.35)}";

export interface ToasterEnv {
  doc: Document;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export interface Toaster {
  /** Shows `text` for two seconds, replacing a toast that is still showing. */
  show(text: string): void;
  /** True while a toast is on screen. */
  visible(): boolean;
}

/**
 * Extension-owned feedback for keyboard commands: one fixed host with a shadow root, no pointer events, no focus,
 * removed after 2 s. The text is one of our own fixed strings (src/ai/messages.ts TOAST), never page content.
 */
export function createToaster(env: ToasterEnv): Toaster {
  let host: HTMLElement | undefined;
  let timer: number | undefined;

  const hide = (): void => {
    if (timer !== undefined) env.clearTimeout(timer);
    timer = undefined;
    host?.remove();
    host = undefined;
  };

  return {
    show(text) {
      hide();
      const { doc } = env;
      const el = doc.createElement("div");
      el.setAttribute("data-skinly-ui", TOAST_HOST);
      el.style.setProperty("all", "initial");
      el.style.setProperty("position", "fixed");
      el.style.setProperty("pointer-events", "none");
      el.style.setProperty("z-index", String(Z));
      const root = el.attachShadow({ mode: "open" });
      const style = doc.createElement("style");
      style.textContent = CSS;
      const box = doc.createElement("div");
      box.className = "t";
      box.setAttribute("role", "status");
      box.setAttribute("aria-live", "polite");
      box.textContent = text.slice(0, 80);
      root.append(style, box);
      doc.documentElement.appendChild(el);
      host = el;
      timer = env.setTimeout(hide, TOAST_MS);
    },
    visible: () => host !== undefined,
  };
}

export const browserToasterEnv = (win: Window): ToasterEnv => ({
  doc: win.document,
  setTimeout: (fn, ms) => win.setTimeout(fn, ms),
  clearTimeout: (id) => win.clearTimeout(id),
});
