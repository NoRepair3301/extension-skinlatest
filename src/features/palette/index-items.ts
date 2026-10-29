export const MAX_ITEMS = 500;
export const MAX_LABEL = 80;

export interface PaletteItem {
  el: Element;
  label: string;
}

export interface IndexDeps {
  isVisible(el: Element): boolean;
}

const SELECTOR = 'a[href], button, [role="button"], summary, [role="tab"]';

const clean = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

/** Text first, then aria-label, then title; trimmed to MAX_LABEL characters. */
export function labelOf(el: Element): string {
  const raw = clean(el.textContent) || clean(el.getAttribute("aria-label")) || clean(el.getAttribute("title"));
  return raw.length > MAX_LABEL ? `${raw.slice(0, MAX_LABEL - 1)}…` : raw;
}

export const defaultIsVisible = (el: Element): boolean => {
  const win = el.ownerDocument.defaultView;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const s = win?.getComputedStyle(el);
  return !s || (s.visibility !== "hidden" && s.display !== "none");
};

/**
 * Visible links and controls in document order, at most MAX_ITEMS. An element matched by two selectors appears once;
 * different elements with the same label all stay. Labels live in memory only.
 */
export function indexItems(doc: Document, deps: IndexDeps = { isVisible: defaultIsVisible }): PaletteItem[] {
  const out: PaletteItem[] = [];
  for (const el of Array.from(doc.querySelectorAll(SELECTOR))) {
    if (out.length >= MAX_ITEMS) break;
    if (el.closest("[data-skinly-ui]")) continue;
    if (!deps.isVisible(el)) continue;
    const label = labelOf(el);
    if (label !== "") out.push({ el, label });
  }
  return out;
}
