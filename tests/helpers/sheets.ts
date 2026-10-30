/**
 * jsdom has no constructable stylesheets. This stands in for them so tests can read what a shadow root adopted:
 * `new CSSStyleSheet()` + `replaceSync` keep the text, and every shadow root gets an `adoptedStyleSheets` slot.
 */
export class FakeSheet {
  text = "";
  replaceSync(css: string): void {
    this.text = css;
  }
}

const slots = new WeakMap<object, FakeSheet[]>();

export function installSheets(win: Window = window): () => void {
  const w = win as unknown as { CSSStyleSheet?: unknown; ShadowRoot: { prototype: object } };
  const had = w.CSSStyleSheet;
  const proto = w.ShadowRoot.prototype;
  const own = Object.getOwnPropertyDescriptor(proto, "adoptedStyleSheets");
  w.CSSStyleSheet = FakeSheet;
  Object.defineProperty(proto, "adoptedStyleSheets", {
    configurable: true,
    get(this: object) {
      return slots.get(this) ?? [];
    },
    set(this: object, v: FakeSheet[]) {
      slots.set(this, [...v]);
    },
  });
  return () => {
    w.CSSStyleSheet = had;
    if (own) Object.defineProperty(proto, "adoptedStyleSheets", own);
    else delete (proto as Record<string, unknown>)["adoptedStyleSheets"];
  };
}

/** The CSS a shadow root adopted (empty when none). */
export const adoptedCss = (root: ShadowRoot | null | undefined): string =>
  root ? ((root as unknown as { adoptedStyleSheets?: FakeSheet[] }).adoptedStyleSheets ?? []).map((s) => s.text ?? "").join("") : "";
