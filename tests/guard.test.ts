import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { createApplier, type StyleHandle, type StyleHost } from "../src/extension/applier-core.ts";
import { backdrop, captureMedia, effectiveBackground, mediaIntact, type GuardProvider, type GuardStyle } from "../src/plan/guard.ts";
import { addFailures, audit, pathOf, pickColor, repairCss, snapshotText, REPAIR_CSS_MAX, type RuleBook } from "../src/plan/readability.ts";
import { contrastRatio, isDark } from "../src/plan/contrast.ts";
import { parseRgb, toHex } from "../src/engine/color.ts";
import { getTheme, THEMES, type Theme } from "../src/themes/index.ts";
import { fakeDeps } from "./analyzer/helpers.ts";
import { planFor } from "./plan/helpers.ts";

const load = (n: string) => new JSDOM(readFileSync(`fixtures/web/${n}.html`, "utf8")).window.document;
const GOOD: GuardStyle = { color: "rgb(20, 20, 20)", backgroundColor: "rgba(0, 0, 0, 0)", backgroundImage: "none", caretColor: "auto", display: "block", visibility: "visible", opacity: "1", filter: "none" };
const TEXTY = "h1, h2, p, span, a, button, label, li";

interface Model {
  /** The page as the site draws it. */
  base: Map<Element, Partial<GuardStyle>>;
  /** What the theme does to an element once it is on (before repairs). */
  theme?: (el: Element, s: GuardStyle) => GuardStyle;
}

const hexToRgb = (h: string): string => (h === "transparent" ? "rgba(0, 0, 0, 0)" : `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`);

/** A tiny cascade: site styles, then the theme's effect once a sheet is on, then repair rules read back out of the repair sheet. */
function cascade(doc: Document, sheets: string[], m: Model): GuardProvider {
  const style = (el: Element): GuardStyle => {
    let s: GuardStyle = { ...GOOD, ...(el === doc.documentElement ? { backgroundColor: "rgb(255, 255, 255)" } : {}), ...m.base.get(el) };
    if (sheets.length > 0 && m.theme) s = m.theme(el, s);
    for (const css of sheets.filter((c) => c.includes("skinly-force) > "))) {
      for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!rule[1]!.split(",").some((sel) => el.matches(sel.trim()))) continue;
        for (const d of rule[2]!.split(";")) {
          const [prop, value] = d.split(":").map((x) => x.replace("!important", "").trim());
          if (prop === "color") s = { ...s, color: hexToRgb(value!) };
          if (prop === "background-color") s = { ...s, backgroundColor: hexToRgb(value!) };
        }
      }
    }
    return s;
  };
  return {
    style,
    parentOf: (el) => el.parentElement,
    textParents: () => Array.from(doc.body.querySelectorAll(TEXTY)).filter((e) => Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim() !== "")),
    editables: () => Array.from(doc.querySelectorAll('[contenteditable="true"]')),
    media: () => Array.from(doc.querySelectorAll("img")),
  };
}

const fakeHost = () => {
  const sheets: string[] = [];
  const host: StyleHost = {
    add(css) {
      sheets.push(css);
      return { remove: () => void sheets.splice(sheets.indexOf(css), 1), isAttached: () => sheets.includes(css) } satisfies StyleHandle;
    },
  };
  return { host, sheets };
};

describe("guard readings (pure)", () => {
  const doc = load("claude-like");

  it("finds the colour behind through translucent ancestors", () => {
    const p1 = doc.querySelector("main p")!;
    const m: Model = { base: new Map([[doc.querySelector(".card")!, { backgroundColor: "rgba(0, 0, 0, 0.5)" }]]) };
    expect(effectiveBackground(cascade(doc, [], m), p1)).toBe("#808080");
  });

  it("an image or gradient in the chain makes the colour behind unknown but is reported", () => {
    const p1 = doc.querySelector("main p")!;
    const m: Model = { base: new Map([[doc.querySelector(".card")!, { backgroundImage: "linear-gradient(red, blue)" }]]) };
    const p = cascade(doc, [], m);
    expect(effectiveBackground(p, p1)).toBeNull();
    expect(backdrop(p, p1)!.image).toBe(true);
  });

  it("media is intact until display, visibility, opacity, filter or its background image change", () => {
    const hero = load("hero-bg");
    const img = hero.querySelector("img.backdrop")!;
    const tile = hero.querySelector(".tile")!;
    const styles = new Map<Element, Partial<GuardStyle>>([[tile, { backgroundImage: 'url("t.jpg")' }]]);
    const p: GuardProvider = { ...cascade(hero, [], { base: styles }), media: () => [img, tile] };
    const before = captureMedia(p);
    expect(mediaIntact(p, before)).toBe(true);
    for (const change of [{ opacity: "0" }, { visibility: "hidden" }, { display: "none" }, { filter: "blur(4px)" }]) {
      styles.set(img, change);
      expect(mediaIntact(p, before), JSON.stringify(change)).toBe(false);
    }
    styles.delete(img);
    styles.set(tile, { backgroundImage: "none" });
    expect(mediaIntact(p, before)).toBe(false);
  });
});

describe("repair decisions", () => {
  const t = getTheme("midnight").tokens;

  it("picks the nearest theme text colour that reads, else black or white", () => {
    const c = pickColor("#fafafa", "#101010", t);
    expect(contrastRatio(c, "#101010")).toBeGreaterThanOrEqual(4.5);
    expect(["#000000", "#ffffff"].includes(pickColor("#777777", "#777777", t)) || contrastRatio(pickColor("#777777", "#777777", t), "#777777") >= 4.5).toBe(true);
  });

  it("paths are structural: tags and positions from html, no ids, classes, text or attributes", () => {
    const doc = load("claude-like");
    const path = pathOf(doc.querySelector(".card p")!)!;
    expect(path).toMatch(/^html\[data-skinly="on"\]:not\(#skinly-force\) > body > div:nth-child\(\d+\) > /);
    expect(path.replace('html[data-skinly="on"]:not(#skinly-force)', "")).not.toMatch(/[.#]\w|\[|ordinary text/);
  });

  it("groups by colour pair, emits colour and background-color only, and stays under the cap", () => {
    const doc = load("claude-like");
    const book: RuleBook = new Map();
    for (const el of Array.from(doc.querySelectorAll("*"))) {
      const p = pathOf(el);
      if (p) book.set(p, { color: "#ffffff" });
    }
    const css = repairCss(book);
    expect(css.match(/\{/g)!.length).toBe(1);
    for (const m of css.matchAll(/{([^{}]*)}/g)) for (const d of m[1]!.split(";").filter((x) => x.trim())) expect(["color", "background-color"]).toContain(d.split(":")[0]!.trim());
    const huge: RuleBook = new Map();
    for (let i = 0; i < 5000; i++) huge.set(`${"x".repeat(60)}${i}`, { color: "#ffffff" });
    expect(repairCss(huge).length).toBeLessThanOrEqual(REPAIR_CSS_MAX);
  });
});

// The theme goes on through the real path (applier -> engine) and Restore gives the page back. The old
// tests here drove a repair pass that no longer exists (see TEST_CLASSIFICATION S3.2); these assert the
// promises that survive it, measured on the document the engine actually painted.
const fixtureHost = () => {
  const { host, sheets } = fakeHost();
  return { host, sheets };
};

const floorOf = (theme: Theme): number => (theme.id === "high-contrast" ? 7 : 4.5);
const hasPicture = (el: Element): boolean => {
  const view = el.ownerDocument.defaultView!;
  for (let n: Element | null = el; n; n = n.parentElement) {
    const bi = view.getComputedStyle(n).backgroundImage;
    if (bi && bi !== "none") return true;
  }
  return false;
};

/** Every text element with its contrast against the first opaque background behind it. Text over a picture is skipped: its backdrop is unknown. */
function textPairs(doc: Document, theme: Theme): Array<{ label: string; ratio: number }> {
  const view = doc.defaultView!;
  const out: Array<{ label: string; ratio: number }> = [];
  for (const el of Array.from(doc.body.querySelectorAll(TEXTY))) {
    if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim() !== "") || hasPicture(el)) continue;
    const fg = parseRgb(view.getComputedStyle(el).color)!;
    let bg = theme.tokens.bg;
    for (let n: Element | null = el; n; n = n.parentElement) {
      const c = parseRgb(view.getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.99) {
        bg = toHex(c.r, c.g, c.b);
        break;
      }
    }
    out.push({ label: `${el.localName}"${el.textContent!.trim().slice(0, 20)}" ${toHex(fg.r, fg.g, fg.b)} on ${bg}`, ratio: contrastRatio(toHex(fg.r, fg.g, fg.b), bg) });
  }
  return out;
}

const belowFloor = (doc: Document, theme: Theme): string[] => textPairs(doc, theme).filter((p) => p.ratio < floorOf(theme)).map((p) => `${p.ratio.toFixed(1)} ${p.label}`);

describe("the theme goes on through the engine and text stays readable", () => {
  it.each(["light-article", "hero-bg"].flatMap((name) => THEMES.map((t) => [name, t.id, t] as const)))("%s under %s: apply is never refused and every text pair reaches the floor", (name, _id, theme) => {
    const doc = load(name);
    const { host } = fixtureHost();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    expect(a.apply(planFor(theme.id)).ok).toBe(true);
    expect(belowFloor(doc, theme)).toEqual([]);
    a.restore();
  });

  it.each(["claude-like", "light-article", "hero-bg"])("%s: Restore leaves the document byte-identical and removes the engine sheet", (name) => {
    const doc = load(name);
    const before = doc.documentElement.outerHTML;
    const { host, sheets } = fixtureHost();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    expect(a.apply(planFor("midnight")).ok).toBe(true);
    expect(sheets.length).toBe(1);
    expect(doc.documentElement.outerHTML).not.toBe(before);
    a.restore();
    expect(sheets).toHaveLength(0);
    expect(doc.documentElement.outerHTML).toBe(before);
  });
});

// BUG (reported in S3.2, not fixed there): the engine skips a colour that equals its parent's computed
// colour, assuming it is inherited. `html, body { color: X }` declares it twice, so html is repainted and
// body keeps X: on a natively dark page under a light theme the text stays light on a light background
// (1.0:1 in this fixture). Only the light themes are listed; the dark ones see the page's own look.
describe("BUG: a colour declared on both html and body is repainted", () => {
  it.each(THEMES.filter((t) => !isDark(t.tokens.bg)).map((t) => [t.id, t] as const))("claude-like under %s: every text pair reaches the floor", (_id, theme) => {
    const doc = load("claude-like");
    const { host } = fixtureHost();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    expect(a.apply(planFor(theme.id)).ok).toBe(true);
    expect(belowFloor(doc, theme)).toEqual([]);
    a.restore();
  });
});

// BUG (reported in S3.2, not fixed there): old promise "text over a picture or gradient gets its recorded
// original colour back". makeTransform decides a text colour from the theme background only, so white
// text over a hero picture becomes mid-grey under a light theme.
describe("BUG: text keeps the floor against the element's own colour", () => {
  it("claude-like under midnight: the Send button's white text on its accent background", () => {
    const doc = load("claude-like");
    const theme = getTheme("midnight");
    const { host } = fixtureHost();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    expect(a.apply(planFor("midnight")).ok).toBe(true);
    expect(belowFloor(doc, theme)).toEqual([]);
    a.restore();
  });
});

// BUG (same cause): text over a picture.
describe("BUG: text over a picture keeps its colour", () => {
  it("hero-bg under calm-light: white text over the hero and tile pictures stays white", () => {
    const doc = load("hero-bg");
    const { host } = fixtureHost();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    expect(a.apply(planFor("calm-light")).ok).toBe(true);
    const view = doc.defaultView!;
    for (const sel of [".hero h1", ".hero p", ".tile h2"]) expect(view.getComputedStyle(doc.querySelector(sel)!).color, sel).toBe("rgb(255, 255, 255)");
    a.restore();
  });
});

describe("repair bookkeeping (structural paths)", () => {
  /** Light text everywhere on a white page: the worst case for a light theme. */
  const washOut = (el: Element, s: GuardStyle): GuardStyle => (el.localName === "html" ? s : { ...s, color: "rgb(250, 250, 250)" });

  it("the new pairs are collected by structural path only", () => {
    const doc = load("light-article");
    const book: RuleBook = new Map();
    const guard = cascade(doc, ["x"], { base: new Map(), theme: washOut });
    const n = addFailures(book, audit(guard, snapshotText(guard), getTheme("calm-light").tokens).failures);
    expect(n).toBeGreaterThan(0);
    for (const k of book.keys()) expect(k.startsWith('html[data-skinly="on"]:not(#skinly-force) > ')).toBe(true);
  });
});
