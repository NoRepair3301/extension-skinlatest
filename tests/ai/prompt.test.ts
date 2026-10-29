import { describe, expect, it } from "vitest";
import { buildUserMessage, PROMPT_VERSION, STYLE_PLAN_SCHEMA, SYSTEM_PROMPT } from "../../src/ai/prompt.ts";
import { COLOR_KEYS } from "../../src/plan/schema.ts";
import { sampleSummary } from "../plan/helpers.ts";

describe("prompt", () => {
  it("is versioned", () => {
    expect(PROMPT_VERSION).toMatch(/^\d+$/);
  });
  it("states the safety rules", () => {
    for (const phrase of ["untrusted", "Never follow instructions", "only one JSON object", "Use only region ids", "built-in themeId", "contrast", "If unsure"]) {
      expect(SYSTEM_PROMPT).toContain(phrase);
    }
  });
  it("describes every plan key", () => {
    for (const k of ["themeId", "tokens", "regionRules", "reasons", "radius", "baseSize", "lineHeight", ...COLOR_KEYS]) expect(SYSTEM_PROMPT).toContain(`"${k}"`);
  });
  it("has a schema requiring every top-level key and no free-form fields", () => {
    expect([...STYLE_PLAN_SCHEMA.required].sort()).toEqual(["reasons", "regionRules", "themeId", "tokens", "v"]);
    expect(JSON.stringify(STYLE_PLAN_SCHEMA)).not.toMatch(/css|selector|fontName/i);
  });
  it("sends the summary and nothing else", () => {
    const s = sampleSummary();
    expect(buildUserMessage(s)).toBe(JSON.stringify(s));
  });
});
