import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { createApplier, type StyleHandle, type StyleHost } from "../src/extension/applier-core.ts";
import { ALLOWED_PROPERTIES } from "../src/plan/compile.ts";
import { backdrop, captureMedia, effectiveBackground, mediaIntact, type GuardProvider, type GuardStyle } from "../src/plan/guard.ts";
import { addFailures, audit, pathOf, pickColor, repairCss, snapshotText, REPAIR_CSS_MAX, type RuleBook } from "../src/plan/readability.ts";
import { contrastRatio } from "../src/plan/contrast.ts";
import { parseColor } from "../src/analyzer/summary.ts";
import { getTheme } from "../src/themes/index.ts";
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
    for (const m of css.matchAll(/{([^{}]*)}/g)) for (const d of m[1]!.split(";").filter((x) => x.trim())) expect(ALLOWED_PROPERTIES.has(d.split(":")[0]!.trim())).toBe(true);
    const huge: RuleBook = new Map();
    for (let i = 0; i < 5000; i++) huge.set(`${"x".repeat(60)}${i}`, { color: "#ffffff" });
    expect(repairCss(huge).length).toBeLessThanOrEqual(REPAIR_CSS_MAX);
  });
});

describe("the theme always goes on and unreadable text is repaired", () => {
  /** Light text everywhere on a white page: the worst case for a light theme. */
  const washOut = (el: Element, s: GuardStyle): GuardStyle => (el.localName === "html" ? s : { ...s, color: "rgb(250, 250, 250)" });

  it.each(["claude-like", "light-article", "hero-bg"])("%s: apply is never refused, and every sampled pair reaches 4.5 or keeps the site's colours", (name) => {
    const doc = load(name);
    const { host, sheets } = fakeHost();
    const model: Model = { base: new Map(), theme: name === "claude-like" ? (el, s) => (el.localName === "html" ? s : { ...s, color: "rgb(10, 10, 10)" }) : washOut };
    if (name === "hero-bg") {
      for (const sel of [".hero", ".tile"]) model.base.set(doc.querySelector(sel)!, { backgroundImage: 'url("h.jpg")', color: "rgb(255, 255, 255)" });
      model.base.set(doc.querySelector(".hero h1")!, { color: "rgb(255, 255, 255)" });
    }
    if (name === "claude-like") for (const e of [doc.documentElement, doc.body]) model.base.set(e, { backgroundColor: "rgb(31, 30, 29)", color: "rgb(236, 233, 226)" });
    const guard = cascade(doc, sheets, model);
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps(), guard });
    const r = a.apply({ ...planFor("calm-light"), strategy: "full" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.samples).toBeGreaterThan(0);
    const t = getTheme("calm-light").tokens;
    const left = audit(guard, snapshotText(guard), t).failures.filter((f) => f.ratio > 0);
    expect(left).toEqual([]);
    const repair = sheets.find((s) => s.includes("skinly-force) > "));
    if (name !== "hero-bg") expect(repair).toBeDefined();
    if (repair) for (const m of repair.matchAll(/\{([^{}]*)\}/g)) for (const d of m[1]!.split(";").filter((x) => x.trim())) expect(["color", "background-color"]).toContain(d.split(":")[0]!.trim());
  });

  it("text over a picture or gradient gets its recorded original colour back", () => {
    const doc = load("hero-bg");
    const { host, sheets } = fakeHost();
    const h1 = doc.querySelector(".hero h1")!;
    const model: Model = { base: new Map([[doc.querySelector(".hero")!, { backgroundImage: "linear-gradient(#123, #456)" }], [h1, { color: "rgb(255, 255, 255)" }]]), theme: washOut };
    const guard = cascade(doc, sheets, model);
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps(), guard });
    expect(a.apply({ ...planFor("calm-light"), strategy: "full" }).ok).toBe(true);
    const repair = sheets.find((s) => s.includes("skinly-force) > "))!;
    expect(repair).toContain("color: #ffffff !important");
    expect(guard.style(h1).color).toBe("rgb(255, 255, 255)");
  });

  it("repair rules never name media and never carry text, ids or classes", () => {
    const doc = load("hero-bg");
    const { host, sheets } = fakeHost();
    const guard = cascade(doc, sheets, { base: new Map(), theme: washOut });
    createApplier(doc, { style: host, summaryDeps: fakeDeps(), guard }).apply({ ...planFor("calm-light"), strategy: "full" });
    const repair = sheets.find((s) => s.includes("skinly-force) > "))!;
    expect(repair).not.toMatch(/\b(img|picture|video|canvas|svg|iframe)\b/);
    expect(repair).not.toMatch(/Big headline|Short line|Plain paragraph|#hero|\.hero|\.tile|class=|href/);
  });

  it("a theme that changes how a picture shows steps down the ladder, but is never refused", () => {
    const doc = load("hero-bg");
    const img = doc.querySelector("img.backdrop")!;
    const { host, sheets } = fakeHost();
    const guard: GuardProvider = { ...cascade(doc, sheets, { base: new Map() }), media: () => [img] };
    const base = guard.style;
    guard.style = (el) => (el === img && sheets.some((c) => c.includes("input[type=\"submit\"]")) ? { ...base(el), opacity: "0" } : base(el));
    const r = createApplier(doc, { style: host, summaryDeps: fakeDeps(), guard }).apply({ ...planFor("calm-light"), strategy: "full" });
    expect(r).toMatchObject({ ok: true, steppedDown: true, strategy: "safe" });
  });

  it("Restore leaves the document byte-identical and removes both sheets", () => {
    const doc = load("claude-like");
    const before = doc.documentElement.outerHTML;
    const { host, sheets } = fakeHost();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps(), guard: cascade(doc, sheets, { base: new Map(), theme: washOut }) });
    expect(a.apply({ ...planFor("calm-light"), strategy: "full" }).ok).toBe(true);
    expect(sheets.length).toBe(2);
    a.restore();
    expect(sheets).toHaveLength(0);
    expect(doc.documentElement.outerHTML).toBe(before);
  });

  it("a page that re-renders gets repaired again by the bounded observer", async () => {
    const doc = load("light-article");
    const { host, sheets } = fakeHost();
    const guard = cascade(doc, sheets, { base: new Map(), theme: washOut });
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps(), guard, observer: { debounceMs: 5, maxPerMinute: 100 } });
    expect(a.apply({ ...planFor("calm-light"), strategy: "full" }).ok).toBe(true);
    const p = doc.createElement("p");
    p.textContent = "late content";
    doc.body.append(p);
    await new Promise((r) => setTimeout(r, 60));
    expect(guard.style(p).color).not.toBe("rgb(250, 250, 250)");
    expect(parseColor(guard.style(p).color)).not.toBeNull();
    a.restore();
  });

  it("the new pairs are collected by structural path only", () => {
    const doc = load("light-article");
    const book: RuleBook = new Map();
    const guard = cascade(doc, ["x"], { base: new Map(), theme: washOut });
    const n = addFailures(book, audit(guard, snapshotText(guard), getTheme("calm-light").tokens).failures);
    expect(n).toBeGreaterThan(0);
    for (const k of book.keys()) expect(k.startsWith('html[data-skinly="on"]:not(#skinly-force) > ')).toBe(true);
  });
});
