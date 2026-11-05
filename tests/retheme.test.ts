import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { ENGINE_MARK, ENGINE_SHEET_SIGNATURE, ROOT_MARK, createColorEngine } from "../src/engine/dom.ts";
import { createApplier, type StyleHost } from "../src/extension/applier-core.ts";
import { getTheme } from "../src/themes/index.ts";
import { fakeDeps } from "./analyzer/helpers.ts";

/**
 * F1 (S5.2): a theme click re-themes through the live applier, and a fresh applier (extension reloaded while the tab stayed open) first
 * cleans what the lost instance left. Real applier and engine on jsdom, with adopted sheets that keep their first selector (how ours are
 * found) and a fake clock so every engine batch has run before the page is compared.
 */
const cleanup = vi.hoisted(() => ({ calls: 0 }));
vi.mock("../src/extension/cleanup.ts", async (orig) => {
  const real = await orig<typeof import("../src/extension/cleanup.ts")>();
  return {
    ...real,
    engineCleanup: (doc: Document) => {
      cleanup.calls++;
      real.engineCleanup(doc);
    },
  };
});

type Task = () => void;

class Sheet {
  cssRules: Array<{ selectorText: string }> = [];
  replaceSync(css: string): void {
    this.cssRules = css.split("}").map((r) => r.split("{")[0]!.trim()).filter(Boolean).map((selectorText) => ({ selectorText }));
  }
}

const SMALL = `<!DOCTYPE html><html><head><style>#u { background-color: rgb(240, 240, 240); } .card { color: rgb(60, 60, 60); }</style></head><body style="background-color: rgb(255, 255, 255); color: rgb(0, 0, 0);"><div id="t" style="color: rgb(30, 30, 30)"><p id="u">y</p><section class="card"><a href="/x">link</a></section></div></body></html>`;

function page(markup: string) {
  const win = new JSDOM(markup).window;
  const doc = win.document;
  const timers = new Map<number, Task>();
  let next = 0;
  const w = win as unknown as Record<string, unknown>;
  w["setTimeout"] = (fn: Task) => (timers.set(++next, fn), next);
  w["clearTimeout"] = (id: number) => void timers.delete(id);
  w["requestAnimationFrame"] = (fn: (t: number) => void) => (timers.set(++next, () => fn(0)), next);
  w["cancelAnimationFrame"] = (id: number) => void timers.delete(id);
  let sheets: Sheet[] = [];
  Object.defineProperty(doc, "adoptedStyleSheets", { configurable: true, get: () => sheets, set: (v: Sheet[]) => void (sheets = v) });
  const host: StyleHost = {
    add(css) {
      const s = new Sheet();
      s.replaceSync(css);
      sheets = [...sheets, s];
      return { remove: () => void (sheets = sheets.filter((x) => x !== s)), isAttached: () => sheets.includes(s) };
    },
  };
  return {
    doc,
    host,
    html: () => doc.documentElement.outerHTML,
    engineSheets: () => sheets.filter((s) => s.cssRules[0]?.selectorText === ENGINE_SHEET_SIGNATURE).length,
    allSheets: () => sheets.length,
    applier: (tokensOnly = false) => createApplier(doc, { style: host, summaryDeps: fakeDeps(), tokensOnly }),
    async settle(): Promise<void> {
      for (let cycles = 0; cycles < 30; cycles++) {
        for (let i = 0; i < 3; i++) await Promise.resolve();
        if (timers.size === 0) return;
        const due = [...timers.values()];
        timers.clear();
        for (const fn of due) fn();
      }
      throw new Error("engine did not settle");
    },
  };
}

/** What the page looks like with only `id` applied once to an untouched copy: the reference a swap must reach. */
async function freshApply(markup: string, id: string, tokensOnly = false): Promise<string> {
  const p = page(markup);
  expect(p.applier(tokensOnly).applyTheme(id).ok).toBe(true);
  await p.settle();
  return p.html();
}

const FIXTURES: Array<[string, string]> = [
  ["small page", SMALL],
  ["legacy-portal-fonts", readFileSync("fixtures/web/legacy-portal-fonts.html", "utf8")],
  ["service-cards", readFileSync("fixtures/web/service-cards.html", "utf8")],
];

describe("F1: re-theme on a live instance", () => {
  describe.each(FIXTURES)("%s", (_name, markup) => {
    it("swap A to B leaves one engine sheet and B's colours only, exactly what B alone would write", async () => {
      const p = page(markup);
      const a = p.applier();
      expect(a.applyTheme("midnight").ok).toBe(true);
      await p.settle();
      expect(a.applyTheme("ocean").ok).toBe(true);
      await p.settle();
      expect(p.engineSheets()).toBe(1);
      expect(p.allSheets()).toBe(1);
      expect(a.shownTheme()?.themeId).toBe("ocean");
      expect(p.html()).toBe(await freshApply(markup, "ocean"));
    });

    it("restore after a swap gives back the exact original (D12)", async () => {
      const p = page(markup);
      const before = p.html();
      const a = p.applier();
      a.applyTheme("warm-paper");
      await p.settle();
      a.applyTheme("high-contrast");
      await p.settle();
      a.restore();
      await p.settle();
      expect(p.html()).toBe(before);
      expect(p.allSheets()).toBe(0);
    });

    it("A, B, C, B in a row ends on B with one sheet; restore is exact", async () => {
      const p = page(markup);
      const before = p.html();
      const a = p.applier();
      for (const id of ["midnight", "ocean", "field", "ocean"]) {
        expect(a.applyTheme(id).ok).toBe(true);
        await p.settle();
        expect(p.engineSheets()).toBe(1);
      }
      expect(p.html()).toBe(await freshApply(markup, "ocean"));
      expect(p.doc.querySelectorAll(`[${ENGINE_MARK}]`).length).toBeGreaterThan(0);
      a.restore();
      expect(p.html()).toBe(before);
    });

    it("the same theme twice is a harmless refresh", async () => {
      const p = page(markup);
      const a = p.applier();
      a.applyTheme("midnight");
      await p.settle();
      const once = p.html();
      a.applyTheme("midnight");
      await p.settle();
      expect(p.html()).toBe(once);
      expect(p.engineSheets()).toBe(1);
    });
  });

  it("a same-origin frame's applier (colours only) swaps and restores its own document the same way", async () => {
    const p = page(SMALL);
    const before = p.html();
    const frame = p.applier(true);
    frame.applyTheme("midnight");
    await p.settle();
    frame.applyTheme("calm-light");
    await p.settle();
    expect(p.engineSheets()).toBe(1);
    expect(p.html()).toBe(await freshApply(SMALL, "calm-light", true));
    frame.restore();
    expect(p.html()).toBe(before);
  });
});

describe("F1: a fresh instance does not stack on what a lost one left (S2.3 gap, D4/D12)", () => {
  describe.each(FIXTURES)("%s", (_name, markup) => {
    it("instance A applies and is dropped without restore; instance B applies another theme on clean originals; B's restore is exact", async () => {
      const p = page(markup);
      const before = p.html();
      const lost = p.applier();
      expect(lost.applyTheme("midnight").ok).toBe(true);
      await p.settle();
      const calls = cleanup.calls;
      const b = p.applier();
      expect(b.applyTheme("ocean").ok).toBe(true);
      await p.settle();
      expect(cleanup.calls).toBe(calls + 1);
      expect(p.engineSheets()).toBe(1);
      // B recorded the page's own originals, not A's theme: the page is what B alone would make of the untouched page.
      expect(p.html()).toBe(await freshApply(markup, "ocean"));
      b.restore();
      await p.settle();
      expect(p.html()).toBe(before);
      expect(p.allSheets()).toBe(0);
    });
  });

  it("an orphaned engine that keeps running stands down after the cleanup and does not re-theme the page", async () => {
    const p = page(SMALL);
    const before = p.html();
    const orphan = createColorEngine(p.doc, getTheme("midnight"), { styleHost: p.host });
    orphan.apply();
    await p.settle();
    const b = p.applier();
    b.applyTheme("ocean");
    await p.settle();
    // page activity that a live engine reacts to
    p.doc.getElementById("t")!.className = "open";
    p.doc.getElementById("t")!.dispatchEvent(new p.doc.defaultView!.MouseEvent("mouseover", { bubbles: true }));
    await p.settle();
    expect(orphan.isActive()).toBe(false);
    expect(p.engineSheets()).toBe(1);
    p.doc.getElementById("t")!.removeAttribute("class");
    b.restore();
    await p.settle();
    expect(p.html()).toBe(before);
  });

  it("the cleanup leaves UI hosts and tool attributes alone (they may belong to live controllers)", async () => {
    const p = page(SMALL);
    p.applier().applyTheme("midnight");
    await p.settle();
    const ui = p.doc.createElement("div");
    ui.setAttribute("data-skinly-ui", "pet");
    p.doc.body.append(ui);
    p.doc.getElementById("u")!.setAttribute("data-skinly-blur", "");
    const b = p.applier();
    expect(b.applyTheme("ocean").ok).toBe(true);
    expect(p.doc.querySelector('[data-skinly-ui="pet"]')).toBe(ui);
    expect(p.doc.getElementById("u")!.hasAttribute("data-skinly-blur")).toBe(true);
    expect(p.engineSheets()).toBe(1);
  });

  it("a first apply on an untouched page, and an apply after a live Restore, do not run the cleanup walk", async () => {
    const p = page(SMALL);
    const calls = cleanup.calls;
    const a = p.applier();
    expect(p.doc.documentElement.hasAttribute(ROOT_MARK)).toBe(false);
    a.applyTheme("midnight");
    await p.settle();
    a.restore();
    a.applyTheme("ocean");
    await p.settle();
    // a swap on the live instance goes through the engine's own restore, not the cleanup
    a.applyTheme("field");
    await p.settle();
    expect(cleanup.calls).toBe(calls);
  });
});
