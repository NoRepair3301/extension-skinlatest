import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { createApplier, type StyleHandle, type StyleHost } from "../src/extension/applier-core.ts";
import { contrastRatio, isDark } from "../src/plan/contrast.ts";
import { parseRgb, toHex } from "../src/engine/color.ts";
import { getTheme, THEMES, type Theme } from "../src/themes/index.ts";
import { fakeDeps } from "./analyzer/helpers.ts";
import { planFor } from "./plan/helpers.ts";

const load = (n: string) => new JSDOM(readFileSync(`fixtures/web/${n}.html`, "utf8")).window.document;
const TEXTY = "h1, h2, p, span, a, button, label, li";

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
