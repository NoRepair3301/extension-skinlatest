import type { Tokens } from "../plan/schema.ts";
import type { Theme } from "../themes/index.ts";
import { isDark } from "../plan/contrast.ts";
import { parseRgb, toHex } from "./color.ts";
import { makeTransform, type NativeLook, type Role } from "./transform.ts";

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

interface PropRecord {
  o: string; // original inline value ("" if the property had none)
  p: string; // original priority ("" or "important")
  m: string; // value the engine wrote, as read back from the element (normalised)
}

interface ElementRecord {
  hadStyleAttr: boolean; // style attribute present before the engine's first write
  origStyleText: string | null; // that attribute's exact text (null when there was none)
  props: Record<string, PropRecord>;
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
    if (name.startsWith("data-skinly-") && name !== "data-skinly-engine") return true;
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

  let active = false;
  let timer = 0;
  let fullTimer = 0;
  let rafHover = 0;
  let rafTrans = 0;

  let sheet: CSSStyleSheet | HTMLStyleElement | null = null;
  let customStyleHandle: StyleHandle | null = null;
  let obs: MutationObserver | null = null;

  const roots: Array<Document | ShadowRoot> = [];
  const queue = new Set<Element>();
  const hoverSet = new Set<Element>();
  // Elements whose `transition: none` (a ledger entry) is undone on the next frame.
  const pendingTransitions = new Set<HTMLElement | SVGElement>();
  const recMap = new WeakMap<HTMLElement | SVGElement, ElementRecord>();
  const modifiedElements = new Set<HTMLElement | SVGElement>();
  // Original style text of a record a refresh released (nothing left to write), for restore() or a later record.
  const carriedText = new Map<HTMLElement | SVGElement, string>();
  let seen = new WeakSet<Element>();

  function styleText(): string {
    const scheme = themeDark ? "dark" : "light";
    // Early base background-color + color-scheme to avoid white flash. NEVER hide the page.
    return `html { color-scheme: ${scheme} !important; background-color: ${themeInput.tokens.bg} !important; }`;
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

  function put(el: HTMLElement | SVGElement, prop: string, val: string): void {
    let r = recMap.get(el);
    if (!r) {
      const hadStyleAttr = el.hasAttribute("style");
      const carried = carriedText.get(el);
      carriedText.delete(el);
      r = {
        hadStyleAttr,
        origStyleText: hadStyleAttr ? (carried ?? el.getAttribute("style")) : null,
        props: {},
      };
      recMap.set(el, r);
      el.setAttribute("data-skinly-engine", "");
      modifiedElements.add(el);
    }
    const st = el.style;
    let entry = r.props[prop];
    if (!entry) {
      entry = r.props[prop] = {
        o: st.getPropertyValue(prop),
        p: st.getPropertyPriority(prop),
        m: "",
      };
    }
    // An existing entry keeps o/p: lift() has already re-based them if the page changed the prop (I5).
    st.setProperty(prop, val, "important");
    // Read back: the DOM normalises values (hex -> rgb), and reset() compares against this.
    entry.m = st.getPropertyValue(prop);
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

  // Is the engine's own write still in place? Anything else means the page changed it (I4, I5).
  function owned(st: CSSStyleDeclaration, prop: string, e: PropRecord): boolean {
    return st.getPropertyValue(prop) === e.m && st.getPropertyPriority(prop) === "important";
  }

  function revert(st: CSSStyleDeclaration, prop: string, e: PropRecord): void {
    if (e.o) st.setProperty(prop, e.o, e.p);
    else st.removeProperty(prop);
  }

  // restore() only. The refresh path keeps the record (lift/prune) and never rewrites the attribute text.
  function reset(el: HTMLElement | SVGElement): void {
    const r = recMap.get(el);
    if (!r) return;
    const st = el.style;
    for (const prop of Object.keys(r.props)) {
      const e = r.props[prop]!;
      // Only undo our own write if it is still in place; a page change wins (I3, I4).
      if (owned(st, prop, e)) revert(st, prop, e);
    }
    release(el, r, true);
  }

  // Undo one ledger entry (guarded like reset) and release the record once it holds nothing.
  function unput(el: HTMLElement | SVGElement, prop: string): void {
    const r = recMap.get(el);
    const e = r?.props[prop];
    if (!r || !e) return;
    if (owned(el.style, prop, e)) revert(el.style, prop, e);
    delete r.props[prop];
    if (Object.keys(r.props).length === 0) release(el, r, false);
  }

  // Refresh, before recomputing: show the page's own values again without dropping the record.
  // A prop the page changed since our write is re-based to the page's value (I5), so a later
  // restore yields the page's latest value and the re-theme starts from it.
  function lift(el: HTMLElement | SVGElement): void {
    const r = recMap.get(el);
    if (!r) return;
    const st = el.style;
    for (const prop of Object.keys(r.props)) {
      // The pending transition override must stay on while the new values are written.
      if (prop === "transition" && pendingTransitions.has(el)) continue;
      const e = r.props[prop]!;
      if (owned(st, prop, e)) {
        revert(st, prop, e);
      } else {
        e.o = st.getPropertyValue(prop);
        e.p = st.getPropertyPriority(prop);
      }
    }
  }

  // Refresh, after re-writing: entries the new pass did not write already hold o (lifted or re-based).
  function prune(el: HTMLElement | SVGElement, written: ReadonlyArray<[string, string]>): void {
    const r = recMap.get(el);
    if (!r) return;
    for (const prop of Object.keys(r.props)) {
      if (written.some(([p]) => p === prop)) continue;
      if (prop === "transition" && pendingTransitions.has(el)) continue;
      delete r.props[prop];
    }
    if (Object.keys(r.props).length === 0) release(el, r, false);
  }

  function release(el: HTMLElement | SVGElement, r: ElementRecord, final: boolean): void {
    const st = el.style;
    recMap.delete(el);
    el.removeAttribute("data-skinly-engine");
    modifiedElements.delete(el);
    // I6: drop only an attribute the engine itself created and that is now empty.
    if (!r.hadStyleAttr && st.length === 0 && el.hasAttribute("style")) el.removeAttribute("style");
    if (r.origStyleText === null) return;
    if (final) restoreStyleText(el, r.origStyleText);
    else carriedText.set(el, r.origStyleText);
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

  function transformVal(val: string, role: Role): string {
    if (!val || val === "none" || val === "transparent") return val;
    return tf(val, role);
  }

  function inspectElement(el: HTMLElement | SVGElement, cs: CSSStyleDeclaration, pcs: CSSStyleDeclaration | null): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    const add = (prop: string, val: string, role: Role) => {
      const next = transformVal(val, role);
      if (next !== val) out.push([prop, next]);
    };

    // 1. Text color (if not inherited from parent)
    const col = cs.color;
    if (!pcs || col !== pcs.color) {
      add("color", col, "text");
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

    // 7. SVG fill / stroke
    if (el instanceof win!.SVGElement) {
      const f = cs.fill;
      const s = cs.stroke;
      if (f && f !== "none" && (!pcs || f !== pcs.fill)) {
        add("fill", f, svgRole(el));
      }
      if (s && s !== "none" && (!pcs || s !== pcs.stroke)) {
        add("stroke", s, "text");
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
            add(prop, val, role);
          }
        }
      }
    } catch {
      // ignore
    }

    return out;
  }

  // The override is an inline write like any other, so it goes through the ledger (I2): the record
  // keeps hadStyleAttr from before it, and undoing it is guarded against page changes.
  function suppressTransition(el: HTMLElement): void {
    if (pendingTransitions.has(el)) return;
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
      const list = [...pendingTransitions];
      pendingTransitions.clear();
      for (const el of list) unput(el, "transition");
    });
  }

  function refreshBatch(batch: Element[]): void {
    if (!win) return;
    const todo: Array<HTMLElement | SVGElement> = [];
    for (const el of batch) {
      if (!el.isConnected || shouldSkipElement(el)) continue;
      if (el instanceof win.HTMLElement || el instanceof win.SVGElement) {
        if (seen.has(el) && el instanceof win.HTMLElement) suppressTransition(el);
        todo.push(el);
      }
    }

    // Phase 1: Lift our values (records stay) and compute styles (Read phase without interleaving writes)
    for (const el of todo) lift(el);

    const plannedChanges = new Map<HTMLElement | SVGElement, Array<[string, string]>>();
    for (const el of todo) {
      try {
        const cs = win.getComputedStyle(el);
        const par = el.parentElement || ((el.getRootNode?.() as ShadowRoot)?.host as Element) || null;
        const pcs = par ? win.getComputedStyle(par) : null;
        const changes = inspectElement(el, cs, pcs);
        if (changes.length > 0) plannedChanges.set(el, changes);
        seen.add(el);
      } catch {
        // ignore
      }
    }

    // Phase 2: Apply planned styles (Write phase), then forget entries this pass no longer writes
    for (const el of todo) {
      const changes = plannedChanges.get(el) ?? [];
      for (const [prop, val] of changes) {
        put(el, prop, val);
      }
      prune(el, changes);
    }
  }

  function flush(): void {
    timer = 0;
    if (!active) return;
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
    if (roots.includes(r)) return;
    roots.push(r);
    if (obs) obs.observe(r, OBSERVER_OPTS);
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
            if (!shouldSkipElement(d[i]!)) queue.add(d[i]!);
          }
        }
      }
    }
  }

  function onMutations(records: MutationRecord[]): void {
    if (active && doc.documentElement.getAttribute("data-skinly") !== "on") {
      doc.documentElement.setAttribute("data-skinly", "on");
    }
    ingest(records);
    schedule();
  }

  function onInteractiveEvent(e: Event): void {
    if (!active) return;
    const path = (e.composedPath ? e.composedPath() : [e.target]) as EventTarget[];
    const chain: Element[] = [];
    for (const item of path) {
      if (item && (item as Node).nodeType === 1) {
        const el = item as Element;
        if (!shouldSkipElement(el)) {
          chain.push(el);
          if (chain.length >= 8) break;
        }
      }
    }
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
    if (!active) return;
    const list = [...hoverSet];
    hoverSet.clear();
    quiet(() => refreshBatch(list));
  }

  function onResourceLoad(e: Event): void {
    if (!active) return;
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
    doc.documentElement.setAttribute("data-skinly", "on");

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

  function restore(): void {
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

    restoreTransitions();

    for (const el of modifiedElements) {
      reset(el);
    }
    modifiedElements.clear();
    // Refreshed elements that needed no new write since: no record, but the text may still apply.
    for (const [el, text] of carriedText) restoreStyleText(el, text);
    carriedText.clear();

    for (const r of roots) {
      const marked = r.querySelectorAll("[data-skinly-engine]");
      for (let i = 0; i < marked.length; i++) {
        const el = marked[i]!;
        // A marker without a record (record lost): nothing to compare against, so leave its styles.
        if ((el instanceof win!.HTMLElement || el instanceof win!.SVGElement) && recMap.has(el)) reset(el);
        else el.removeAttribute("data-skinly-engine");
      }
    }
    roots.length = 0;

    teardownSheet();
    doc.documentElement.removeAttribute("data-skinly");
    seen = new WeakSet();
  }

  return {
    apply,
    restore,
    isActive: () => active,
    nativeLook: () => native,
    modifiedCount: () => modifiedElements.size,
  };
}
