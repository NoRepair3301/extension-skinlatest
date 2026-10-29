export const MAX_SELECTORS = 50;
const MAX_DEPTH = 6;
const MAX_CLASSES = 2;
const CLASS_OK = /^[a-z][a-z0-9_-]{1,30}$/;

const segment = (el: Element): string => {
  const tag = el.localName;
  const classes = Array.from(el.classList)
    .filter((c) => CLASS_OK.test(c) && !/^[0-9_-]+$/.test(c) && !c.startsWith("skinly"))
    .slice(0, MAX_CLASSES)
    .map((c) => `.${c}`)
    .join("");
  const parent = el.parentElement;
  let n = 1;
  if (parent) {
    for (const sib of Array.from(parent.children)) {
      if (sib === el) break;
      if (sib.localName === tag) n++;
    }
  }
  return `${tag}${classes}:nth-of-type(${n})`;
};

/**
 * A selector made of tag names, at most two sanitised classes per level and `:nth-of-type` positions,
 * at most six levels up from the element. Never ids, attributes or text.
 */
export function buildSelector(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.localName !== "html" && parts.length < MAX_DEPTH) {
    parts.unshift(segment(cur));
    if (cur.localName === "body") break;
    cur = cur.parentElement;
  }
  return parts.join(" > ");
}

export interface Resolved {
  found: Element[];
  missing: number;
}

/** Resolves saved selectors (at most 50). A selector that matches nothing, or is invalid, counts as not found. */
export function resolveSelectors(doc: Document, selectors: readonly string[]): Resolved {
  const found: Element[] = [];
  let missing = 0;
  for (const s of selectors.slice(0, MAX_SELECTORS)) {
    let el: Element | null = null;
    try {
      el = doc.querySelector(s);
    } catch {
      el = null;
    }
    if (el && !found.includes(el)) found.push(el);
    else if (!el) missing++;
  }
  return { found, missing };
}

export const summary = (blurred: number, missing: number): string => `${blurred} blurred, ${missing} not found`;

/** Adds a selector keeping the cap and no duplicates; returns false when the list is full. */
export function addSelector(list: string[], selector: string): boolean {
  if (list.includes(selector)) return true;
  if (list.length >= MAX_SELECTORS) return false;
  list.push(selector);
  return true;
}
