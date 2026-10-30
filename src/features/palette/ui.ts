import type { PaletteItem } from "./index-items.ts";
import { rank } from "./score.ts";
import { adoptCss } from "../mount.ts";

export const MAX_SHOWN = 50;
export const OUTLINE_MS = 2000;

export interface PaletteDeps {
  doc: Document;
  /** Marks `el` for a moment; returns a function that removes the mark. */
  highlight(el: Element): () => void;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export interface Palette {
  host: HTMLElement;
  close(): void;
}

const CSS =
  ":host{all:initial}" +
  ".box{position:fixed;top:12vh;left:50%;transform:translateX(-50%);width:min(560px,92vw);z-index:2147483000;background:#fff;color:#1f2933;" +
  "border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.35);font:15px system-ui,sans-serif;overflow:hidden}" +
  "input{box-sizing:border-box;width:100%;padding:12px 14px;border:0;border-bottom:1px solid #d0d7de;font:inherit;color:inherit;background:#fff;outline:none}" +
  "input:focus-visible{box-shadow:inset 0 0 0 2px #1d4ed8}" +
  "ul{list-style:none;margin:0;padding:0;max-height:50vh;overflow:auto}" +
  "li{padding:8px 14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:default}" +
  "li[aria-selected=true]{background:#1d4ed8;color:#fff}" +
  ".empty{padding:8px 14px;color:#52606d}";

/**
 * Overlay in a shadow root. Enter scrolls to the chosen element, focuses it and outlines it for a moment.
 * It never clicks: the user presses Enter or Space on the focused element themselves.
 */
export function openPalette(deps: PaletteDeps, items: readonly PaletteItem[]): Palette {
  const { doc } = deps;
  const previous = doc.activeElement as HTMLElement | null;
  const host = doc.createElement("div");
  host.setAttribute("data-skinly-ui", "palette");
  const root = host.attachShadow({ mode: "open" });
  const box = doc.createElement("div");
  box.className = "box";
  const input = doc.createElement("input");
  input.type = "text";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-label", "Find a link or button on this page");
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-controls", "skinly-list");
  input.setAttribute("aria-autocomplete", "list");
  input.autocomplete = "off";
  const list = doc.createElement("ul");
  list.id = "skinly-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Matches");
  box.append(input, list);
  adoptCss(doc, root, CSS);
  root.append(box);

  let shown: PaletteItem[] = [];
  let selected = 0;

  const paint = () => {
    shown = rank(input.value, items).slice(0, MAX_SHOWN);
    selected = Math.min(selected, Math.max(0, shown.length - 1));
    list.replaceChildren(
      ...shown.map((item, i) => {
        const li = doc.createElement("li");
        li.id = `skinly-opt-${i}`;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", String(i === selected));
        li.textContent = item.label;
        return li;
      }),
    );
    if (shown.length === 0) {
      const none = doc.createElement("li");
      none.className = "empty";
      none.setAttribute("role", "option");
      none.setAttribute("aria-disabled", "true");
      none.setAttribute("aria-selected", "false");
      none.textContent = "No matches";
      list.append(none);
      input.removeAttribute("aria-activedescendant");
    } else {
      input.setAttribute("aria-activedescendant", `skinly-opt-${selected}`);
    }
  };

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    host.remove();
  };

  const choose = () => {
    const item = shown[selected];
    if (!item) return;
    close();
    const el = item.el as HTMLElement;
    el.scrollIntoView?.({ block: "center" });
    el.focus?.({ preventScroll: true });
    const unmark = deps.highlight(el);
    deps.setTimeout(unmark, OUTLINE_MS);
  };

  const onKey = (e: Event) => {
    const k = e as KeyboardEvent;
    switch (k.key) {
      case "ArrowDown":
        k.preventDefault();
        selected = shown.length === 0 ? 0 : (selected + 1) % shown.length;
        return paint();
      case "ArrowUp":
        k.preventDefault();
        selected = shown.length === 0 ? 0 : (selected - 1 + shown.length) % shown.length;
        return paint();
      case "Enter":
        k.preventDefault();
        return choose();
      case "Escape":
        k.preventDefault();
        close();
        previous?.focus?.({ preventScroll: true });
        return;
      case "Tab":
        // focus trap: the input is the only stop
        k.preventDefault();
        return;
    }
  };
  box.addEventListener("keydown", onKey);
  input.addEventListener("input", () => {
    selected = 0;
    paint();
  });

  paint();
  doc.documentElement.append(host);
  input.focus();
  return { host, close };
}
