import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { PROMPT_VERSION, STYLE_PLAN_SCHEMA, SYSTEM_PROMPT } from "../../src/ai/prompt.ts";
import { createApplier, type StyleHost } from "../../src/extension/applier-core.ts";
import { compileCss } from "../../src/plan/compile.ts";
import { compare, snapshot } from "../../src/plan/invariants.ts";
import { LAYOUTS, layoutAllowed, validatePlan, type Layout } from "../../src/plan/schema.ts";
import { themeToPlan } from "../../src/plan/themeToPlan.ts";
import { fakeDeps } from "../analyzer/helpers.ts";
import { planFor, region, sampleSummary } from "./helpers.ts";

const facts = (role: string, linkCount: number, childCount: number) => ({ role, linkCount, childCount });

describe("layout eligibility", () => {
  it("lists the four new layouts", () => {
    for (const l of ["center-column", "card-grid", "stack", "table-clean"]) expect(LAYOUTS).toContain(l);
  });

  it.each<[Layout, ReturnType<typeof facts>, boolean]>([
    ["card-grid", facts("card-list", 0, 3), true],
    ["card-grid", facts("section", 0, 2), false],
    ["card-grid", facts("main", 0, 9), false],
    ["stack", facts("nav", 0, 2), true],
    ["stack", facts("nav", 0, 1), false],
    ["stack", facts("table", 0, 5), false],
    ["center-column", facts("main", 0, 0), true],
    ["center-column", facts("nav", 9, 9), false],
    ["table-clean", facts("table", 0, 0), true],
    ["table-clean", facts("main", 0, 0), false],
    ["link-grid", facts("nav", 3, 9), false],
  ])("%s on %j is %s", (layout, f, ok) => {
    expect(layoutAllowed(layout, f, [])).toBe(ok);
  });

  it("needs an empty risk list, except table-clean which tolerates big-table", () => {
    expect(layoutAllowed("stack", facts("nav", 0, 4), ["editable"])).toBe(false);
    expect(layoutAllowed("center-column", facts("main", 0, 4), ["iframes"])).toBe(false);
    expect(layoutAllowed("table-clean", facts("table", 0, 0), ["big-table"])).toBe(true);
    expect(layoutAllowed("table-clean", facts("table", 0, 0), ["big-table", "password"])).toBe(false);
    expect(layoutAllowed("none", facts("anything", 0, 0), ["password"])).toBe(true);
  });
});

describe("validator and compiler agree on layouts", () => {
  const summary = () => {
    const s = sampleSummary();
    s.regions.push(region("r5", "table", 0), region("r6", "section", 0));
    return s;
  };
  const plan = (rules: Array<{ region: string; layout: Layout }>) => ({
    ...JSON.parse(JSON.stringify(planFor("calm-light"))),
    regionRules: rules.map((r) => ({ ...r, surface: "none", spacing: 1 })),
  });

  it("accepts each new layout on an eligible region and rejects it elsewhere", () => {
    const s = summary();
    expect(validatePlan(plan([{ region: "r4", layout: "card-grid" }, { region: "r1", layout: "stack" }, { region: "r3", layout: "center-column" }, { region: "r5", layout: "table-clean" }]), s).ok).toBe(true);
    expect(validatePlan(plan([{ region: "r3", layout: "card-grid" }]), s).ok).toBe(false);
    expect(validatePlan(plan([{ region: "r1", layout: "table-clean" }]), s).ok).toBe(false);
    expect(validatePlan(plan([{ region: "r1", layout: "float" as Layout }]), s).ok).toBe(false);
  });

  it("compiles fixed templates for each layout", () => {
    const s = summary();
    const v = validatePlan(plan([{ region: "r4", layout: "card-grid" }, { region: "r1", layout: "stack" }, { region: "r3", layout: "center-column" }, { region: "r5", layout: "table-clean" }]), s);
    if (!v.ok) throw new Error(v.errors.join());
    const css = compileCss({ ...v.plan, strategy: "full" }, s);
    expect(css).toContain("grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr))");
    expect(css).toContain("flex-direction: column");
    expect(css).toContain("max-width: 72rem");
    expect(css).toContain("margin: 0 auto");
    expect(css).toContain("border-collapse: collapse");
    expect(css).not.toMatch(/order\s*:|position\s*:|float|display: none|visibility/);
  });

  it("the compiler drops a layout the page's risk markers forbid", () => {
    const s = sampleSummary(["editable"]);
    const css = compileCss(planFor("calm-light", [{ region: "r1", layout: "stack", surface: "none", spacing: 1 }]), s);
    expect(css).not.toContain("flex-direction");
  });
});

describe("layouts never change DOM order", () => {
  it("applies a plan with every new layout to a fixture; order, hrefs and forms are unchanged and restore is exact", () => {
    const doc = new JSDOM(readFileSync("fixtures/web/service-cards.html", "utf8")).window.document;
    const html = doc.documentElement.outerHTML;
    const order = Array.from(doc.querySelectorAll("*")).map((e) => e.localName);
    const sheets: string[] = [];
    const host: StyleHost = { add: (css) => (sheets.push(css), { remove: () => sheets.splice(0), isAttached: () => sheets.length > 0 }) };
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    const analysis = a.analyze();
    if (analysis.status !== "ok") throw new Error("too large");
    const before = snapshot(doc);
    const layouts: Layout[] = ["card-grid", "stack", "center-column", "table-clean", "link-grid", "nav-wrap"];
    const rules = analysis.summary.regions.map((r, i) => ({ region: r.id, layout: layouts[i % layouts.length]!, surface: "card" as const, spacing: 2 }));
    const plan = { ...themeToPlan("ocean", analysis.summary), regionRules: rules };
    // Ineligible layouts are rejected by the validator, so keep only the rules the page allows.
    plan.regionRules = rules.filter((r) => {
      const reg = analysis.summary.regions.find((x) => x.id === r.region)!;
      return layoutAllowed(r.layout, reg, analysis.summary.risk);
    });
    expect(plan.regionRules.length).toBeGreaterThan(0);
    expect(a.apply(plan)).toMatchObject({ ok: true });
    expect(compare(before, snapshot(doc))).toEqual([]);
    expect(Array.from(doc.querySelectorAll("*")).map((e) => e.localName)).toEqual(order);
    a.restore();
    expect(doc.documentElement.outerHTML).toBe(html);
  });
});

describe("prompt v2", () => {
  it("is version 5 and guides the model per region", () => {
    expect(PROMPT_VERSION).toBe("5");
    for (const l of LAYOUTS.filter((x) => x !== "none")) expect(SYSTEM_PROMPT).toContain(`"${l}"`);
    expect(SYSTEM_PROMPT).toContain("per region");
    expect(SYSTEM_PROMPT).toContain("order never changes");
  });
  it("the response schema enumerates the new layouts", () => {
    const layoutEnum = STYLE_PLAN_SCHEMA.properties.regionRules.items.properties.layout.enum as readonly string[];
    expect([...layoutEnum]).toEqual([...LAYOUTS]);
  });
});
