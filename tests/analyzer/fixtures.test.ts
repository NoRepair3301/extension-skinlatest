import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyzer/analyze.ts";
import { fakeDeps } from "./helpers.ts";

const DIR = "fixtures/web";
const names = readdirSync(DIR)
  .filter((f) => f.endsWith(".html"))
  .map((f) => f.replace(/\.html$/, ""))
  .sort();

const load = (name: string): Document => new JSDOM(readFileSync(`${DIR}/${name}.html`, "utf8")).window.document;

const golden = (a: Extract<ReturnType<typeof analyze>, { status: "ok" }>) => ({
  counts: a.summary.counts,
  risk: a.summary.risk,
  regions: a.summary.regions.map((r) => ({ id: r.id, role: r.role, childCount: r.childCount, linkCount: r.linkCount })),
});

describe("fixtures", () => {
  it("has at least 10 fixtures", () => {
    expect(names.length).toBeGreaterThanOrEqual(10);
  });

  describe.each(names)("%s", (name) => {
    it("analyses without throwing, within limits, identically on two runs", () => {
      const a = analyze(load(name), fakeDeps());
      const b = analyze(load(name), fakeDeps());
      expect(a.status).toBe("ok");
      if (a.status !== "ok") return;
      expect(a.summary.regions.length).toBeGreaterThanOrEqual(1);
      expect(a.summary.regions.length).toBeLessThanOrEqual(40);
      expect(JSON.stringify(a.summary).length).toBeLessThanOrEqual(20 * 1024);
      expect(JSON.stringify(a.summary)).toBe(JSON.stringify((b as typeof a).summary));
      expect(a.fingerprint).toEqual((b as typeof a).fingerprint);
    });

    it("matches its golden file", () => {
      const a = analyze(load(name), fakeDeps());
      if (a.status !== "ok") throw new Error("too large");
      const path = `${DIR}/${name}.expected.json`;
      const text = JSON.stringify(golden(a), null, 2) + "\n";
      if (process.env["UPDATE_GOLDEN"] === "1" || !existsSync(path)) writeFileSync(path, text);
      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(JSON.parse(text));
    });

    it("leaks none of the page's text, hrefs, ids, alt, title, aria-label, data-* or values", () => {
      const marker = "zqxleakmarker";
      const doc = load(name);
      const walker = doc.createTreeWalker(doc, 4);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) n.nodeValue = marker + "text";
      let i = 0;
      for (const el of Array.from(doc.querySelectorAll("*"))) {
        el.setAttribute("id", `${marker}id${i++}`);
        el.setAttribute("title", marker + "title");
        el.setAttribute("aria-label", marker + "label");
        el.setAttribute("data-leak", marker + "data");
        el.setAttribute("href", `${marker}/path`);
        el.setAttribute("alt", marker + "alt");
        el.setAttribute("value", marker + "value");
      }
      const a = analyze(doc, fakeDeps());
      expect(JSON.stringify(a)).not.toContain(marker);
    });

    it("does not change the document", () => {
      const doc = load(name);
      const before = doc.documentElement.outerHTML;
      const observer = new doc.defaultView!.MutationObserver(() => {});
      observer.observe(doc, { subtree: true, childList: true, attributes: true, characterData: true });
      analyze(doc, fakeDeps());
      expect(observer.takeRecords()).toHaveLength(0);
      expect(doc.documentElement.outerHTML).toBe(before);
    });
  });
});
