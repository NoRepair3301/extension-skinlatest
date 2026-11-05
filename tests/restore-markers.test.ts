import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { createApplier, type StyleHost } from "../src/extension/applier-core.ts";
import { markerCleanup } from "../src/extension/cleanup.ts";
import { parseRepairCss, REPAIR_ROOT, STORED_REPAIR_MAX } from "../src/plan/readability.ts";
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

describe("stored repair rules", () => {
  const good = `${REPAIR_ROOT} > body > p:nth-child(2), ${REPAIR_ROOT} > body > div:nth-child(1) > a:nth-child(3) { color: #112233 !important; background-color: #ffffff !important; }\n`;

  it("accepts exactly what repairCss writes", () => {
    const book = parseRepairCss(good);
    expect(book?.size).toBe(2);
    expect([...book!.values()][0]).toEqual({ color: "#112233", bg: "#ffffff" });
  });

  it.each([
    ["a foreign selector", "body { color: #000000 !important; }\n"],
    ["an id selector", `${REPAIR_ROOT} > body > div#x:nth-child(1) { color: #000000 !important; }\n`],
    ["an attribute value", `${REPAIR_ROOT} > body > a[href="x"] { color: #000000 !important; }\n`],
    ["another property", `${REPAIR_ROOT} > body > p:nth-child(1) { background-image: none !important; }\n`],
    ["a url", `${REPAIR_ROOT} > body > p:nth-child(1) { color: url(x) !important; }\n`],
    ["a non-hex colour", `${REPAIR_ROOT} > body > p:nth-child(1) { color: red !important; }\n`],
    ["an @import", '@import "x";\n'],
    ["too big", good.repeat(Math.ceil(STORED_REPAIR_MAX / good.length) + 1)],
  ])("rejects %s", (_n, css) => expect(parseRepairCss(css)).toBeUndefined());

  it("a stored sheet is in place before the page is analysed", () => {
    const { doc, host, sheets } = realDoc();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps(), tokensOnly: true });
    expect(a.applyTokens(planFor("midnight"), good).ok).toBe(true);
    expect(sheets()).toHaveLength(2);
    expect(a.repairRules()).toContain("color: #112233 !important");
    a.restore();
    expect(sheets()).toHaveLength(0);
  });

  // BUG (reported in S3.2, not fixed there): since the engine rewrite (ed29e6b) applier-core injects seedCss
  // verbatim; the parseRepairCss check that made an unusable sheet harmless was dropped with the repair pass.
  // Today every caller passes a record that sites.ts already validated, so nothing reaches this in practice,
  // but the applier itself accepts any string. See workflow/S3.2_PROPOSED.patch.
  it("BUG: an unusable stored sheet is ignored", () => {
    const { doc, host, sheets } = realDoc();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps(), tokensOnly: true });
    expect(a.applyTokens(planFor("midnight"), "body { display: none }").ok).toBe(true);
    expect(sheets()).toHaveLength(1);
    expect(a.repairRules()).toBe("");
  });
});
