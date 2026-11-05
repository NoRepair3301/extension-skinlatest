import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { ENGINE_MARK, ROOT_MARK } from "../src/engine/dom.ts";
import { createApplier, type StyleHost } from "../src/extension/applier-core.ts";
import { compare, snapshot } from "../src/plan/invariants.ts";
import { BUILTIN_THEME_IDS } from "../src/themes/index.ts";
import { fakeDeps } from "./analyzer/helpers.ts";

export const LEGACY = ["legacy-portal-tables", "legacy-portal-fonts", "legacy-portal-frames"] as const;
const load = (n: string) => new JSDOM(readFileSync(`fixtures/web/${n}.html`, "utf8")).window.document;

const fakeHost = () => {
  const sheets: string[] = [];
  const host: StyleHost = {
    add(css) {
      sheets.push(css);
      return { remove: () => sheets.splice(sheets.indexOf(css), 1), isAttached: () => sheets.includes(css) };
    },
  };
  return { host, sheets };
};

// The only attribute writes the engine makes on page elements: its ledger marker and the inline style it paints with (root also gets ROOT_MARK).
const ENGINE_ATTRS = new Set([ENGINE_MARK, ROOT_MARK, "style"]);

/** Tag, attributes (minus the engine's own) and text of every node in document order. */
const outline = (doc: Document): string[] =>
  Array.from(doc.querySelectorAll("*")).map((e) =>
    `${e.localName}|${Array.from(e.attributes).filter((a) => !ENGINE_ATTRS.has(a.name)).map((a) => `${a.name}=${a.value}`).join(";")}|${Array.from(e.childNodes).filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join("")}`,
  );

describe.each(LEGACY)("legacy portal %s (the engine paints inline and restores exactly)", (name) => {
  it("applies every theme without moving, hiding or rebuilding a node; invariants hold (I1, I8, I6)", () => {
    const doc = load(name);
    const before = snapshot(doc);
    const nodes = outline(doc);
    const html = doc.documentElement.outerHTML;
    const { host } = fakeHost();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    for (const id of BUILTIN_THEME_IDS) {
      expect(a.applyTheme(id), id).toMatchObject({ ok: true });
      expect(compare(before, snapshot(doc))).toEqual([]);
      expect(outline(doc)).toEqual(nodes);
    }
    a.restore();
    expect(outline(doc)).toEqual(nodes);
    expect(doc.documentElement.outerHTML).toBe(html);
  });

  it("rolls back and restores the exact original markup", () => {
    const doc = load(name);
    const html = doc.documentElement.outerHTML;
    const { host, sheets } = fakeHost();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    a.applyTheme("midnight");
    a.restore();
    expect(doc.documentElement.outerHTML).toBe(html);
    expect(sheets).toHaveLength(0);

    // A planted violation (a link removed by a hook) still triggers rollback on legacy markup.
    const b = createApplier(doc, { style: host, summaryDeps: fakeDeps(), beforeInvariants: () => doc.querySelector("input")!.remove() });
    expect(b.applyTheme("ocean")).toMatchObject({ ok: false, reason: "invariants" });
    expect(sheets).toHaveLength(0);
    expect(doc.documentElement.hasAttribute("data-skinly")).toBe(false);
  });

  it("adds no attribute other than the engine marker and style, keeps every legacy attribute, and restore is byte-exact (I2, I6, D12)", () => {
    const doc = load(name);
    const html = doc.documentElement.outerHTML;
    const attrs = (d: Document) =>
      Array.from(d.querySelectorAll("*")).flatMap((e, i) => Array.from(e.attributes).filter((x) => !ENGINE_ATTRS.has(x.name)).map((x) => `${i}:${x.name}=${x.value}`));
    const before = attrs(doc);
    expect(before.some((x) => /:(bgcolor|color|border|cellpadding|background)=/.test(x))).toBe(true);
    const { host } = fakeHost();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    expect(a.applyTheme("warm-paper")).toMatchObject({ ok: true });
    // while themed: nothing but ENGINE_MARK/style differs, so every legacy attribute keeps its exact value
    expect(attrs(doc)).toEqual(before);
    expect(doc.querySelectorAll(`[${ENGINE_MARK}]`).length).toBeGreaterThan(0);
    a.restore();
    expect(doc.documentElement.outerHTML).toBe(html);
  });
});

describe("legacy markup is themed from computed style, not attribute selectors", () => {
  it("td[bgcolor] ends up with an engine-written background, no structural selector is emitted, and restore is exact (D12)", () => {
    const doc = load("legacy-portal-tables");
    const html = doc.documentElement.outerHTML;
    const { host, sheets } = fakeHost();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    expect(a.applyTheme("calm-light")).toMatchObject({ ok: true });
    const cells = Array.from(doc.querySelectorAll("td[bgcolor]"));
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.some((td) => td.hasAttribute(ENGINE_MARK) && (td as HTMLElement).style.getPropertyValue("background-color") !== "")).toBe(true);
    for (const css of sheets) for (const attr of ["td[bgcolor]", "body[bgcolor]", "font[color]", "table[border]"]) expect(css).not.toContain(attr);
    a.restore();
    expect(doc.documentElement.outerHTML).toBe(html);
    expect(sheets).toHaveLength(0);
  });
});
