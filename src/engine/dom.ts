import type { Tokens } from "../plan/schema.ts";
import type { Theme } from "../themes/index.ts";
import { isDark } from "../plan/contrast.ts";
import { luminance, over, parseRgb, toHex, type RGBA } from "./color.ts";
import { makeTransform, type Backdrop, type NativeLook, type Role } from "./transform.ts";

export interface EngineInstance {
  apply(): void;
  restore(): void;
  isActive(): boolean;
  nativeLook(): NativeLook;
  modifiedCount(): number;
}

export interface StyleHandle {
  remove(): void;
  isAttached(): boolean;
}

export interface StyleHost {
  add(css: string): StyleHandle;
}

export interface EngineOptions {
  timeSliceMs?: number;
  batchSize?: number;
  styleHost?: StyleHost;
}

const SKIP_TAGS = new Set([
  "script", "style", "link", "meta", "head", "title", "noscript", "template", "br", "wbr",
  "source", "track", "param", "area", "base", "defs", "clippath", "mask", "lineargradient",
  "radialgradient", "stop", "pattern", "symbol", "filter",
  // Media elements: never touch image/video/canvas pixels
  "img", "video", "canvas", "picture", "audio", "embed", "object"
]);

const SIDES = ["top", "right", "bottom", "left"] as const;
const EVT = ["mouseover", "mouseout", "focusin", "focusout", "change"] as const;

const OBSERVER_OPTS: MutationObserverInit = {
  subtree: true,
  childList: true,
  attributes: true,
  attributeOldValue: true,
  attributeFilter: [
    "class", "style", "hidden", "disabled", "open", "aria-expanded",
    "aria-selected", "aria-pressed", "data-theme", "data-mode", "data-state"
  ],
};

const COLOR_ATTR_RE = /color|background|border|outline|fill|stroke|^--/i;
const GRADIENT_COLOR_RE = /rgba?\([^)]+\)|hsla?\([^)]+\)|#(?:[0-9a-fA-F]{3,8})\b/gi;
// Gradient stops as a backdrop; `transparent` matters there (a fade to the colour below).
const STOP_RE = /rgba?\([^)]+\)|hsla?\([^)]+\)|#(?:[0-9a-fA-F]{3,8})\b|\btransparent\b/gi;
// Media painted as a child layer can be the backdrop of the element's text (a hero video or picture).
const MEDIA_TAGS = new Set(["img", "video", "canvas", "picture", "embed", "object"]);

const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };
const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 };

/** The darkest and lightest colour that can show at a point; `image` when unseen pixels are part of it. */
interface Span {
  lo: RGBA;
  hi: RGBA;
  image: boolean;
}

/** One background layer: its colours (a solid colour has one, a gradient its stops), or null for unseen pixels. */
type Layer = RGBA[] | null;

const UNSEEN: Span = { lo: BLACK, hi: WHITE, image: true };

function spanOf(colors: RGBA[], image: boolean): Span {
  let lo = colors[0]!;
  let hi = lo;
  let llo = luminance(lo);
  let lhi = llo;
  for (const c of colors) {
    const l = luminance(c);
    if (l < llo) [lo, llo] = [c, l];
    if (l > lhi) [hi, lhi] = [c, l];
  }
  return { lo, hi, image };
}

const opaque = (layer: Layer): boolean => layer === null || layer.every((c) => c.a >= 0.999);

function paintOver(layer: Layer, below: Span): Span {
  if (layer === null) return UNSEEN;
  const out: RGBA[] = [];
  let seeThrough = false;
  for (const c of layer) {
    if (c.a >= 0.999) {
      out.push(c);
    } else {
      seeThrough = true;
      out.push(over(c, below.lo), over(c, below.hi));
    }
  }
  return spanOf(out, seeThrough && below.image);
}

// Splits a computed list value at top-level commas (gradients carry commas inside parentheses).
function splitTop(v: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < v.length; i++) {
    const ch = v[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      out.push(v.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(v.slice(start).trim());
  return out;
}

interface PropRecord {
  o: string; // original inline value ("" if the property had none)
  p: string; // original priority ("" or "important")
  m: string; // value the engine wrote, as read back from the element (normalised)
}

interface ElementRecord {
  hadStyleAttr: boolean; // style attribute present before the engine's first write (re-based if the page drops it)
  origStyleText: string | null; // that attribute's exact text (null when there was none)
  props: Record<string, PropRecord>;
  written: number; // marker: ENGINE_PROPS bits written here since the record began (only grows)
  pageOrig: Map<string, [string, string]>; // marker: page-owned inline value/priority of each written prop that had one
}

// One constant per on-page name, so the Stage 6 rename changes each in one place.
export const ROOT_MARK = "data-skinly";
export const ENGINE_MARK = "data-skinly-engine";
// First rule of the engine's base sheet. It never matches (nothing sets that attribute); it lets a
// fresh instance find the sheet without guessing from the theme rules that follow it.
export const ENGINE_SHEET_SIGNATURE = `html[${ENGINE_MARK}-sheet]`;
// Every non-custom property put() writes. The index is the marker bit, so this is an on-page format:
// append only. Custom properties are written only where the page had them inline, so the marker
// always lists them with their originals.
export const ENGINE_PROPS = [
  "color", "background-color", "background-image",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "outline-color", "text-decoration-color", "fill", "stroke", "transition",
] as const;
// Longest marker value written. Past it the style text is dropped, then the originals ("*" flag).
export const MARK_CAP = 1024;

const PROP_BIT = new Map<string, number>(ENGINE_PROPS.map((p, i) => [p, 1 << i]));

/**
 * Marker value (D4), all a fresh instance needs once the in-memory ledger is gone:
 *   <written base36>["-" no style attribute originally]["*" originals dropped]
 *   then per page-owned original: ";" prop ["!" if important] "=" value
 *   then optionally ";=" original style attribute text, only when it is not already in canonical form.
 * Names, values and text escape only % ; = ! as %XX.
 */
interface Mark {
  written: number;
  noStyle: boolean;
  orig: Map<string, [string, string]>;
  text: string | null;
}

const esc = (s: string): string => s.replace(/[%;=!]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

function canonicalStyle(el: Element, text: string): boolean {
  const scratch = el.ownerDocument.createElement("div");
  scratch.style.cssText = text;
  return scratch.style.cssText === text;
}

function encodeMark(el: Element, r: ElementRecord): string {
  const head = r.written.toString(36) + (r.hadStyleAttr ? "" : "-");
  let body = "";
  for (const [prop, [v, p]] of r.pageOrig) body += ";" + esc(prop) + (p === "important" ? "!" : "") + "=" + esc(v);
  if (head.length + body.length > MARK_CAP) return head + "*";
  const t = r.origStyleText;
  if (t === null || head.length + body.length + t.length + 2 > MARK_CAP || canonicalStyle(el, t)) return head + body;
  const text = ";=" + esc(t);
  return head.length + body.length + text.length > MARK_CAP ? head + body : head + body + text;
}

function decodeMark(raw: string): Mark | null {
  const parts = raw.split(";");
  const h = /^([0-9a-z]{1,4})(-?)(\*?)$/.exec(parts[0]!);
  if (!h) return null;
  const mark: Mark = { written: parseInt(h[1]!, 36), noStyle: h[2] === "-", orig: new Map(), text: null };
  try {
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]!;
      const eq = part.indexOf("=");
      if (eq < 0) return null;
      const value = decodeURIComponent(part.slice(eq + 1));
      let name = part.slice(0, eq);
      if (name === "") {
        mark.text = value;
        continue;
      }
      const important = name.endsWith("!");
      if (important) name = name.slice(0, -1);
      mark.orig.set(decodeURIComponent(name), [value, important ? "important" : ""]);
    }
  } catch {
    return null;
  }
  return mark;
}

// Realm-safe: elements of a same-origin iframe are instances of their own window's classes,
// not the top window's.
function isHtml(el: Element): el is HTMLElement {
  const v = el.ownerDocument.defaultView;
  return v !== null && el instanceof v.HTMLElement;
}

function isSvg(el: Element): el is SVGElement {
  const v = el.ownerDocument.defaultView;
  return v !== null && el instanceof v.SVGElement;
}

function isStyled(el: Element): el is HTMLElement | SVGElement {
  return isHtml(el) || isSvg(el);
}

// The element whose computed values this one inherits by default: its parent, or for the top level
// of a shadow root, the host.
function parentOf(el: Element): Element | null {
  return el.parentElement || ((el.getRootNode?.() as ShadowRoot)?.host as Element) || null;
}

function depthOf(el: Element): number {
  let d = 0;
  for (let n = parentOf(el); n; n = parentOf(n)) d++;
  return d;
}

// Computed colours as the DOM serialises them; alpha may round differently from toCss.
function sameColor(a: string, b: string): boolean {
  if (a === b) return true;
  const x = parseRgb(a);
  const y = parseRgb(b);
  return x !== null && y !== null && x.r === y.r && x.g === y.g && x.b === y.b && Math.abs(x.a - y.a) < 0.01;
}

/** A property skipped because it equals the parent's value; checked once the parent's writes are in. */
interface Follow {
  el: HTMLElement | SVGElement;
  prop: string;
  val: string;
  role: Role;
  bd: Backdrop; // the element's own effective backdrop
  own: boolean; // it paints a background of its own, so its backdrop may differ from its parent's
  painted: boolean; // `val` is the settled (already themed) value of a parent outside the batch
}

/** An element's effective backdrop within one batch. */
interface Resolved {
  span: Span;
  bd: Backdrop;
  own: boolean;
  key: string; // its own layers as they will be painted; a change means the text below needs a new look
  pending: boolean; // a layer comes from an ancestor still queued, so it is not painted yet
}

/** Reads shared by one batch. The read phase has no writes, so cached computed styles stay true. */
interface BatchCtx {
  inBatch: Set<Element>;
  styles: Map<Element, CSSStyleDeclaration>;
  seen: Map<Element, Resolved>;
}

function declarations(st: CSSStyleDeclaration): Map<string, [string, string]> {
  const out = new Map<string, [string, string]>();
  for (let i = 0; i < st.length; i++) {
    const prop = st[i]!;
    out.set(prop, [st.getPropertyValue(prop), st.getPropertyPriority(prop)]);
  }
  return out;
}

function sameDeclarations(a: Map<string, [string, string]>, b: Map<string, [string, string]>): boolean {
  if (a.size !== b.size) return false;
  for (const [prop, [v, p]] of a) {
    const o = b.get(prop);
    if (!o || o[0] !== v || o[1] !== p) return false;
  }
  return true;
}

// Any CSSOM edit re-serialises the attribute, so per-property restore alone cannot give
// byte-exact markup. Write the original text back only when it means exactly what is there now.
function restoreStyleText(el: HTMLElement | SVGElement, text: string): void {
  const attr = el.getAttributeNode("style");
  if (!attr || attr.value === text) return;
  const scratch = el.ownerDocument.createElement("div");
  scratch.style.cssText = text;
  const have = declarations(el.style);
  if (!sameDeclarations(declarations(scratch.style), have)) return;
  attr.value = text;
  // A strict page CSP may refuse a style attribute write; then put the same declarations back via CSSOM.
  if (sameDeclarations(declarations(el.style), have)) return;
  el.style.cssText = "";
  for (const [prop, [v, p]] of have) el.style.setProperty(prop, v, p);
}

// D4 fresh-instance undo of one element. Without `m` a property still `important` is taken as the
// engine's write; one that is not (or is gone) is the page's and stays. Only listed properties and
// custom properties the marker names are touched (I3).
function undoMark(el: Element): void {
  const m = decodeMark(el.getAttribute(ENGINE_MARK) ?? "");
  if (m && isStyled(el)) {
    const st = el.style;
    const props: string[] = ENGINE_PROPS.filter((p) => (m.written & PROP_BIT.get(p)!) !== 0);
    for (const prop of m.orig.keys()) if (prop.startsWith("--")) props.push(prop);
    for (const prop of props) {
      if (st.getPropertyPriority(prop) !== "important") continue;
      const o = m.orig.get(prop);
      if (o) st.setProperty(prop, o[0], o[1]);
      else st.removeProperty(prop);
    }
    if (m.noStyle) {
      if (st.length === 0 && el.hasAttribute("style")) el.removeAttribute("style");
    } else if (m.text !== null) {
      restoreStyleText(el, m.text);
    }
  }
  el.removeAttribute(ENGINE_MARK);
}

function eachRoot(root: Document | ShadowRoot, fn: (r: Document | ShadowRoot) => void, seen: Set<Node>): void {
  if (seen.has(root)) return;
  seen.add(root);
  fn(root);
  const all = root.querySelectorAll("*");
  for (let i = 0; i < all.length; i++) {
    const el = all[i]!;
    if (el.shadowRoot) eachRoot(el.shadowRoot, fn, seen);
    if (el.localName === "iframe") {
      try {
        const d = (el as HTMLIFrameElement).contentDocument;
        if (d) eachRoot(d, fn, seen);
      } catch {
        // cross-origin: not ours to reach
      }
    }
  }
}

/**
 * D4: undo a lost engine instance's inline writes from the element markers in doc, its open shadow
 * roots and same-origin iframes, and drop doc's root marker. Best effort, idempotent. The base sheet
 * is the caller's (it may come from a style host); find it by ENGINE_SHEET_SIGNATURE.
 */
export function undoEngineMarks(doc: Document): void {
  eachRoot(doc, (root) => {
    const marked = root.querySelectorAll(`[${ENGINE_MARK}]`);
    for (let i = 0; i < marked.length; i++) undoMark(marked[i]!);
  }, new Set());
  doc.documentElement.removeAttribute(ROOT_MARK);
}

export function detectNative(doc: Document): NativeLook {
  const de = doc.documentElement;
  const b = doc.body;
  const win = doc.defaultView;
  if (!win) return "light";

  for (const el of [de, b]) {
    if (!el) continue;
    try {
      const bg = win.getComputedStyle(el).backgroundColor;
      const parsed = parseRgb(bg);
      if (parsed && parsed.a > 0.5) {
        const hex = toHex(parsed.r, parsed.g, parsed.b);
        return isDark(hex) ? "dark" : "light";
      }
    } catch {
      // ignore
    }
  }

  try {
    const scheme = win.getComputedStyle(de).colorScheme || "";
    const sysDark = win.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
    if (scheme.includes("dark") && (!scheme.includes("light") || sysDark)) return "dark";
  } catch {
    // ignore
  }

  return "light";
}

function shouldSkipElement(el: Element): boolean {
  const tag = el.localName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return true;

  // Skip any Skinly UI or markers
  if (el.hasAttribute("data-skinly-ui") || el.hasAttribute("data-skinly-scene") || el.hasAttribute("data-skinly-pet") || el.hasAttribute("data-skinly-toast") || el.hasAttribute("data-skinly-blur") || el.hasAttribute("data-skinly-table")) {
    return true;
  }
  for (let i = 0; i < el.attributes.length; i++) {
    const name = el.attributes[i]!.name;
    if (name.startsWith(`${ROOT_MARK}-`) && name !== ENGINE_MARK) return true;
  }

  if (typeof el.closest === "function") {
    if (el.closest("[data-skinly-ui],[data-skinly-scene],[data-skinly-blur],[data-skinly-pet],[data-skinly-toast]")) {
      return true;
    }
  }

  const rootNode = el.getRootNode ? el.getRootNode() : null;
  if (rootNode && "host" in rootNode) {
    const host = (rootNode as ShadowRoot).host;
    if (host && shouldSkipElement(host)) return true;
  }

  return false;
}

export function createColorEngine(doc: Document, themeInput: Theme | { id: string; tokens: Tokens }, opts: EngineOptions = {}): EngineInstance {
  const win = doc.defaultView ?? (typeof window !== "undefined" ? window : null);
  const timeSliceMs = opts.timeSliceMs ?? 12;
  const batchSize = opts.batchSize ?? 100;

  const native = detectNative(doc);
  const tf = makeTransform(themeInput, native);
  const themeDark = isDark(themeInput.tokens.bg);
  // Behind the root element: the theme background (the base sheet paints html with it).
  const baseRgb = parseRgb(themeInput.tokens.bg) ?? BLACK;
  const BASE: Span = { lo: baseRgb, hi: baseRgb, image: false };

  let active = false;
  let timer = 0;
  let fullTimer = 0;
  let rafHover = 0;
  let rafTrans = 0;

  let sheet: CSSStyleSheet | HTMLStyleElement | null = null;
  let customStyleHandle: StyleHandle | null = null;
  let obs: MutationObserver | null = null;

  const roots = new Set<Document | ShadowRoot>();
  const queue = new Set<Element>();
  const hoverSet = new Set<Element>();
  const pendingTransitions = new Set<HTMLElement>();
  const recMap = new WeakMap<HTMLElement | SVGElement, ElementRecord>();
  // A record lives from the engine's first write until restore(), across refreshes, so the
  // original style text needs no separate holder.
  const modifiedElements = new Set<HTMLElement | SVGElement>();
  // Records whose marker data changed in the current batch; written once at the batch's end.
  const dirtyMarks = new Set<HTMLElement | SVGElement>();
  // Each element's own background layers as last painted; reset by restore().
  let layerKeys = new WeakMap<Element, string>();

  function styleText(): string {
    const scheme = themeDark ? "dark" : "light";
    // Early base background-color + color-scheme to avoid white flash. NEVER hide the page.
    return `${ENGINE_SHEET_SIGNATURE} {}\nhtml { color-scheme: ${scheme} !important; background-color: ${themeInput.tokens.bg} !important; }`;
  }

  function setupSheet(): void {
    if (sheet || customStyleHandle) return;
    const text = styleText();
    if (opts.styleHost) {
      customStyleHandle = opts.styleHost.add(text);
      return;
    }
    const w = doc.defaultView ?? (typeof window !== "undefined" ? window : null);
    if (w && typeof w.CSSStyleSheet !== "undefined" && "adoptedStyleSheets" in doc) {
      try {
        const s = new w.CSSStyleSheet();
        s.replaceSync(text);
        doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, s];
        sheet = s;
      } catch {
        // CSP or unsupported
      }
    }
  }

  function teardownSheet(): void {
    if (customStyleHandle) {
      customStyleHandle.remove();
      customStyleHandle = null;
    }
    if (!sheet) return;
    if (typeof CSSStyleSheet !== "undefined" && sheet instanceof CSSStyleSheet) {
      doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== sheet);
    }
    sheet = null;
  }

  // The engine's last write to prop is still in place (value and priority).
  function ours(st: CSSStyleDeclaration, prop: string, e: PropRecord): boolean {
    return st.getPropertyValue(prop) === e.m && st.getPropertyPriority(prop) === "important";
  }

  function put(el: HTMLElement | SVGElement, prop: string, val: string): void {
    let r = recMap.get(el);
    if (!r) {
      const text = el.getAttribute("style");
      r = { hadStyleAttr: text !== null, origStyleText: text, props: {}, written: 0, pageOrig: new Map() };
      recMap.set(el, r);
      modifiedElements.add(el);
      dirtyMarks.add(el);
    } else if (!el.hasAttribute("style") && r.hadStyleAttr) {
      // I5: the page dropped the attribute since our last write, so this write creates it.
      r.hadStyleAttr = false;
      r.origStyleText = null;
      dirtyMarks.add(el);
    }
    const st = el.style;
    let entry = r.props[prop];
    if (!entry || !ours(st, prop, entry)) {
      if (!entry) entry = r.props[prop] = { o: "", p: "", m: "" };
      // New entry, or I5: the page changed the property since our last write; its value is the base.
      entry.o = st.getPropertyValue(prop);
      entry.p = st.getPropertyPriority(prop);
      noteOriginal(el, r, prop, entry);
    }
    st.setProperty(prop, val, "important");
    // Read back: the DOM normalises values (hex -> rgb), and the guard compares against this.
    entry.m = st.getPropertyValue(prop);
  }

  // Keeps the marker data (D4) in step with the ledger; only a real change dirties the marker.
  function noteOriginal(el: HTMLElement | SVGElement, r: ElementRecord, prop: string, e: PropRecord): void {
    const bit = PROP_BIT.get(prop) ?? 0;
    if ((r.written & bit) !== bit) {
      r.written |= bit;
      dirtyMarks.add(el);
    }
    const had = r.pageOrig.get(prop);
    if (e.o) {
      if (had && had[0] === e.o && had[1] === e.p) return;
      r.pageOrig.set(prop, [e.o, e.p]);
    } else {
      if (!had) return;
      r.pageOrig.delete(prop);
    }
    dirtyMarks.add(el);
  }

  // Runs inside quiet() (every put is in a refreshBatch), and ENGINE_MARK is not observed anyway (I7).
  function writeMarks(): void {
    for (const el of dirtyMarks) {
      const r = recMap.get(el);
      if (!r) continue;
      const v = encodeMark(el, r);
      if (el.getAttribute(ENGINE_MARK) !== v) el.setAttribute(ENGINE_MARK, v);
    }
    dirtyMarks.clear();
  }

  // Only undo our own write if it is still in place; a page change wins (I3, I4).
  function revert(st: CSSStyleDeclaration, prop: string, e: PropRecord): void {
    if (!ours(st, prop, e)) return;
    if (e.o) st.setProperty(prop, e.o, e.p);
    else st.removeProperty(prop);
  }

  // I6: drop only an attribute the engine itself created and that is now empty.
  function dropEmptyStyle(el: HTMLElement | SVGElement, r: ElementRecord): void {
    if (!r.hadStyleAttr && el.style.length === 0 && el.hasAttribute("style")) el.removeAttribute("style");
  }

  // A refresh (final=false) reverts our writes but keeps the record, so the next put() starts each
  // entry from the page's current value (I5) and the original text stays for the final restore.
  // Only restore() passes final=true; the refresh path never rewrites the attribute text (I11).
  function reset(el: HTMLElement | SVGElement, final = false): void {
    const r = recMap.get(el);
    if (!r) return;
    for (const prop of Object.keys(r.props)) revert(el.style, prop, r.props[prop]!);
    r.props = {};
    dropEmptyStyle(el, r);
    if (!final) return;
    recMap.delete(el);
    el.removeAttribute(ENGINE_MARK);
    modifiedElements.delete(el);
    dirtyMarks.delete(el);
    if (r.origStyleText !== null) restoreStyleText(el, r.origStyleText);
  }

  function hasWrites(el: HTMLElement | SVGElement): boolean {
    const r = recMap.get(el);
    return r !== undefined && Object.keys(r.props).length > 0;
  }

  function svgRole(el: SVGElement): Role {
    if (el.localName !== "rect" || !el.ownerSVGElement) return "text";
    try {
      const a = el.getBoundingClientRect();
      const b = el.ownerSVGElement.getBoundingClientRect();
      if (b.width > 0 && b.height > 0) {
        return a.width * a.height >= 0.5 * b.width * b.height ? "bg" : "text";
      }
    } catch {
      // ignore
    }
    return "text";
  }

  function transformVal(val: string, role: Role, bd?: Backdrop): string {
    if (!val || val === "none" || val === "transparent") return val;
    return role === "text" && bd ? tf(val, role, bd) : tf(val, role);
  }

  function styleOf(ctx: BatchCtx, el: Element): CSSStyleDeclaration {
    let cs = ctx.styles.get(el);
    if (!cs) {
      cs = (el.ownerDocument.defaultView ?? win!).getComputedStyle(el);
      ctx.styles.set(el, cs);
    }
    return cs;
  }

  // A positioned media child covering most of the box paints over the element's background.
  // Needs layout; where there is none (a zero box) nothing is assumed.
  function coveredByMedia(ctx: BatchCtx, el: Element): boolean {
    let box: DOMRect | null = null;
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (!MEDIA_TAGS.has(c.localName)) continue;
      box ??= el.getBoundingClientRect();
      const area = box.width * box.height;
      if (!(area > 0)) return false;
      const pos = styleOf(ctx, c).position;
      if (pos !== "absolute" && pos !== "fixed") continue;
      const r = c.getBoundingClientRect();
      const w = Math.min(r.right, box.right) - Math.max(r.left, box.left);
      const h = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
      if (w > 0 && h > 0 && w * h >= 0.8 * area) return true;
    }
    return false;
  }

  // The element's background layers, bottom first, as they will be painted. An element in the batch
  // was just reset, so its page values are mapped exactly as inspectElement will write them; any
  // other element is read as it is painted now.
  function ownLayers(ctx: BatchCtx, el: Element): Layer[] {
    const cs = styleOf(ctx, el);
    const predict = ctx.inBatch.has(el);
    const paint = (v: string): RGBA | null => parseRgb(predict ? transformVal(v, "bg") : v);
    const layers: Layer[] = [];
    const bg = parseRgb(cs.backgroundColor);
    if (bg && bg.a > 0.01) {
      const c = paint(cs.backgroundColor);
      if (c) layers.push([c]);
    }
    const bi = cs.backgroundImage;
    if (bi && bi !== "none") {
      const images = splitTop(bi);
      const sizes = splitTop(cs.backgroundSize || "auto");
      const repeats = splitTop(cs.backgroundRepeat || "repeat");
      // The first listed image is on top.
      for (let i = images.length - 1; i >= 0; i--) {
        const img = images[i]!;
        const size = sizes[i % sizes.length] || "auto";
        const tiled = !/no-repeat|repeat-x|repeat-y/.test(repeats[i % repeats.length] || "repeat");
        const full = /^(cover|contain|100%( 100%)?)$/.test(size);
        if (img.includes("gradient(")) {
          // A gradient fills its box unless sized smaller (an underline strip, a corner fade).
          if (!tiled && !full && !/^auto( auto)?$/.test(size)) continue;
          const stops: RGBA[] = [];
          for (const m of img.match(STOP_RE) ?? []) {
            const c = paint(m);
            if (c) stops.push(c);
          }
          layers.push(stops.length > 0 ? stops : null);
        } else if (img.includes("url(")) {
          // Only an image that fills the box is behind the text; an untiled one at its own size is
          // an icon or a decoration beside it.
          if (tiled || full) layers.push(null);
        }
      }
    }
    if (coveredByMedia(ctx, el)) layers.push(null);
    return layers;
  }

  // Nearest first: the topmost opaque layer hides everything under it; only see-through layers
  // send the walk to the parent. Cached per batch, so each element is read once per batch.
  function resolve(ctx: BatchCtx, el: Element): Resolved {
    const hit = ctx.seen.get(el);
    if (hit) return hit;
    const layers = ownLayers(ctx, el);
    let top = layers.length - 1;
    while (top >= 0 && !opaque(layers[top]!)) top--;
    let span: Span;
    let pending = false;
    let parentRes: Resolved | null = null;
    if (top >= 0) {
      const l = layers[top]!;
      span = l === null ? UNSEEN : spanOf(l, false);
    } else {
      const par = parentOf(el);
      if (par) {
        parentRes = resolve(ctx, par);
        span = parentRes.span;
        pending = parentRes.pending;
      } else {
        span = BASE;
      }
    }
    for (let i = top + 1; i < layers.length; i++) span = paintOver(layers[i]!, span);
    const own = layers.length > 0;
    if (own && !ctx.inBatch.has(el) && queue.has(el)) pending = true;
    const key = layers.map((l) => (l === null ? "img" : l.map((c) => `${c.r},${c.g},${c.b},${c.a}`).join(" "))).join("|");
    const bd = !own && parentRes ? parentRes.bd : { dark: toHex(span.lo.r, span.lo.g, span.lo.b), light: toHex(span.hi.r, span.hi.g, span.hi.b), image: span.image };
    const res: Resolved = { span, bd, own, key, pending };
    ctx.seen.set(el, res);
    return res;
  }

  // `follow` receives a property left unwritten because it equals the parent's value: skipping it is
  // right only if the element really inherits the parent's themed value, which the caller checks.
  function inspectElement(
    el: HTMLElement | SVGElement,
    cs: CSSStyleDeclaration,
    par: Element | null,
    pcs: CSSStyleDeclaration | null,
    bd: Backdrop,
    follow: (prop: string, val: string, role: Role) => void,
  ): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    const add = (prop: string, val: string, role: Role, onBackdrop = true) => {
      const next = transformVal(val, role, onBackdrop ? bd : undefined);
      if (next !== val) out.push([prop, next]);
    };

    // 1. Text color (if not inherited from parent)
    const col = cs.color;
    if (!pcs || col !== pcs.color) {
      add("color", col, "text");
    } else {
      follow("color", col, "text");
    }

    // 2. Background color
    const bg = cs.backgroundColor;
    const parsedBg = parseRgb(bg);
    if (parsedBg && parsedBg.a > 0.01) {
      add("background-color", bg, "bg");
    }

    // 3. Background image gradients
    const bi = cs.backgroundImage;
    if (bi && bi.length > 8 && bi.includes("gradient")) {
      const nextBi = bi.replace(GRADIENT_COLOR_RE, (m) => transformVal(m, "bg"));
      if (nextBi !== bi) out.push(["background-image", nextBi]);
    }

    // 4. Borders
    for (const s of SIDES) {
      const w = cs.getPropertyValue(`border-${s}-width`);
      const st = cs.getPropertyValue(`border-${s}-style`);
      if (w !== "0px" && st !== "none") {
        add(`border-${s}-color`, cs.getPropertyValue(`border-${s}-color`), "border");
      }
    }

    // 5. Outline
    if (cs.outlineStyle !== "none" && cs.outlineWidth !== "0px") {
      add("outline-color", cs.outlineColor, "border");
    }

    // 6. Text decoration
    if (cs.textDecorationLine !== "none" && cs.textDecorationColor && cs.textDecorationColor !== col) {
      add("text-decoration-color", cs.textDecorationColor, "text");
    }

    // 7. SVG fill / stroke. The engine writes these on SVG elements only, so an HTML parent's value
    // (an <svg> root's parent) is never a themed one to inherit.
    if (isSvg(el)) {
      const f = cs.fill;
      const s = cs.stroke;
      const svgPcs = par && isSvg(par) ? pcs : null;
      if (f && f !== "none") {
        if (!svgPcs || f !== svgPcs.fill) add("fill", f, svgRole(el));
        else follow("fill", f, svgRole(el));
      }
      if (s && s !== "none") {
        if (!svgPcs || s !== svgPcs.stroke) add("stroke", s, "text");
        else follow("stroke", s, "text");
      }
    }

    // 8. Custom CSS properties defined inline
    try {
      const inlineStyle = el.style;
      for (let i = 0; i < inlineStyle.length; i++) {
        const prop = inlineStyle[i]!;
        if (prop.startsWith("--")) {
          const val = inlineStyle.getPropertyValue(prop).trim();
          const parsed = parseRgb(val);
          if (parsed && parsed.a > 0.01) {
            const role: Role = /bg|back|surface/i.test(prop) ? "bg" : /border|line|stroke/i.test(prop) ? "border" : "text";
            // A variable is used wherever the page puts it, so this element's backdrop says nothing about it.
            add(prop, val, role, false);
          }
        }
      }
    } catch {
      // ignore
    }

    return out;
  }

  // Holds transitions while a refresh swaps our writes, so the swap does not animate. The hold is an
  // ordinary ledger entry (I2): released on the next frame, or reverted with the rest by restore().
  function suppressTransition(el: HTMLElement): void {
    put(el, "transition", "none");
    pendingTransitions.add(el);
    if (!rafTrans && win) {
      if (typeof win.requestAnimationFrame === "function") {
        rafTrans = win.requestAnimationFrame(restoreTransitions);
      } else {
        rafTrans = win.setTimeout(restoreTransitions, 0);
      }
    }
  }

  function restoreTransitions(): void {
    rafTrans = 0;
    quiet(() => {
      for (const el of pendingTransitions) {
        const r = recMap.get(el);
        const e = r?.props["transition"];
        if (!r || !e) continue;
        revert(el.style, "transition", e);
        delete r.props["transition"];
        dropEmptyStyle(el, r);
      }
      pendingTransitions.clear();
    });
  }

  function refreshBatch(batch: Element[]): void {
    if (!win) return;
    const todo: Array<HTMLElement | SVGElement> = [];
    for (const el of batch) {
      if (!el.isConnected || shouldSkipElement(el) || !isStyled(el)) continue;
      todo.push(el);
    }

    // Phase 1: revert our writes so the page's own styles are read (no reads interleaved).
    // Only elements we are about to revert need a transition hold; it is written right after
    // the revert, before any style read, so the browser never sees the revert without it.
    for (const el of todo) {
      const hold = hasWrites(el);
      reset(el);
      if (hold && isHtml(el)) suppressTransition(el);
    }

    const inBatch = new Set<Element>(todo);
    const ctx: BatchCtx = { inBatch, styles: new Map(), seen: new Map() };
    const follows: Follow[] = [];
    // Elements whose colour is a settled parent's themed value (or inherited down from one).
    const painted = new Set<Element>();
    const moved: Element[] = [];
    const plannedChanges: Array<{ el: HTMLElement | SVGElement; changes: Array<[string, string]> }> = [];
    for (const el of todo) {
      try {
        const cs = styleOf(ctx, el);
        const par = parentOf(el);
        const pcs = par ? styleOf(ctx, par) : null;
        const res = resolve(ctx, el);
        // An ancestor's background is not painted yet: decide now, look again after it.
        if (res.pending) queue.add(el);
        const prev = layerKeys.get(el);
        if (prev !== undefined && prev !== res.key) moved.push(el);
        layerKeys.set(el, res.key);
        const changes = inspectElement(el, cs, par, pcs, res.bd, (prop, val, role) => {
          // A parent in this batch was just reset: the value read is its page value, not what it will
          // show. A parent outside it shows its settled value, which the element follows as it is,
          // unless the parent is still queued: then look again after it.
          if (par && inBatch.has(par)) {
            follows.push({ el, prop, val, role, bd: res.bd, own: res.own, painted: false });
          } else if (par && queue.has(par)) {
            queue.add(el);
          } else if (prop === "color") {
            // The parent chose that colour for its own backdrop; on a background of this element's own
            // it may not be readable.
            painted.add(el);
            if (res.own) follows.push({ el, prop, val, role, bd: res.bd, own: true, painted: true });
          }
        });
        if (changes.length > 0) plannedChanges.push({ el, changes });
      } catch {
        // ignore
      }
    }

    // Phase 2: Apply planned styles (Write phase)
    try {
      for (const { el, changes } of plannedChanges) {
        for (const [prop, val] of changes) {
          put(el, prop, val);
        }
      }
      settleFollows(follows, painted);
    } finally {
      // One marker write per element whose data changed (first record, new prop, re-based original).
      writeMarks();
    }

    // A background changed (page change, class, hover): text below it was decided on the old one.
    // Cost is the subtree of a background that really changed, once.
    for (const el of moved) {
      const below = el.querySelectorAll("*");
      for (let i = 0; i < below.length; i++) {
        const d = below[i]!;
        if (!inBatch.has(d) && !shouldSkipElement(d)) queue.add(d);
      }
    }
  }

  // Equal to the parent's page value means "inherits the parent's themed value" only if the element
  // inherits at all. One with its own rule of the same value (`html, body { color: X }`) keeps X while
  // the parent is repainted. So once the batch's writes are in, re-read each skipped property,
  // ancestors first (a parent fixed here changes what its children inherit), and write it where it did
  // not end themed for its own backdrop. A write here makes the next read recalc styles, and writes
  // happen only on a miss, so where children really inherit this costs one read each.
  function settleFollows(follows: Follow[], painted: Set<Element>): void {
    if (follows.length === 0 || !win) return;
    const order = follows.map((f) => ({ f, d: depthOf(f.el) }));
    order.sort((a, b) => a.d - b.d);
    for (const { f } of order) {
      const view = f.el.ownerDocument.defaultView ?? win;
      const par = parentOf(f.el);
      if (f.prop === "color" && (f.painted || (par && painted.has(par)))) {
        // Already themed: only the floor on this element's own backdrop is in question. Without a
        // background of its own it sits on its parent's, which was checked first.
        painted.add(f.el);
        if (!f.own) continue;
        const shown = view.getComputedStyle(f.el).color;
        const next = tf.fit(shown, f.bd);
        if (next !== shown) put(f.el, "color", next);
        continue;
      }
      const next = transformVal(f.val, f.role, f.bd);
      if (!sameColor(view.getComputedStyle(f.el).getPropertyValue(f.prop), next)) put(f.el, f.prop, next);
    }
  }

  function flush(): void {
    timer = 0;
    if (!active || standDownIfCleaned()) return;
    quiet(() => {
      const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
      while (queue.size > 0) {
        const batch: Element[] = [];
        for (const el of queue) {
          queue.delete(el);
          batch.push(el);
          if (batch.length >= batchSize) break;
        }
        refreshBatch(batch);
        const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
        if (elapsed > timeSliceMs) break;
      }
    });

    if (queue.size > 0) schedule();
  }

  function schedule(): void {
    if (!timer && active && win) {
      timer = win.setTimeout(flush, 0);
    }
  }

  function quiet(fn: () => void): void {
    if (obs) {
      ingest(obs.takeRecords());
      obs.disconnect();
    }
    try {
      fn();
    } finally {
      if (obs) {
        for (const r of roots) obs.observe(r, OBSERVER_OPTS);
      }
    }
  }

  function watch(r: Document | ShadowRoot): void {
    if (roots.has(r)) return;
    roots.add(r);
    if (obs) obs.observe(r, OBSERVER_OPTS);
  }

  // Bug C: attaching a shadow root fires nothing the engine can see, and the isolated world cannot
  // hook the page's attachShadow. So a root is picked up the first time something the engine already
  // reacts to touches its host (a mutation on the host or in its light subtree, an event from inside
  // the root). Constant cost per touched element; a known root is never collected twice.
  function adopt(host: Element): boolean {
    const sr = host.shadowRoot;
    if (!sr || roots.has(sr) || shouldSkipElement(host)) return false;
    watch(sr);
    collect(sr);
    return true;
  }

  function collect(root: Document | ShadowRoot): void {
    const all = root.querySelectorAll("*");
    for (let i = 0; i < all.length; i++) {
      const el = all[i]!;
      if (shouldSkipElement(el)) continue;
      queue.add(el);
      if (el.shadowRoot) {
        watch(el.shadowRoot);
        collect(el.shadowRoot);
      }
    }
  }

  function addTree(n: Element): void {
    if (shouldSkipElement(n)) return;
    queue.add(n);
    if (n.shadowRoot) {
      watch(n.shadowRoot);
      collect(n.shadowRoot);
    }
    const all = n.querySelectorAll("*");
    for (let i = 0; i < all.length; i++) {
      const c = all[i]!;
      if (!shouldSkipElement(c)) {
        queue.add(c);
        if (c.shadowRoot) {
          watch(c.shadowRoot);
          collect(c.shadowRoot);
        }
      }
    }
  }

  function styleChanged(a: string, b: string): boolean {
    if (a === b) return false;
    const split = (s: string) => s.split(";").map((p) => p.trim()).filter(Boolean);
    const A = split(a);
    const B = split(b);
    for (const d of B) if (!A.includes(d) && COLOR_ATTR_RE.test(d)) return true;
    for (const d of A) if (!B.includes(d) && COLOR_ATTR_RE.test(d)) return true;
    return false;
  }

  function ingest(records: MutationRecord[]): void {
    for (const m of records) {
      if (m.type === "childList") {
        // Components often attach their root, then render light children into the host.
        if (m.target.nodeType === 1) adopt(m.target as Element);
        for (let i = 0; i < m.addedNodes.length; i++) {
          const n = m.addedNodes[i]!;
          if (n.nodeType === 1) addTree(n as Element);
        }
        continue;
      }
      const t = m.target;
      if (t.nodeType !== 1) continue;
      const el = t as Element;
      if (shouldSkipElement(el)) continue;
      adopt(el);
      if (m.attributeName === "style") {
        if (styleChanged(m.oldValue || "", el.getAttribute("style") || "")) {
          queue.add(el);
        }
        continue;
      }
      queue.add(el);
      if (el === doc.documentElement || el === doc.body) {
        if (!fullTimer && win) {
          fullTimer = win.setTimeout(() => {
            fullTimer = 0;
            if (active) {
              collect(doc);
              schedule();
            }
          }, 250);
        }
      } else {
        const d = el.querySelectorAll("*");
        if (d.length <= 300) {
          for (let i = 0; i < d.length; i++) {
            if (!shouldSkipElement(d[i]!)) {
              queue.add(d[i]!);
              adopt(d[i]!);
            }
          }
        }
      }
    }
  }

  function onMutations(records: MutationRecord[]): void {
    if (standDownIfCleaned()) return;
    if (active &&doc.documentElement.getAttribute(ROOT_MARK) !== "on") {
      doc.documentElement.setAttribute(ROOT_MARK, "on");
    }
    ingest(records);
    schedule();
  }

  function onInteractiveEvent(e: Event): void {
    if (!active || standDownIfCleaned()) return;
    const path = (e.composedPath ? e.composedPath() : [e.target]) as EventTarget[];
    const chain: Element[] = [];
    let adopted = false;
    for (const item of path) {
      // An open root the event came through that the engine has not seen yet (bug C).
      if (item && (item as Node).nodeType === 11 && "host" in item) {
        if (adopt((item as ShadowRoot).host)) adopted = true;
        continue;
      }
      // Past 8 elements keep walking the path (it is as long as the tree is deep) only to find roots.
      if (item && (item as Node).nodeType === 1 && chain.length < 8) {
        const el = item as Element;
        if (!shouldSkipElement(el)) chain.push(el);
      }
    }
    if (adopted) schedule();
    for (let i = 0; i < chain.length; i++) {
      const el = chain[i]!;
      hoverSet.add(el);
      if (i < 2) {
        const descendants = el.querySelectorAll("*");
        for (let k = 0; k < descendants.length && k < 60; k++) {
          const d = descendants[k]!;
          if (!shouldSkipElement(d)) hoverSet.add(d);
        }
      }
    }
    if (!rafHover && win) {
      if (typeof win.requestAnimationFrame === "function") {
        rafHover = win.requestAnimationFrame(flushHover);
      } else {
        rafHover = win.setTimeout(flushHover, 0);
      }
    }
  }

  function flushHover(): void {
    rafHover = 0;
    if (!active || standDownIfCleaned()) return;
    const list = [...hoverSet];
    hoverSet.clear();
    quiet(() => refreshBatch(list));
    // A hover that changed a background queued the text below it.
    if (queue.size > 0) schedule();
  }

  function onResourceLoad(e: Event): void {
    if (!active || standDownIfCleaned()) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.localName === "link" || target.localName === "style")) {
      collect(doc);
      schedule();
    }
  }

  function apply(): void {
    if (active) restore();
    active = true;
    setupSheet();
    doc.documentElement.setAttribute(ROOT_MARK, "on");

    const MO = (win && win.MutationObserver) || (typeof MutationObserver !== "undefined" ? MutationObserver : null);
    if (MO) {
      obs = new MO(onMutations);
    }

    watch(doc);
    collect(doc);

    // Also collect same-origin iframes
    const iframes = doc.querySelectorAll("iframe");
    for (let i = 0; i < iframes.length; i++) {
      try {
        const iframeDoc = iframes[i]!.contentDocument;
        if (iframeDoc) {
          watch(iframeDoc);
          collect(iframeDoc);
        }
      } catch {
        // Cross-origin iframe: skip
      }
    }

    for (const e of EVT) {
      doc.addEventListener(e, onInteractiveEvent, true);
    }
    doc.addEventListener("load", onResourceLoad, true);

    // Immediate flush for synchronous initial batch in tests and early paint
    flush();
  }

  function sheetDetached(): boolean {
    try {
      if (customStyleHandle) return !customStyleHandle.isAttached();
      if (sheet && typeof CSSStyleSheet !== "undefined" && sheet instanceof CSSStyleSheet) return !doc.adoptedStyleSheets.includes(sheet);
    } catch {
      // unreadable: assume ours is still there
    }
    return false;
  }

  // D4: only a fresh instance's cleanup removes our base sheet behind our back. Then this instance is
  // lost (orphaned by an extension reload, still running): stop reacting, or it would re-theme what
  // the cleanup gave back. Styles and records are left alone, so a later restore() still works.
  function standDownIfCleaned(): boolean {
    if (!active || !sheetDetached()) return false;
    stop();
    return true;
  }

  function stop(): void {
    active = false;
    if (win) {
      win.clearTimeout(timer);
      win.clearTimeout(fullTimer);
      if (typeof win.cancelAnimationFrame === "function") {
        win.cancelAnimationFrame(rafHover);
        win.cancelAnimationFrame(rafTrans);
      } else {
        win.clearTimeout(rafHover);
        win.clearTimeout(rafTrans);
      }
    }
    timer = fullTimer = rafHover = rafTrans = 0;
    queue.clear();
    hoverSet.clear();

    if (obs) {
      obs.disconnect();
      obs = null;
    }

    for (const e of EVT) {
      doc.removeEventListener(e, onInteractiveEvent, true);
    }
    doc.removeEventListener("load", onResourceLoad, true);
  }

  function restore(): void {
    stop();

    // Transition holds are ledger entries: reset() below reverts them with the rest.
    pendingTransitions.clear();

    for (const el of modifiedElements) {
      reset(el, true);
    }
    modifiedElements.clear();
    dirtyMarks.clear();
    layerKeys = new WeakMap();

    for (const r of roots) {
      const marked = r.querySelectorAll(`[${ENGINE_MARK}]`);
      for (let i = 0; i < marked.length; i++) {
        const el = marked[i]!;
        // A marker without a record (record lost): nothing to compare against, so leave its styles.
        if (isStyled(el) && recMap.has(el)) reset(el, true);
        else el.removeAttribute(ENGINE_MARK);
      }
    }
    roots.clear();

    teardownSheet();
    doc.documentElement.removeAttribute(ROOT_MARK);
  }

  return {
    apply,
    restore,
    isActive: () => active,
    nativeLook: () => native,
    modifiedCount: () => modifiedElements.size,
  };
}
