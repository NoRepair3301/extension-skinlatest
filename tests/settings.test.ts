import { describe, expect, it } from "vitest";
import { canUse } from "../src/core/entitlements.ts";
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

describe("entitlements", () => {
  it("unlocks everything on the free plan", () => {
    expect(canUse("themes")).toBe(true);
    expect(canUse("anything-else")).toBe(true);
  });
});
