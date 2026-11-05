import { afterEach, describe, expect, it } from "vitest";

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
