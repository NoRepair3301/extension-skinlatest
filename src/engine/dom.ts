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
  m: string; // value the engine wrote
}

interface ElementRecord {
  origStyle: string | null;
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
  const pendingTransitions = new Map<HTMLElement, [string, string, string | null]>();
  const recMap = new WeakMap<HTMLElement | SVGElement, ElementRecord>();
  const modifiedElements = new Set<HTMLElement | SVGElement>();
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
      r = {
        origStyle: el.getAttribute("style"),
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
    st.setProperty(prop, val, "important");
    entry.m = st.getPropertyValue(prop);
  }

  function reset(el: HTMLElement | SVGElement): void {
    const r = recMap.get(el);
    if (!r) return;
    if (r.origStyle === null) {
      el.removeAttribute("style");
    } else {
      const attr = el.getAttributeNode("style");
      if (attr) {
        attr.value = r.origStyle;
      } else {
        const owner = el.ownerDocument;
        const newAttr = owner.createAttribute("style");
        newAttr.value = r.origStyle;
        el.setAttributeNode(newAttr);
      }
    }
    recMap.delete(el);
    el.removeAttribute("data-skinly-engine");
    modifiedElements.delete(el);
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

  function suppressTransition(el: HTMLElement): void {
    if (pendingTransitions.has(el)) return;
    const st = el.style;
    pendingTransitions.set(el, [st.getPropertyValue("transition"), st.getPropertyPriority("transition"), el.getAttribute("style")]);
    st.setProperty("transition", "none", "important");
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
      for (const [el, [val, prio, origStyle]] of pendingTransitions) {
        if (val) el.style.setProperty("transition", val, prio);
        else el.style.removeProperty("transition");
        if (origStyle === null && el.style.length === 0) el.removeAttribute("style");
      }
      pendingTransitions.clear();
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

    // Phase 1: Reset and compute styles (Read phase without interleaving writes)
    for (const el of todo) reset(el);

    const plannedChanges: Array<{ el: HTMLElement | SVGElement; changes: Array<[string, string]> }> = [];
    for (const el of todo) {
      try {
        const cs = win.getComputedStyle(el);
        const par = el.parentElement || ((el.getRootNode?.() as ShadowRoot)?.host as Element) || null;
        const pcs = par ? win.getComputedStyle(par) : null;
        const changes = inspectElement(el, cs, pcs);
        if (changes.length > 0) plannedChanges.push({ el, changes });
        seen.add(el);
      } catch {
        // ignore
      }
    }

    // Phase 2: Apply planned styles (Write phase)
    for (const { el, changes } of plannedChanges) {
      for (const [prop, val] of changes) {
        put(el, prop, val);
      }
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

    for (const r of roots) {
      const marked = r.querySelectorAll("[data-skinly-engine]");
      for (let i = 0; i < marked.length; i++) {
        const el = marked[i]!;
        if (el instanceof win!.HTMLElement || el instanceof win!.SVGElement) reset(el);
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
