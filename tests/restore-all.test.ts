import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PageApplier } from "../src/extension/applier.ts";

type Slot = { skinlyApplier?: PageApplier; skinlyTools?: { blurPage(on?: boolean): unknown } };
const slot = globalThis as unknown as Slot;
const PAGE = '<main><h1>Title</h1><p>Some text</p><a href="/x">link</a><form action="/f"><input name="q"><button type="submit">Go</button></form></main>';

let sheets: unknown[];
beforeAll(async () => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
  // jsdom has no constructable stylesheets; a stand-in is enough to prove the sheet is added and removed.
  sheets = [];
  (window as unknown as { CSSStyleSheet: unknown }).CSSStyleSheet = class {
    replaceSync(): void {}
  };
  Object.defineProperty(document, "adoptedStyleSheets", { configurable: true, get: () => sheets, set: (v: unknown[]) => void (sheets = v) });
  document.body.innerHTML = PAGE;
  await import("../src/extension/applier.ts");
});
afterAll(() => vi.unstubAllGlobals());

describe("Restore removes everything and leaves the page byte-identical", () => {
  it("works from a fresh caller (the popup was closed and reopened) after theme, pet and whole-page blur", () => {
    const before = document.documentElement.outerHTML;
    const applier = slot.skinlyApplier!;
    expect(applier.applyTheme("midnight")).toMatchObject({ ok: true });
    expect(document.documentElement.getAttribute("data-skinly")).toBe("on");
    expect(applier.syncPet({ enabled: true, kind: "pebble", size: "medium", corner: "bottom-right", disabledOrigins: [] } as never)).toBe(true);
    slot.skinlyTools!.blurPage(true);
    expect(document.querySelectorAll("[data-skinly-ui]").length).toBeGreaterThanOrEqual(2);
    expect(sheets.length).toBeGreaterThan(0);

    // Nothing from the popup is needed: the page script is reached through its global only, as callApplier does.
    const fresh = (globalThis as unknown as { skinlyApplier: { restore(): { ok: boolean } } }).skinlyApplier;
    expect(fresh.restore()).toEqual({ ok: true });

    expect(document.querySelectorAll("[data-skinly-ui],[data-skinly-scene]")).toHaveLength(0);
    expect(sheets).toHaveLength(0);
    expect(document.documentElement.outerHTML).toBe(before);
    expect(fresh.restore()).toEqual({ ok: true }); // a second Restore is harmless
  });
});
