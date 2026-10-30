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
    it("scopes every selector under the page marker (forced root or :where)", () => {
      for (const m of css.matchAll(/([^{}]+){/g)) expect(m[1]!.trim().startsWith('html[data-skinly="on"]') || m[1]!.trim().startsWith(':where(html[data-skinly="on"])')).toBe(true);
    });
    it("contains no dangerous constructs", () => {
      for (const bad of ["url(", "@import", "expression", "content:", "position:", "z-index", "visibility", "display: none", "opacity", "transform", "filter", "pointer-events", "cursor", "overflow", "javascript", "background-image", "background:", "line-height", "white-space", "text-overflow"]) {
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
    expect(css).toContain('[data-skinly-r="r1"] {');
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

describe("element templates (full strategy)", () => {
  const css = compileCss(planFor("calm-light"), sampleSummary());
  const root = 'html[data-skinly="on"]:not(#skinly-force)';
  const low = ':where(html[data-skinly="on"])';

  it("forces only the page itself and the legacy-markup overrides; everything else is low specificity with no !important", () => {
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const forcedRule = m[1]!.trim().startsWith(root);
      if (!forcedRule) expect(m[1]!.trim().startsWith(low), m[1]).toBe(true);
      expect(m[2]!.includes("!important"), m[1]).toBe(forcedRule);
    }
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
    for (const p of parts) expect(css).toContain(`${low} ${p}`);
  });

  it("uses the derived colours: onAccent on buttons, surfaceAlt on zebra rows, both with a text colour", () => {
    expect(css).toMatch(/input\[type="reset"\] \{ background-color: #2f6fdb; color: #ffffff;/);
    expect(css).toMatch(/tbody tr:nth-child\(even\) > td \{ background-color: #[0-9a-f]{6}; color: #[0-9a-f]{6}; \}/);
  });

  it("neutralises legacy markup by colour attributes only, never pictures", () => {
    for (const a of ["[bgcolor]", '[style*="background-color"]', "font[color]", "table[border]"]) expect(css).toContain(a);
    expect(css).not.toContain("[background]");
    expect(css).toContain(':not([style*="url"])');
  });

  it("emits no class or id selectors other than the specificity guard", () => {
    for (const b of blocks(css)) {
      for (const sel of b.selectors) expect(sel.split(":not(#skinly-force)").join("")).not.toMatch(/(^|[\s,>+~])[.#][A-Za-z]/);
    }
  });
});

describe("page-safety rules (every strategy)", () => {
  const STRATEGIES = ["full", "safe", "text-only"] as const;
  const plan = (strategy: (typeof STRATEGIES)[number], protect = true) => ({ ...planFor("midnight", SAMPLE_RULES), strategy, protectBackgrounds: protect }) as ReturnType<typeof planFor>;
  const all = STRATEGIES.flatMap((st) => [true, false].map((p) => [st, p, compileCss(plan(st, p), sampleSummary())] as const));

  it.each(all)("%s protect=%s: no shorthand, no media, background colour always paired with a text colour, never on body", (_st, _p, css) => {
    expect(css).not.toMatch(/(^|[\s;{])background\s*:/);
    expect(css).not.toMatch(/\b(img|picture|video|canvas|svg|iframe)\b/);
    for (const b of blocks(css)) {
      const props = b.decls.map((d) => d.prop);
      if (props.includes("background-color")) expect(props, b.selectors.join()).toContain("color");
      for (const sel of b.selectors) {
        const target = sel.replace(/:not\(:where\([^)]*\)\)/g, "").trim().split(/\s+/).pop()!;
        if (/^body(\[|$)/.test(target)) {
          const bg = b.decls.find((d) => d.prop === "background-color");
          if (bg) expect(bg.value, sel).toBe("transparent");
        }
      }
    }
  });

  it("body only gets a transparent background (legacy bgcolor), and only in full", () => {
    expect(compileCss(plan("full"), sampleSummary())).toMatch(/body\[bgcolor\][^{]*\{ background-color: transparent !important;/);
    expect(compileCss(plan("safe"), sampleSummary())).not.toContain("body[bgcolor]");
  });

  it("safe paints the page and colours text only: no buttons, fields, tables, wrappers or regions", () => {
    const css = compileCss(plan("safe", false), sampleSummary());
    const bare = css.replace(/:not\(:where\([^)]*\)\)/g, "");
    for (const x of ["th", "div", "bgcolor", "data-skinly-r"]) expect(bare).not.toMatch(new RegExp(`\\b${x}\\b`));
    expect(bare).not.toMatch(/input\[type="(submit|text)"\]/);
    expect(css.match(/background-color/g)!.length).toBe(2); // html and ::selection
  });

  it("text-only has no background at all and fits text to the page's own tone", () => {
    const css = compileCss(plan("text-only"), sampleSummary());
    expect(css).not.toContain("background-color");
    expect(css).toContain("a:visited");
    const dark = compileCss(plan("text-only"), { ...sampleSummary(), page: { tone: "dark", bgImages: 0, largeMedia: 0, hasHeroMedia: false } });
    expect(dark).not.toBe(css);
  });

  it("protected backgrounds keep wrapper boxes unpainted; unprotected paints them with their text colour", () => {
    expect(compileCss(plan("full", true), sampleSummary())).not.toMatch(/\bdiv:not/);
    expect(compileCss(plan("full", false), sampleSummary())).toMatch(/\bdiv:not/);
  });

  it("with a hero image on the page, region surfaces are not painted while backgrounds are protected", () => {
    const s = { ...sampleSummary(), page: { tone: "light" as const, bgImages: 1, largeMedia: 1, hasHeroMedia: true } };
    const css = compileCss(plan("full", true), s);
    expect(css).not.toContain("box-shadow: 0 1px 3px");
    expect(css).toContain("display: flex");
  });

  it("text inside buttons and links is never recoloured by the typography rules", () => {
    expect(compileCss(plan("full", false), sampleSummary())).toContain(":not(:where(button *, a *");
  });
});
