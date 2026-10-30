import { countReattach, recordError, setFlag, type DiagKind, type MountReason } from "../core/diag.ts";

/**
 * How every extension-owned overlay host is styled and mounted. Strict sites forbid `<style>` elements and style attributes
 * (CSP style-src without 'unsafe-inline'), so styles go only through constructable stylesheets adopted by our own shadow root,
 * and the host itself is styled through CSSOM (element.style.setProperty). The rule scanner forbids the other ways in src/.
 */

/** Just under the top of the stacking range, so a site's own "max z-index" toast can still sit above the art. */
export const HOST_Z = "2147483646";

/** The art host: covers the window, never takes the pointer, is its own containment box, and wins over the site's !important rules. */
export const FIXED_HOST: Readonly<Record<string, string>> = {
  display: "block",
  position: "fixed",
  top: "0",
  right: "0",
  bottom: "0",
  left: "0",
  margin: "0",
  padding: "0",
  border: "0",
  "pointer-events": "none",
  "z-index": HOST_Z,
  contain: "strict",
  visibility: "visible",
  opacity: "1",
  transform: "none",
  filter: "none",
};

/** Sets each property through CSSOM with !important (an inline important declaration beats any author rule). */
export function styleHost(el: HTMLElement, props: Readonly<Record<string, string>>): void {
  const s = el.style;
  s.setProperty("all", "initial", "important");
  for (const [k, v] of Object.entries(props)) s.setProperty(k, v, "important");
}

/**
 * Adopts `css` into a shadow root. Returns false (and records it once) when the browser has no constructable stylesheets;
 * there is deliberately no `<style>` fallback because strict sites block it.
 */
export function adoptCss(doc: Document, root: ShadowRoot, css: string): boolean {
  const win = doc.defaultView as (Window & { CSSStyleSheet?: typeof CSSStyleSheet }) | null;
  try {
    if (win?.CSSStyleSheet && "adoptedStyleSheets" in root) {
      const s = new win.CSSStyleSheet();
      s.replaceSync(css);
      (root as unknown as { adoptedStyleSheets: CSSStyleSheet[] }).adoptedStyleSheets = [s];
      setFlag("sheets", true);
      return true;
    }
  } catch {
    // reported below
  }
  setFlag("sheets", false);
  recordError("no-adopted-sheets");
  return false;
}

const EFFECTS: ReadonlyArray<readonly [MountReason, (cs: CSSStyleDeclaration) => string]> = [
  ["transform", (cs) => cs.transform],
  ["filter", (cs) => cs.filter],
  ["perspective", (cs) => cs.perspective],
  ["contain", (cs) => cs.contain],
];

/** Pure on computed values: the first effect on html that makes it the containing block of fixed children (art would scroll away). */
export function htmlEffect(cs: Pick<CSSStyleDeclaration, "transform" | "filter" | "perspective" | "contain">): MountReason | undefined {
  for (const [name, read] of EFFECTS) {
    const v = (read(cs as CSSStyleDeclaration) ?? "").trim();
    if (v !== "" && v !== "none" && v !== "normal") return name;
  }
  return undefined;
}

/** Where the host goes: the html element, or the body when html has one of those effects (recorded for the diagnostics). */
export function mountParent(doc: Document, win: Window): HTMLElement {
  let effect: MountReason | undefined;
  try {
    effect = htmlEffect(win.getComputedStyle(doc.documentElement));
  } catch {
    effect = undefined;
  }
  const useBody = effect !== undefined && doc.body !== null;
  setFlag("mount", useBody ? "body" : "html");
  setFlag("htmlEffect", effect);
  return useBody ? doc.body! : doc.documentElement;
}

export const REATTACH_GAP_MS = 1000;
/** A page that keeps removing the host gets it back at most this many times per mount. */
export const REATTACH_MAX = 60;

export interface AttachTimers {
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

/**
 * Appends the host to its parent and keeps it there: if the page removes it (a framework re-rendering the whole document) or,
 * on the html element, puts something after it, it is put back as the last child. Bounded: at most once per second and
 * REATTACH_MAX times. Returns the stop function (call it before removing the host yourself).
 */
export function attachHost(doc: Document, win: Window, host: HTMLElement, kind: DiagKind, timers?: AttachTimers): () => void {
  const t: AttachTimers = timers ?? { now: () => Date.now(), setTimeout: (fn, ms) => win.setTimeout(fn, ms), clearTimeout: (id) => win.clearTimeout(id) };
  const parent = mountParent(doc, win);
  parent.append(host);
  const onHtml = parent === doc.documentElement;
  let left = REATTACH_MAX;
  let last = -Infinity;
  let timer: number | undefined;
  let alive = true;

  const misplaced = (): boolean => !host.isConnected || host.parentNode !== parent || (onHtml && parent.lastElementChild !== host);
  const fix = () => {
    timer = undefined;
    if (!alive || !misplaced() || left <= 0) return;
    try {
      left--;
      last = t.now();
      const wasGone = !host.isConnected;
      (parent.isConnected ? parent : doc.documentElement).append(host);
      if (wasGone) countReattach();
    } catch {
      recordError(kind);
    }
  };
  const Observer = (win as unknown as { MutationObserver?: typeof MutationObserver }).MutationObserver;
  const mo = Observer
    ? new Observer(() => {
        if (!alive || timer !== undefined || !misplaced()) return;
        timer = t.setTimeout(fix, Math.max(0, REATTACH_GAP_MS - (t.now() - last)));
      })
    : undefined;
  try {
    mo?.observe(parent, { childList: true });
    if (parent !== doc.documentElement) mo?.observe(doc.documentElement, { childList: true });
  } catch {
    recordError(kind);
  }
  return () => {
    alive = false;
    mo?.disconnect();
    if (timer !== undefined) t.clearTimeout(timer);
    timer = undefined;
  };
}
