import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALLOWED_PROPERTIES, compileCss, FONT_STACKS } from "../../src/plan/compile.ts";
import { FONT_KEYS } from "../../src/plan/schema.ts";
import { BUILTIN_THEME_IDS } from "../../src/themes/index.ts";
import { planFor, region, SAMPLE_RULES, sampleSummary } from "./helpers.ts";

const blocks = (css: string) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1]!.split(",").map((s) => s.trim()),
    decls: m[2]!.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
      const i = d.indexOf(":");
      return { prop: d.slice(0, i).trim(), value: d.slice(i + 1).replace("!important", "").trim() };
    }),
  }));

describe("compileCss", () => {
  describe.each(BUILTIN_THEME_IDS)("%s", (id) => {
    const css = compileCss(planFor(id, SAMPLE_RULES), sampleSummary());

    it("uses only allowlisted properties", () => {
      for (const b of blocks(css)) for (const d of b.decls) expect(ALLOWED_PROPERTIES.has(d.prop)).toBe(true);
    });
    it("scopes every selector under html[data-skinly=\"on\"]", () => {
      for (const b of blocks(css)) for (const s of b.selectors) expect(s.startsWith('html[data-skinly="on"]')).toBe(true);
    });
    it("contains no dangerous constructs", () => {
      for (const bad of ["url(", "@import", "expression", "content:", "position:", "z-index", "visibility", "display: none", "opacity", "transform", "filter", "pointer-events", "cursor", "overflow", "javascript"]) {
        expect(css).not.toContain(bad);
      }
      expect(css).not.toMatch(/(^|[^-])(width|height)\s*:/);
      expect(css).not.toMatch(/\b(img|video|canvas|svg|iframe|picture)\b/);
    });
    it("only has hex, enum or bounded-number values", () => {
      for (const b of blocks(css)) for (const d of b.decls) expect(d.value).toMatch(/^[#a-zA-Z0-9 ,."()%-]+$/);
    });
    it("matches its golden file", () => {
      const path = `tests/golden/${id}.css`;
      if (process.env["UPDATE_GOLDEN"] === "1" || !existsSync(path)) writeFileSync(path, css);
      expect(css).toBe(readFileSync(path, "utf8").split("\r\n").join("\n"));
    });
  });

  it("has a fixed stack for every font key and never takes a font name from the plan", () => {
    for (const k of FONT_KEYS) expect(FONT_STACKS[k].length).toBeGreaterThan(0);
    const plan = planFor("calm-light");
    plan.tokens = { ...plan.tokens, font: "serif" };
    expect(compileCss(plan, sampleSummary())).toContain("Georgia");
  });

  it("emits region rules for tagged regions with their layout", () => {
    const css = compileCss(planFor("calm-light", SAMPLE_RULES), sampleSummary());
    expect(css).toContain('[data-skinly-r="r1"][data-skinly-r="r1"]');
    expect(css).toContain("flex-wrap: wrap");
    expect(css).toContain("grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr))");
    expect(css).toContain("box-shadow: 0 1px 3px #cbd2d9");
  });

  it("drops layouts that are not allowed on the region or the page", () => {
    const rules = [{ region: "r3", layout: "link-grid" as const, surface: "none" as const, spacing: 1 }];
    expect(compileCss(planFor("calm-light", rules), sampleSummary())).not.toContain("display: grid");
    const grid = [{ region: "r4", layout: "link-grid" as const, surface: "none" as const, spacing: 1 }];
    expect(compileCss(planFor("calm-light", grid), sampleSummary(["editable"]))).not.toContain("display: grid");
  });

  it("skips rules for regions the summary does not have", () => {
    const rules = [{ region: "r9", layout: "none" as const, surface: "card" as const, spacing: 0 }];
    expect(compileCss(planFor("calm-light", rules), sampleSummary())).not.toContain("r9");
  });

  it("never recolours media in any theme", () => {
    const s = sampleSummary();
    s.regions.push(region("r5", "section", 0));
    expect(compileCss(planFor("midnight"), s)).not.toMatch(/\bimg\b/);
  });
});

describe("element templates", () => {
  const css = compileCss(planFor("calm-light"), sampleSummary());
  const root = 'html[data-skinly="on"]:not(#skinly-force)';

  it("raises specificity with a never-matching :not(#id) on every selector", () => {
    for (const b of blocks(css)) for (const sel of b.selectors) expect(sel.startsWith(root)).toBe(true);
  });

  it.each([
    ["links, visited and hover", ["a:visited", "a:hover"]],
    ["headings", ["h1", "h6"]],
    ["buttons", ['input[type="submit"]', "button:hover", "button:disabled"]],
    ["text fields", ['input[type="text"]', "textarea", "select", "::placeholder", "textarea:focus"]],
    ["tables", ["th", "tbody tr:nth-child(even) > td"]],
    ["cards and panels", ["article", "fieldset"]],
    ["lists, rules, code, selection", ["li::marker", "hr", "pre", "::selection"]],
  ])("has a template for %s", (_name, parts) => {
    for (const p of parts) expect(css).toContain(`${root} ${p}`);
  });

  it("uses the derived colours: onAccent on buttons, surfaceAlt on zebra rows", () => {
    expect(css).toMatch(/input\[type="reset"\] \{ background-color: #2f6fdb !important; color: #ffffff !important;/);
    expect(css).toMatch(/tbody tr:nth-child\(even\) > td \{ background-color: #[0-9a-f]{6} !important; \}/);
  });

  it("neutralises legacy markup with attribute selectors only", () => {
    for (const a of ["[bgcolor]", "[background]", '[style*="background"]', "font[color]", "table[border]", "table[cellpadding]"]) expect(css).toContain(a);
    expect(css).not.toMatch(/\[style\*="background"\][^{]*\{[^}]*background-image/);
  });

  it("emits no class or id selectors other than the specificity guard", () => {
    for (const b of blocks(css)) {
      for (const sel of b.selectors) expect(sel.split(":not(#skinly-force)").join("")).not.toMatch(/(^|[\s,>+~])[.#][A-Za-z]/);
    }
  });
});
