import { describe, expect, it } from "vitest";
import { canUse } from "../src/core/entitlements.ts";
import { parseSettings } from "../src/extension/settings.ts";

describe("parseSettings", () => {
  it("falls back to defaults for missing or corrupt data", () => {
    for (const raw of [undefined, null, 5, "x", [], { theme: "neon" }, { theme: 3, blocklist: "x" }]) {
      expect(parseSettings(raw)).toEqual({ theme: "calm-light", blocklist: [] });
    }
  });
  it("keeps valid values and drops invalid blocklist entries", () => {
    expect(parseSettings({ theme: "midnight", blocklist: ["a.test", 5, "", "b.test"] })).toEqual({ theme: "midnight", blocklist: ["a.test", "b.test"] });
  });
});

describe("entitlements", () => {
  it("unlocks everything on the free plan", () => {
    expect(canUse("themes")).toBe(true);
    expect(canUse("anything-else")).toBe(true);
  });
});
