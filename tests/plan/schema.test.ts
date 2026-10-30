import { describe, expect, it } from "vitest";
import { validatePlan, type StylePlan } from "../../src/plan/schema.ts";
import type { RegionRole, StructuralSummary } from "../../src/core/types.ts";

const region = (id: string, role: RegionRole, linkCount: number) => ({
  id,
  role,
  tag: "div",
  classes: [],
  childCount: 3,
  linkCount,
  depth: 1,
  rect: { x: 0, y: 0, w: 100, h: 100 },
  style: { color: "#000000", bg: "#ffffff", fontSize: 16, fontWeight: 400, radius: 0 },
});

const summary = (risk: StructuralSummary["risk"] = []): StructuralSummary => ({
  v: 1,
  viewport: { w: 1000, h: 800 },
  palette: [],
  page: { tone: "light", bgImages: 0, largeMedia: 0, hasHeroMedia: false },
  fonts: [],
  counts: { nodes: 10, links: 10, forms: 0, tables: 0, images: 0, headings: 0, iframes: 0 },
  risk,
  regions: [region("r1", "nav", 6), region("r2", "link-list", 2), region("r3", "main", 0), region("r4", "card-list", 8)],
});

const good = (): StylePlan => ({
  v: 1,
  themeId: "calm-light",
  tokens: { bg: "#f7f8fa", surface: "#ffffff", text: "#1f2933", muted: "#52606d", link: "#0b5cad", accent: "#2f6fdb", border: "#cbd2d9", focus: "#1a56db", radius: 8, font: "system", baseSize: 16, lineHeight: 1.6 },
  regionRules: [{ region: "r1", layout: "nav-wrap", surface: "flat", spacing: 2 }],
  reasons: ["clear-nav"],
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;
const bad = (mutate: (p: Loose) => void, s = summary()) => {
  const p = JSON.parse(JSON.stringify(good()));
  mutate(p);
  return validatePlan(p, s);
};
const errorsOf = (r: ReturnType<typeof validatePlan>) => (r.ok ? [] : r.errors);

describe("validatePlan", () => {
  it("accepts a valid plan and normalises hex to lowercase", () => {
    const r = bad((p) => (p.tokens.bg = "#F7F8FA"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.tokens.bg).toBe("#f7f8fa");
  });
  it("accepts an empty plan with no rules or reasons", () => {
    expect(bad((p) => ((p.regionRules = []), (p.reasons = []))).ok).toBe(true);
  });
  it("rejects non-objects", () => {
    for (const v of [null, 5, "x", [], undefined]) expect(validatePlan(v, summary()).ok).toBe(false);
  });
  it("rejects unknown keys at every level", () => {
    expect(errorsOf(bad((p) => (p.css = "a{}")))).toContain("plan.css: unknown key");
    expect(errorsOf(bad((p) => (p.tokens.fontName = "x")))).toContain("tokens.fontName: unknown key");
    expect(errorsOf(bad((p) => (p.regionRules[0].selector = ".a")))).toContain("regionRules[0].selector: unknown key");
  });
  it("rejects missing keys", () => {
    expect(bad((p) => delete p.reasons).ok).toBe(false);
    expect(bad((p) => delete p.tokens.focus).ok).toBe(false);
  });
  it("rejects wrong types and a wrong version", () => {
    expect(bad((p) => (p.v = 2)).ok).toBe(false);
    expect(bad((p) => (p.tokens = "x")).ok).toBe(false);
    expect(bad((p) => (p.regionRules = {})).ok).toBe(false);
    expect(bad((p) => (p.tokens.radius = "8")).ok).toBe(false);
  });
  it("rejects bad hex colours", () => {
    for (const c of ["red", "#fff", "#12345", "#gggggg", "rgb(0,0,0)", "#ffffff;}", "url(x)", 5])
      expect(bad((p) => (p.tokens.text = c)).ok).toBe(false);
  });
  it("rejects out-of-range numbers", () => {
    expect(bad((p) => (p.tokens.radius = 17)).ok).toBe(false);
    expect(bad((p) => (p.tokens.radius = -1)).ok).toBe(false);
    expect(bad((p) => (p.tokens.radius = 2.5)).ok).toBe(false);
    expect(bad((p) => (p.tokens.baseSize = 13)).ok).toBe(false);
    expect(bad((p) => (p.tokens.baseSize = 21)).ok).toBe(false);
    expect(bad((p) => (p.tokens.lineHeight = 1.2)).ok).toBe(false);
    expect(bad((p) => (p.tokens.lineHeight = 1.95)).ok).toBe(false);
    expect(bad((p) => (p.tokens.lineHeight = 1.55)).ok).toBe(false);
    expect(bad((p) => (p.regionRules[0].spacing = 5)).ok).toBe(false);
    expect(bad((p) => (p.regionRules[0].spacing = Number.NaN)).ok).toBe(false);
  });
  it("rejects unknown enums", () => {
    expect(bad((p) => (p.themeId = "neon")).ok).toBe(false);
    expect(bad((p) => (p.tokens.font = "Comic Sans")).ok).toBe(false);
    expect(bad((p) => (p.regionRules[0].layout = "float")).ok).toBe(false);
    expect(bad((p) => (p.regionRules[0].surface = "glass")).ok).toBe(false);
    expect(bad((p) => (p.reasons = ["because"])).ok).toBe(false);
  });
  it("rejects unknown, malformed and duplicate region ids", () => {
    expect(errorsOf(bad((p) => (p.regionRules[0].region = "r99")))).toContain("regionRules[0].region: unknown region");
    expect(bad((p) => (p.regionRules[0].region = ".nav > a")).ok).toBe(false);
    expect(bad((p) => p.regionRules.push({ ...p.regionRules[0] })).ok).toBe(false);
  });
  it("rejects too many rules and reasons", () => {
    expect(bad((p) => (p.reasons = Array(6).fill("unsure"))).ok).toBe(false);
    expect(bad((p) => (p.regionRules = Array(41).fill(p.regionRules[0]))).ok).toBe(false);
  });
  it("rejects layouts on ineligible regions", () => {
    expect(bad((p) => (p.regionRules[0] = { region: "r3", layout: "link-grid", surface: "none", spacing: 0 })).ok).toBe(false);
    expect(bad((p) => (p.regionRules[0] = { region: "r2", layout: "link-grid", surface: "none", spacing: 0 })).ok).toBe(false);
    expect(bad((p) => (p.regionRules[0] = { region: "r4", layout: "link-grid", surface: "none", spacing: 1 })).ok).toBe(true);
  });
  it("rejects layouts when the page has any risk marker, but allows colours", () => {
    expect(bad(() => {}, summary(["editable"])).ok).toBe(false);
    expect(bad((p) => (p.regionRules[0].layout = "none"), summary(["editable"])).ok).toBe(true);
  });
  it("does not echo offending values in errors", () => {
    const r = bad((p) => (p.tokens.text = "SECRET-VALUE"));
    expect(JSON.stringify(errorsOf(r))).not.toContain("SECRET");
  });
  it("ignores prototype tricks", () => {
    const p = JSON.parse('{"__proto__":{"x":1},"v":1}');
    expect(validatePlan(p, summary()).ok).toBe(false);
  });
});
