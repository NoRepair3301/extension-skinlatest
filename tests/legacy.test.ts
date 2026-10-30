import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
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

/** Tag, attributes (minus ours) and text of every node in document order. */
const outline = (doc: Document): string[] =>
  Array.from(doc.querySelectorAll("*")).map((e) =>
    `${e.localName}|${Array.from(e.attributes).filter((a) => !a.name.startsWith("data-skinly")).map((a) => `${a.name}=${a.value}`).join(";")}|${Array.from(e.childNodes).filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join("")}`,
  );

describe.each(LEGACY)("legacy portal %s (hard force is CSS only)", (name) => {
  it("applies every theme without moving, hiding or rebuilding a node; invariants hold", () => {
    const doc = load(name);
    const before = snapshot(doc);
    const nodes = outline(doc);
    const { host } = fakeHost();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    for (const id of BUILTIN_THEME_IDS) {
      expect(a.applyTheme(id), id).toMatchObject({ ok: true });
      expect(compare(before, snapshot(doc))).toEqual([]);
      expect(outline(doc)).toEqual(nodes);
    }
    a.restore();
    expect(outline(doc)).toEqual(nodes);
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

  it("adds no attribute other than data-skinly-* and keeps every legacy attribute", () => {
    const doc = load(name);
    const attrs = (d: Document) => Array.from(d.querySelectorAll("*")).flatMap((e) => Array.from(e.attributes).map((x) => x.name)).filter((n) => !n.startsWith("data-skinly")).sort();
    const before = attrs(doc);
    const { host } = fakeHost();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    a.applyTheme("warm-paper");
    expect(attrs(doc)).toEqual(before);
    for (const legacy of ["bgcolor", "background", "color", "border", "cellpadding"]) {
      const had = before.includes(legacy);
      if (had) expect(attrs(doc)).toContain(legacy);
    }
  });
});

describe("legacy markup is targeted by attribute selectors", () => {
  it("the compiled sheet reaches the attributes the fixtures use", () => {
    const doc = load("legacy-portal-tables");
    const { host, sheets } = fakeHost();
    createApplier(doc, { style: host, summaryDeps: fakeDeps() }).applyTheme("calm-light");
    const css = sheets[0]!;
    for (const attr of ["td[bgcolor]", "tr[bgcolor]", "body[bgcolor]", "body[background]", "font[color]", "table[border]", "table[cellpadding]", 'td[style*="background"]']) expect(css).toContain(attr);
    for (const sel of ["body[bgcolor]", "td[bgcolor]", "font[color]", "table[border]"]) expect(doc.querySelector(sel), sel).not.toBeNull();
  });
});
