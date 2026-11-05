import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { createApplier, type StyleHost } from "../src/extension/applier-core.ts";
import { markerCleanup } from "../src/extension/cleanup.ts";
import { parseSite, parseSites } from "../src/extension/sites.ts";
import { fakeDeps } from "./analyzer/helpers.ts";
import { planFor } from "./plan/helpers.ts";

/** A document whose adoptedStyleSheets work like the browser's: sheets keep their first rule, which is how markers find ours. */
function realDoc(name = "light-article") {
  const dom = new JSDOM(readFileSync(`fixtures/web/${name}.html`, "utf8"));
  const doc = dom.window.document;
  class Sheet {
    cssRules: Array<{ selectorText: string }> = [];
    replaceSync(css: string): void {
      this.cssRules = [{ selectorText: css.split("{")[0]!.trim() }];
    }
  }
  (dom.window as unknown as { CSSStyleSheet: unknown }).CSSStyleSheet = Sheet;
  let sheets: unknown[] = [];
  Object.defineProperty(doc, "adoptedStyleSheets", { configurable: true, get: () => sheets, set: (v: unknown[]) => void (sheets = v) });
  const host: StyleHost = {
    add(css) {
      const s = new (dom.window as unknown as { CSSStyleSheet: new () => Sheet }).CSSStyleSheet();
      s.replaceSync(css);
      sheets = [...sheets, s];
      return { remove: () => void (sheets = sheets.filter((x) => x !== s)), isAttached: () => sheets.includes(s) };
    },
  };
  return { doc, host, sheets: () => sheets };
}

describe("Restore without a ledger (fresh script instance, navigated page)", () => {
  it("a second instance removes what the first one added: sheets, attributes, hosts", () => {
    const { doc, host, sheets } = realDoc();
    const before = doc.documentElement.outerHTML;
    const first = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    expect(first.apply({ ...planFor("midnight"), regionRules: [] }).ok).toBe(true);
    const ui = doc.createElement("div");
    ui.setAttribute("data-skinly-ui", "pet");
    doc.body.append(ui);
    expect(sheets().length).toBeGreaterThan(0);
    expect(doc.documentElement.getAttribute("data-skinly")).toBe("on");

    const second = createApplier(doc, { style: host, summaryDeps: fakeDeps() }); // knows nothing about the first
    expect(second.isActive()).toBe(false);
    expect(second.restore()).toEqual({ ok: true });
    expect(sheets()).toHaveLength(0);
    expect(doc.querySelector("[data-skinly-ui]")).toBeNull();
    expect(doc.documentElement.hasAttribute("data-skinly")).toBe(false);
    expect(doc.documentElement.outerHTML).toBe(before);
  });

  it("a page with leftovers from before navigation is cleaned, and the page's own sheets and attributes are not touched", () => {
    const { doc, sheets, host } = realDoc("hero-bg");
    doc.documentElement.setAttribute("data-skinly", "on");
    doc.querySelector("p")!.setAttribute("data-skinly-r", "r3");
    const scene = doc.createElement("div");
    scene.setAttribute("data-skinly-scene", "");
    doc.body.append(scene);
    host.add('html[data-skinly="on"]:not(#skinly-force) { color: #000000 !important; }');
    host.add(".site-own { color: red }");
    markerCleanup(doc);
    expect(doc.querySelector("[data-skinly-scene]")).toBeNull();
    expect(doc.querySelector("[data-skinly-r]")).toBeNull();
    expect(doc.documentElement.hasAttribute("data-skinly")).toBe(false);
    expect(sheets()).toHaveLength(1); // the site's own stays
    expect(doc.querySelector("img.backdrop")).not.toBeNull();
  });

  it("restoring twice, or on a page we never touched, is harmless", () => {
    const { doc, host } = realDoc();
    const before = doc.documentElement.outerHTML;
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    expect(a.restore()).toEqual({ ok: true });
    expect(a.restore()).toEqual({ ok: true });
    expect(doc.documentElement.outerHTML).toBe(before);
  });
});

// D13: stored repair CSS is no longer applied by anything. An older version may have written it into a site record, so the record
// must still load, the CSS must go nowhere, and Restore must leave no sheet.
describe("a stored record that still carries repair rules (D13)", () => {
  const stored = 'html[data-skinly="on"]:not(#skinly-force) > body > p:nth-child(2) { color: #112233 !important; background-color: #ffffff !important; }\n';
  const old = {
    v: 1,
    plan: { ...planFor("midnight"), regionRules: [] },
    fingerprint: { hash: "00000000", seq: "" },
    provider: "builtin",
    model: "builtin",
    promptVersion: "6",
    savedAt: "2026-10-30T10:00:00.000Z",
    mode: "auto",
    blur: [],
    blurImages: false,
    repairCss: stored,
  };

  it("loads, and the field is not carried into the parsed record (so it is never written back)", () => {
    const rec = parseSite(old);
    expect(rec).toBeDefined();
    expect(rec!.plan.themeId).toBe("midnight");
    expect("repairCss" in rec!).toBe(false);
    expect(JSON.stringify(parseSites({ "https://a.example": old }))).not.toContain("112233");
  });

  it("applies the theme only: the stored CSS is injected nowhere, and Restore leaves no sheet", () => {
    const { doc, host, sheets } = realDoc();
    const before = doc.documentElement.outerHTML;
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps(), tokensOnly: true });
    expect(a.applyTokens(parseSite(old)!.plan).ok).toBe(true);
    expect(sheets()).toHaveLength(1);
    expect(doc.documentElement.outerHTML).not.toContain("112233");
    a.restore();
    expect(sheets()).toHaveLength(0);
    expect(doc.documentElement.outerHTML).toBe(before);
  });
});
