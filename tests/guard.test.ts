import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { createApplier, type StyleHandle, type StyleHost } from "../src/extension/applier-core.ts";
import { captureMedia, checkVisual, effectiveBackground, type GuardProvider, type GuardStyle } from "../src/plan/guard.ts";
import { compileCss } from "../src/plan/compile.ts";
import { BUILTIN_THEME_IDS } from "../src/themes/index.ts";
import { fakeDeps } from "./analyzer/helpers.ts";
import { planFor, sampleSummary } from "./plan/helpers.ts";

const load = (n: string) => new JSDOM(readFileSync(`fixtures/web/${n}.html`, "utf8")).window.document;

const GOOD: GuardStyle = { color: "rgb(20, 20, 20)", backgroundColor: "rgba(0, 0, 0, 0)", backgroundImage: "none", caretColor: "auto", display: "block", visibility: "visible", opacity: "1", filter: "none" };

/** A style provider over a plain map; elements not in the map read as GOOD. */
function provider(doc: Document, styles: Map<Element, Partial<GuardStyle>>, lists: { text?: Element[]; edit?: Element[]; media?: Element[] }): GuardProvider {
  return {
    style: (el) => ({ ...GOOD, ...(el === doc.documentElement ? { backgroundColor: "rgb(255, 255, 255)" } : {}), ...styles.get(el) }),
    parentOf: (el) => el.parentElement,
    textParents: (n) => (lists.text ?? []).slice(0, n),
    editables: (n) => (lists.edit ?? []).slice(0, n),
    media: (n) => (lists.media ?? []).slice(0, n),
  };
}

describe("visual guard (pure)", () => {
  const doc = load("claude-like");
  const p1 = doc.querySelector("main p")!;
  const editor = doc.querySelector(".editor")!;
  const hero = load("hero-bg");

  it("passes readable text, and finds the colour behind through translucent ancestors", () => {
    const styles = new Map<Element, Partial<GuardStyle>>([[doc.querySelector(".card")!, { backgroundColor: "rgba(0, 0, 0, 0.5)" }]]);
    const p = provider(doc, styles, { text: [p1] });
    expect(effectiveBackground(p, p1)).toBe("#808080");
    expect(checkVisual(p, new Map())).toEqual({ ok: true });
  });

  it("fails text with contrast under 3 and names the code only", () => {
    const styles = new Map<Element, Partial<GuardStyle>>([[p1, { color: "rgb(250, 250, 250)" }]]);
    expect(checkVisual(provider(doc, styles, { text: [p1] }), new Map())).toEqual({ ok: false, code: "text" });
  });

  it("treats a background image anywhere in the chain as unknown and skips the element", () => {
    const styles = new Map<Element, Partial<GuardStyle>>([
      [p1, { color: "rgb(250, 250, 250)" }],
      [doc.querySelector(".card")!, { backgroundImage: 'url("x.jpg")' }],
    ]);
    const p = provider(doc, styles, { text: [p1] });
    expect(effectiveBackground(p, p1)).toBeNull();
    expect(checkVisual(p, new Map())).toEqual({ ok: true });
  });

  it("holds editable fields to 4.5 and checks the caret", () => {
    const mid = new Map<Element, Partial<GuardStyle>>([[editor, { color: "rgb(130, 130, 130)" }]]);
    expect(checkVisual(provider(doc, mid, { edit: [editor] }), new Map())).toEqual({ ok: false, code: "editable" });
    const caret = new Map<Element, Partial<GuardStyle>>([[editor, { caretColor: "rgb(255, 255, 255)" }]]);
    expect(checkVisual(provider(doc, caret, { edit: [editor] }), new Map())).toEqual({ ok: false, code: "caret" });
    const clear = new Map<Element, Partial<GuardStyle>>([[editor, { caretColor: "rgba(0, 0, 0, 0)" }]]);
    expect(checkVisual(provider(doc, clear, { edit: [editor] }), new Map())).toEqual({ ok: false, code: "caret" });
    expect(checkVisual(provider(doc, new Map(), { edit: [editor] }), new Map())).toEqual({ ok: true });
  });

  it("fails when media loses display, visibility, opacity or filter, or a background image", () => {
    const img = hero.querySelector("img.backdrop")!;
    const tile = hero.querySelector(".tile")!;
    const styles = new Map<Element, Partial<GuardStyle>>([[tile, { backgroundImage: 'url("t.jpg")' }]]);
    const p = provider(hero, styles, { media: [img, tile] });
    const before = captureMedia(p);
    expect(before.size).toBe(2);
    expect(checkVisual(p, before)).toEqual({ ok: true });
    for (const change of [{ opacity: "0" }, { visibility: "hidden" }, { display: "none" }, { filter: "blur(4px)" }]) {
      styles.set(img, change);
      expect(checkVisual(p, before), JSON.stringify(change)).toEqual({ ok: false, code: "media" });
    }
    styles.delete(img);
    styles.set(tile, { backgroundImage: "none" });
    expect(checkVisual(p, before)).toEqual({ ok: false, code: "media" });
  });

  it("allows one faint element in forty on a big page but none on a small one", () => {
    const els = Array.from({ length: 40 }, () => doc.createElement("p"));
    for (const e of els) doc.body.append(e);
    const styles = new Map<Element, Partial<GuardStyle>>([[els[0]!, { color: "rgb(250, 250, 250)" }]]);
    expect(checkVisual(provider(doc, styles, { text: els }), new Map())).toEqual({ ok: true });
    expect(checkVisual(provider(doc, styles, { text: els.slice(0, 10) }), new Map())).toEqual({ ok: false, code: "text" });
  });
});

const fakeHost = () => {
  const sheets: string[] = [];
  const host: StyleHost = {
    add(css) {
      sheets.push(css);
      return {
        remove: () => void sheets.splice(sheets.indexOf(css), 1),
        isAttached: () => sheets.includes(css),
      } satisfies StyleHandle;
    },
  };
  return { host, sheets };
};

describe("guard inside the applier", () => {
  /** Reads as unreadable while the newest sheet has full-strategy rules (buttons), readable otherwise. */
  function badWhen(doc: Document, sheets: string[], pred: (css: string) => boolean): GuardProvider {
    const p = doc.querySelector("main p")!;
    return {
      style: (el) => (el === p && pred(sheets[sheets.length - 1] ?? "") ? { ...GOOD, color: "rgb(255, 255, 255)", backgroundColor: "rgb(255, 255, 255)" } : { ...GOOD, backgroundColor: el === doc.documentElement ? "rgb(255, 255, 255)" : "rgba(0, 0, 0, 0)" }),
      parentOf: (el) => el.parentElement,
      textParents: () => [p],
      editables: () => [],
      media: () => [],
    };
  }

  it("steps down from full to safe when the full strategy fails, and re-checks once", () => {
    const doc = load("claude-like");
    const { host, sheets } = fakeHost();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps(), guard: badWhen(doc, sheets, (css) => css.includes('input[type="submit"]')) });
    const r = a.apply({ ...planFor("midnight"), strategy: "full" });
    expect(r).toMatchObject({ ok: true, strategy: "safe", steppedDown: true });
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).not.toContain('input[type="submit"]');
    expect(doc.documentElement.getAttribute("data-skinly")).toBe("on");
  });

  it("rolls back with a visual reason when the lower strategy fails too, leaving the DOM byte-identical", () => {
    const doc = load("claude-like");
    const before = doc.documentElement.outerHTML;
    const { host, sheets } = fakeHost();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps(), guard: badWhen(doc, sheets, () => true) });
    expect(a.apply({ ...planFor("midnight"), strategy: "full" })).toEqual({ ok: false, reason: "visual", detail: ["text"] });
    expect(sheets).toHaveLength(0);
    expect(doc.documentElement.outerHTML).toBe(before);
    expect(a.isActive()).toBe(false);
  });

  it("a plan already at the last strategy rolls back without stepping", () => {
    const doc = load("claude-like");
    const { host, sheets } = fakeHost();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps(), guard: badWhen(doc, sheets, () => true) });
    expect(a.apply({ ...planFor("midnight"), strategy: "text-only" })).toMatchObject({ ok: false, reason: "visual" });
  });

  it("media that the sheet would change rolls the theme back", () => {
    const doc = load("hero-bg");
    const img = doc.querySelector("img.backdrop")!;
    const { host, sheets } = fakeHost();
    const guard: GuardProvider = {
      style: (el) => (el === img && sheets.length > 0 ? { ...GOOD, opacity: "0" } : GOOD),
      parentOf: (el) => el.parentElement,
      textParents: () => [],
      editables: () => [],
      media: () => [img],
    };
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps(), guard });
    expect(a.apply({ ...planFor("calm-light"), strategy: "safe" })).toEqual({ ok: false, reason: "visual", detail: ["media"] });
    expect(sheets).toHaveLength(0);
  });

  it("a good page keeps its strategy and does not step down", () => {
    const doc = load("light-article");
    const { host } = fakeHost();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps(), guard: provider(doc, new Map(), { text: [doc.querySelector("p")!] }) });
    expect(a.apply({ ...planFor("calm-light"), strategy: "full" })).toMatchObject({ ok: true, strategy: "full", steppedDown: false });
  });
});

describe("synthetic real-world fixtures never get damaging CSS", () => {
  const names = ["claude-like", "hero-bg", "light-article"];
  it.each(names.flatMap((n) => BUILTIN_THEME_IDS.map((t) => [n, t] as const)))("%s with %s", (name, theme) => {
    const doc = load(name);
    const { host, sheets } = fakeHost();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    expect(a.applyTheme(theme).ok).toBe(true);
    const css = sheets[0]!;
    expect(css).not.toMatch(/(^|[\s;{])background\s*:/);
    expect(css).not.toContain("background-image");
    expect(css).not.toMatch(/\b(img|picture|video|canvas|svg|iframe)\b/);
    expect(css).not.toMatch(/(^|[\s,])body\s*\{[^}]*background/);
    expect(css).not.toMatch(/(z-index|opacity|filter|mix-blend-mode|position|overflow|line-height|white-space|text-overflow)\s*:/);
    a.restore();
  });

  it("a dark page with a dark theme starts at safe, a light page with a dark theme at full, and a hero keeps backgrounds protected", () => {
    const summaryDark = { ...sampleSummary(), page: { tone: "dark" as const, bgImages: 0, largeMedia: 0, hasHeroMedia: false } };
    const plan = (s: ReturnType<typeof sampleSummary>) => import("../src/plan/themeToPlan.ts").then((m) => m.themeToPlan("midnight", s));
    return Promise.all([plan(summaryDark), plan(sampleSummary()), plan({ ...sampleSummary(), page: { tone: "light", bgImages: 3, largeMedia: 1, hasHeroMedia: true } })]).then(([dark, light, hero]) => {
      expect(dark.strategy).toBe("safe");
      expect(light.strategy).toBe("full");
      expect(light.protectBackgrounds).toBe(false);
      expect(hero.protectBackgrounds).toBe(true);
    });
  });

  it("compiling the claude-like page in the full strategy keeps buttons' inner text unrecoloured", () => {
    const css = compileCss({ ...planFor("calm-light"), strategy: "full", protectBackgrounds: false }, sampleSummary());
    expect(css).toContain(":not(:where(button *");
  });
});
