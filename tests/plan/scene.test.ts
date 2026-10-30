import { afterEach, describe, expect, it, vi } from "vitest";
import { STYLE_PLAN_SCHEMA, SYSTEM_PROMPT } from "../../src/ai/prompt.ts";
import { createApplier } from "../../src/extension/applier-core.ts";
import { defaultSettings, parseSettings } from "../../src/extension/settings.ts";
import { contrastFailures } from "../../src/plan/contrast.ts";
import { SCENE_IDS, validatePlan } from "../../src/plan/schema.ts";
import { BUILTIN_THEME_IDS, DEFAULT_SCENE_BY_THEME, getTheme, isThemeChoice, resolveTheme, THEME_CHOICES } from "../../src/themes/index.ts";
import { sampleSummary } from "./helpers.ts";

const plan = (extra: Record<string, unknown> = {}) => ({ v: 1, themeId: "field", tokens: getTheme("field").tokens, regionRules: [], reasons: [], ...extra });

describe("sceneId in the StylePlan", () => {
  it("defaults to none when the key is missing", () => {
    const r = validatePlan(plan(), sampleSummary());
    expect(r.ok && r.plan.sceneId).toBe("none");
  });
  it("accepts every built-in scene id", () => {
    for (const id of SCENE_IDS) {
      const r = validatePlan(plan({ sceneId: id }), sampleSummary());
      expect(r.ok && r.plan.sceneId).toBe(id);
    }
  });
  it("rejects unknown ids, wrong types and injected values, naming the path only", () => {
    for (const bad of ["tank", "", 3, null, ["space"], { id: "space" }, "<script>", "space "]) {
      const r = validatePlan(plan({ sceneId: bad }), sampleSummary());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors).toEqual(["sceneId: unknown scene"]);
    }
  });
  it("the AI no longer chooses scenes: the schema and the prompt do not mention them", () => {
    expect(Object.keys(STYLE_PLAN_SCHEMA.properties)).not.toContain("sceneId");
    expect(SYSTEM_PROMPT).not.toContain("sceneId");
  });
});

describe("field theme and auto", () => {
  it("field is a built-in theme that meets every contrast target", () => {
    expect(BUILTIN_THEME_IDS).toContain("field");
    expect(contrastFailures("field", getTheme("field").tokens)).toEqual([]);
  });
  it("auto is a choice, not a theme, and follows the colour scheme", () => {
    expect(THEME_CHOICES).toContain("auto");
    expect(isThemeChoice("auto")).toBe(true);
    expect(isThemeChoice("tank")).toBe(false);
    expect((BUILTIN_THEME_IDS as readonly string[]).includes("auto")).toBe(false);
    expect(resolveTheme("auto", false)).toBe("calm-light");
    expect(resolveTheme("auto", true)).toBe("midnight");
    expect(resolveTheme("ocean", true)).toBe("ocean");
  });
  it("every theme has a default scene and high contrast has none", () => {
    for (const id of BUILTIN_THEME_IDS) expect(SCENE_IDS).toContain(DEFAULT_SCENE_BY_THEME[id]);
    expect(DEFAULT_SCENE_BY_THEME["high-contrast"]).toBe("none");
  });
});

describe("applier: auto theme", () => {
  afterEach(() => vi.unstubAllGlobals());
  const run = (dark: boolean) => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: dark && q.includes("dark"), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
    const doc = document.implementation.createHTMLDocument("t");
    Object.defineProperty(doc, "defaultView", { value: window });
    const a = createApplier(doc, { style: { add: () => ({ remove() {}, isAttached: () => true }) } });
    const r = a.applyTheme("auto");
    a.restore();
    return r;
  };
  it("applies calm light by day and midnight when the browser is dark", () => {
    expect(run(false)).toMatchObject({ ok: true, themeId: "calm-light" });
    expect(run(true)).toMatchObject({ ok: true, themeId: "midnight" });
  });
  it("still rejects an unknown theme", () => {
    const doc = document.implementation.createHTMLDocument("t");
    const a = createApplier(doc, { style: { add: () => ({ remove() {}, isAttached: () => true }) } });
    expect(a.applyTheme("neon")).toMatchObject({ ok: false, reason: "bad-theme" });
  });
});

describe("settings: scene", () => {
  it("has safe defaults", () => {
    expect(defaultSettings().scene).toEqual({ enabled: true, choice: "theme", density: "normal", lane: "both" });
    expect(defaultSettings().theme).toBe("calm-light");
  });
  it("reads valid values and ignores everything else", () => {
    expect(parseSettings({ theme: "auto", scene: { enabled: false, choice: "space", density: "high", lane: "left" } })).toMatchObject({ theme: "auto", scene: { enabled: false, choice: "space", density: "high", lane: "left" } });
    const bad = parseSettings({ theme: "tank", scene: { enabled: "no", choice: "tank", density: "max", lane: "up" } });
    expect(bad.theme).toBe("calm-light");
    expect(bad.scene).toEqual(defaultSettings().scene);
  });
});
