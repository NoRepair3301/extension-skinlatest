import type { Failure } from "../../plan/readability.ts";

/**
 * The only page-derived data of the optional AI repair (after its own consent): for each text element that needed repair, its tag, role,
 * up to three class tokens, computed colours, the contrast number and colour-related declarations. One sanitiser builds all of it.
 * Never page text, href, id, value, URL, origin or title; selectors are not sent at all.
 */
export const REPAIR_MAX_ELEMENTS = 40;
export const REPAIR_MAX_BYTES = 6 * 1024;
const MAX_DECLS = 8;
const MAX_DECL_LENGTH = 80;
const MAX_RULES_SCANNED = 3000;
const CLASS_TOKEN = /^[a-z][a-z0-9_-]{1,29}$/i;
const ROLES = new Set(["button", "link", "navigation", "banner", "main", "complementary", "contentinfo", "heading", "listitem", "menuitem", "tab", "textbox", "dialog", "search", "article", "region", "form", "alert", "status", "img", "cell", "row"]);
const PLAIN_PROPS = new Set(["color", "background-color", "background", "border-color", "fill"]);
const COLOUR_VALUE = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|var\(--[a-z0-9_-]+\)|[a-z]+)$/i;
const BANNED = /url\s*\(|attr\s*\(|content|@import|data:|["'`\\]/i;

export interface RepairElement {
  i: number;
  tag: string;
  role: string;
  classes: string[];
  fg: string;
  bg: string;
  ratio: number;
  css: string[];
}
export interface RepairPayload {
  v: 1;
  elements: RepairElement[];
}

/** Up to three class tokens in the allowed shape; everything else is dropped. */
export function classTokens(el: Element): string[] {
  const out: string[] = [];
  for (const t of (el.getAttribute("class") ?? "").split(/\s+/)) {
    if (CLASS_TOKEN.test(t) && !out.includes(t)) out.push(t);
    if (out.length === 3) break;
  }
  return out;
}

/** "prop: value" when the declaration is colour-related and clean, otherwise null. */
export function sanitizeDeclaration(prop: string, valueIn: string): string | null {
  const name = prop.trim().toLowerCase();
  const value = valueIn.replace(/\s*!important\s*$/i, "").trim();
  if (value === "" || value.length > MAX_DECL_LENGTH || BANNED.test(value) || BANNED.test(name)) return null;
  if (PLAIN_PROPS.has(name)) return `${name}: ${value}`;
  // colour custom properties: --anything whose value is a plain colour
  if (/^--[a-z0-9_-]{1,40}$/.test(name) && COLOUR_VALUE.test(value)) return `${name}: ${value}`;
  return null;
}

/** Declarations that apply to `el` from same-origin stylesheets. A cross-origin sheet or an odd selector is skipped, never thrown. */
export function colourDeclarations(doc: Document, el: Element): string[] {
  const out: string[] = [];
  let scanned = 0;
  const sheets = Array.from(doc.styleSheets ?? []);
  for (const sheet of sheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (++scanned > MAX_RULES_SCANNED || out.length >= MAX_DECLS) return out;
      const r = rule as CSSStyleRule;
      if (typeof r.selectorText !== "string" || !r.style) continue;
      try {
        if (!el.matches(r.selectorText)) continue;
      } catch {
        continue;
      }
      for (let k = 0; k < r.style.length; k++) {
        const prop = r.style.item(k);
        const d = sanitizeDeclaration(prop, r.style.getPropertyValue(prop));
        if (d && !out.includes(d) && out.length < MAX_DECLS) out.push(d);
      }
    }
  }
  return out;
}

const roleOf = (el: Element): string => {
  const r = (el.getAttribute("role") ?? "").toLowerCase();
  return ROLES.has(r) ? r : "";
};

/** Builds the payload from the failing elements (at most 40, at most 6 KB as JSON). `targets[i]` is element i of the payload. */
export function buildRepairPayload(doc: Document, failures: readonly Failure[]): { payload: RepairPayload; targets: Element[] } {
  const elements: RepairElement[] = [];
  const targets: Element[] = [];
  for (const f of failures.slice(0, REPAIR_MAX_ELEMENTS)) {
    let css: string[] = [];
    try {
      css = colourDeclarations(doc, f.el);
    } catch {
      css = [];
    }
    const item: RepairElement = {
      i: elements.length,
      tag: /^[a-z][a-z0-9-]{0,30}$/.test(f.el.localName) ? f.el.localName : "div",
      role: roleOf(f.el),
      classes: classTokens(f.el),
      fg: f.fg,
      bg: f.bg,
      ratio: Math.round(f.ratio * 10) / 10,
      css,
    };
    // Fewer declarations before dropping the element, so the cap trims detail first.
    while (JSON.stringify({ v: 1, elements: [...elements, item] }).length > REPAIR_MAX_BYTES && item.css.length > 0) item.css.pop();
    if (JSON.stringify({ v: 1, elements: [...elements, item] }).length > REPAIR_MAX_BYTES) break;
    elements.push(item);
    targets.push(f.el);
  }
  return { payload: { v: 1, elements }, targets };
}
