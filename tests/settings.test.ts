import { describe, expect, it } from "vitest";
import { canUse, clampChoice, clampPlan, clampThemeId, entitledThemes } from "../src/core/entitlements.ts";
import { themeToPlan } from "../src/plan/themeToPlan.ts";
import { callsOn, defaultSettings, parseSettings } from "../src/extension/settings.ts";

describe("parseSettings", () => {
  it("falls back to defaults for missing or corrupt data", () => {
    for (const raw of [undefined, null, 5, "x", [], { theme: "neon" }, { theme: 3, blocklist: "x" }]) {
      expect(parseSettings(raw)).toEqual(defaultSettings());
    }
  });
  it("keeps valid values and drops invalid blocklist entries", () => {
    expect(parseSettings({ theme: "midnight", blocklist: ["a.test", 5, "", "b.test"] })).toMatchObject({ theme: "midnight", blocklist: ["a.test", "b.test"] });
  });
});

describe("provider settings", () => {
  it("validates provider order, model ids and the daily counter", () => {
    const s = parseSettings({ order: ["groq", "bogus", "groq", "gemini"], models: { gemini: "m 1", groq: "ok/model-1" }, aiCallsToday: { date: "2026-10-30", count: 4 } });
    expect(s.order).toEqual(["groq", "gemini"]);
    expect(s.models).toEqual({ gemini: "gemini-3.8-flash", groq: "ok/model-1" });
    expect(s.aiCallsToday).toEqual({ date: "2026-10-30", count: 4 });
    expect(parseSettings({ order: [], aiCallsToday: { date: "x", count: -1 } })).toEqual(defaultSettings());
  });
  it("resets the counter on a new day", () => {
    const s = parseSettings({ aiCallsToday: { date: "2026-10-30", count: 4 } });
    expect(callsOn(s, "2026-10-30")).toBe(4);
    expect(callsOn(s, "2026-10-31")).toBe(0);
  });
});

describe("entitlements (B4: one config, docs/PLUS_SPEC.md 1)", () => {
  it("Free: calm light, midnight, high contrast; Plus adds ocean, warm paper, field and custom assets", () => {
    for (const id of ["calm-light", "midnight", "high-contrast"] as const) expect(canUse(`theme:${id}`, "free")).toBe(true);
    for (const id of ["ocean", "warm-paper", "field"] as const) {
      expect(canUse(`theme:${id}`, "free")).toBe(false);
      expect(canUse(`theme:${id}`, "plus")).toBe(true);
    }
    expect(canUse("assets", "free")).toBe(false);
    expect(canUse("assets", "plus")).toBe(true);
    expect(entitledThemes("free")).toEqual(["calm-light", "midnight", "high-contrast"]);
    expect(entitledThemes("plus")).toHaveLength(6);
  });
  it("a Plus theme without Plus goes to the nearest free one; layouts and strategy stay; custom AI tokens stay", () => {
    expect(clampThemeId("ocean", "free")).toBe("calm-light");
    expect(clampThemeId("warm-paper", "free")).toBe("calm-light");
    expect(clampThemeId("field", "free")).toBe("calm-light");
    expect(clampThemeId("ocean", "plus")).toBe("ocean");
    expect(clampChoice("auto", "free")).toBe("auto");
    const ocean = { ...themeToPlan("ocean"), strategy: "full" as const, regionRules: [{ region: "r1", layout: "stack" as const, surface: "card" as const, spacing: 2 }] };
    const clamped = clampPlan(ocean, "free");
    expect(clamped.themeId).toBe("calm-light");
    expect(clamped.tokens).toEqual(themeToPlan("calm-light").tokens);
    expect(clamped.regionRules).toEqual(ocean.regionRules);
    expect(clamped.strategy).toBe("full");
    expect(clampPlan(ocean, "plus")).toBe(ocean);
    const custom = { ...themeToPlan("ocean"), themeId: "custom" as const };
    expect(clampPlan(custom, "free")).toBe(custom);
  });
});

describe("consent setting", () => {
  it("is null by default and keeps a valid record", () => {
    expect(defaultSettings().consent).toBeNull();
    expect(parseSettings({ consent: { version: 1, acceptedAt: "2026-10-30T00:00:00.000Z" } }).consent).toEqual({ version: 1, acceptedAt: "2026-10-30T00:00:00.000Z" });
    expect(parseSettings({ consent: { version: "1", acceptedAt: 5 } }).consent).toBeNull();
  });
});

describe("welcomeDone", () => {
  it("defaults to false and is read back only when exactly true", () => {
    expect(parseSettings(undefined).welcomeDone).toBe(false);
    expect(parseSettings({ welcomeDone: "yes" }).welcomeDone).toBe(false);
    expect(parseSettings({ welcomeDone: true }).welcomeDone).toBe(true);
  });
});
