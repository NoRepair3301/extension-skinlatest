import { afterEach, describe, expect, it } from "vitest";
import { compileCss } from "../src/plan/compile.ts";
import { validatePlan } from "../src/plan/schema.ts";
import { themeToPlan } from "../src/plan/themeToPlan.ts";
import type { StructuralSummary } from "../src/core/types.ts";

/**
 * A3 pass 3: page compatibility. Each item is a rule, a test or a documented limit (docs/REVIEW.md). These are the ones a test can hold.
 */
const slot = globalThis as unknown as { skinlyApplier?: { applyTheme(id: string): { ok: boolean }; restore(): unknown } };

afterEach(() => {
  slot.skinlyApplier?.restore();
  delete slot.skinlyApplier;
  document.body.replaceChildren();
});

describe("print is untouched", () => {
  it("the theme sheet is created for screen media only", async () => {
    // jsdom has no constructable stylesheets (and ignores the media option): record what the applier asks for
    const Orig = window.CSSStyleSheet;
    const inits: unknown[] = [];
    (window as unknown as { CSSStyleSheet: unknown }).CSSStyleSheet = class {
      constructor(init?: unknown) {
        inits.push(init);
      }
      replaceSync(): void {}
    };
    const sheets: unknown[] = [];
    Object.defineProperty(document, "adoptedStyleSheets", { configurable: true, get: () => sheets, set: (v: unknown[]) => void sheets.splice(0, sheets.length, ...v) });
    try {
      document.body.innerHTML = "<main><p>x</p></main>";
      const { THEME_SHEET_MEDIA } = await import("../src/extension/applier.ts");
      expect(THEME_SHEET_MEDIA).toBe("screen");
      expect(slot.skinlyApplier!.applyTheme("midnight").ok).toBe(true);
      expect(inits.length).toBeGreaterThan(0);
      expect(inits.every((i) => (i as { media?: string } | undefined)?.media === "screen")).toBe(true);
    } finally {
      window.CSSStyleSheet = Orig;
    }
  });
});

describe("compiled theme keeps the page usable", () => {
  const summary = { v: 1, regions: [], counts: {}, page: { tone: "light" } } as unknown as StructuralSummary;
  const css = (id: Parameters<typeof themeToPlan>[0]) => {
    const v = validatePlan({ ...themeToPlan(id), strategy: "full" as const }, summary);
    if (!v.ok) throw new Error("plan");
    return compileCss(v.plan, summary);
  };

  it("focus rings, selection, placeholders, disabled controls, visited links, scrollbars, select options and colour scheme each have a rule", () => {
    const text = css("midnight");
    for (const part of [":focus-visible", "outline-width:2px", "::selection", "::placeholder", ":disabled", "a:visited", "scrollbar-color", "option, ", "color-scheme:dark"]) expect(text.replace(/\s/g, ""), part).toContain(part.replace(/\s/g, ""));
  });

  it("never hides focus (no outline none), never touches autofill, iframes, media or shadow hosts", () => {
    for (const id of ["calm-light", "midnight", "ocean", "warm-paper", "field", "high-contrast"] as const) {
      const text = css(id);
      expect(text, id).not.toMatch(/outline(-style)?\s*:\s*(none|0)/);
      expect(text, id).not.toMatch(/autofill/);
      expect(text, id).not.toMatch(/(^|[\s,>])(iframe|img|video|canvas|svg|picture)([\s,{:[]|$)/m);
      expect(text, id).not.toMatch(/::part|:host|::slotted/);
      expect(text, id).not.toMatch(/display\s*:|visibility\s*:|opacity\s*:/);
    }
  });
});
