import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { injectFile, runInPage } from "../src/extension/api.ts";
import { createApplier, type StyleHost } from "../src/extension/applier-core.ts";
import { frameRole } from "../src/extension/frames.ts";
import { themeToPlan } from "../src/plan/themeToPlan.ts";
import { fakeDeps } from "./analyzer/helpers.ts";

const html = (name: string) => readFileSync(`fixtures/web/${name}.html`, "utf8");

describe("frameRole", () => {
  it("top window", () => {
    const win = { top: null as unknown } as Window;
    (win as { top: unknown }).top = win;
    expect(frameRole(win)).toBe("top");
  });
  it("same-origin frame: the top document is readable", () => {
    const top = { document: {} } as unknown as Window;
    expect(frameRole({ top } as unknown as Window)).toBe("same-origin-frame");
  });
  it("cross-origin frame: reading the top document throws, so it is skipped", () => {
    const top = {
      get document(): never {
        throw new DOMException("blocked", "SecurityError");
      },
    } as unknown as Window;
    expect(frameRole({ top } as unknown as Window)).toBe("cross-origin-frame");
  });
  it("a detached window is skipped", () => {
    expect(frameRole({ top: null } as unknown as Window)).toBe("cross-origin-frame");
  });
  it("real jsdom windows: top is top", () => {
    const { window } = new JSDOM("<!doctype html><body></body>");
    expect(frameRole(window as unknown as Window)).toBe("top");
  });
});

describe("api: allFrames injection with a fake chrome.scripting", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (executeScript: ReturnType<typeof vi.fn>) => vi.stubGlobal("chrome", { scripting: { executeScript } });

  it("injects into all frames when asked and only the top frame otherwise", async () => {
    const exec = vi.fn().mockResolvedValue([]);
    stub(exec);
    await injectFile(5, "applier.js", true);
    expect(exec).toHaveBeenLastCalledWith({ target: { tabId: 5, allFrames: true }, files: ["applier.js"] });
    await injectFile(5, "palette.js");
    expect(exec).toHaveBeenLastCalledWith({ target: { tabId: 5 }, files: ["palette.js"] });
  });

  it("falls back to the top frame when the browser refuses the frames request", async () => {
    const exec = vi.fn().mockRejectedValueOnce(new Error("Cannot access a frame")).mockResolvedValueOnce([]);
    stub(exec);
    await injectFile(5, "applier.js", true);
    expect(exec).toHaveBeenCalledTimes(2);
    expect(exec.mock.calls[1]![0]).toEqual({ target: { tabId: 5 }, files: ["applier.js"] });
  });

  it("returns the top frame's result and ignores the others", async () => {
    const exec = vi.fn().mockResolvedValue([
      { frameId: 7, result: { ok: false, reason: "invariants" } },
      { frameId: 0, result: { ok: true } },
      { frameId: 9, result: undefined },
    ]);
    stub(exec);
    expect(await runInPage(5, "applyTheme", "ocean", true)).toEqual({ ok: true });
    expect(exec.mock.calls[0]![0].target).toEqual({ tabId: 5, allFrames: true });
    expect(await runInPage(5, "analyze")).toEqual({ ok: true });
    expect(exec.mock.calls[1]![0].target).toEqual({ tabId: 5 });
  });

  it("an allFrames failure still reaches the top frame", async () => {
    const exec = vi.fn().mockRejectedValueOnce(new Error("no")).mockResolvedValueOnce([{ frameId: 0, result: "done" }]);
    stub(exec);
    expect(await runInPage(5, "restore", undefined, true)).toBe("done");
  });
});

const fakeHost = () => {
  const sheets: string[] = [];
  const host: StyleHost = { add: (css) => (sheets.push(css), { remove: () => void sheets.splice(sheets.indexOf(css), 1), isAttached: () => sheets.includes(css) }) };
  return { host, sheets };
};

describe("one applier per frame (own ledger, observer and rollback)", () => {
  const frameDocs = () => [new JSDOM(html("legacy-portal-fonts")).window.document, new JSDOM(html("legacy-portal-tables")).window.document];

  it("a frame applies the top page's plan as tokens only, and restores to the exact original", () => {
    const top = new JSDOM(html("service-cards")).window.document;
    const topApplier = createApplier(top, { style: fakeHost().host, summaryDeps: fakeDeps() });
    const analysis = topApplier.analyze();
    if (analysis.status !== "ok") throw new Error("too large");
    const plan = themeToPlan("ocean", analysis.summary);
    expect(plan.regionRules.length).toBeGreaterThan(0);

    for (const doc of frameDocs()) {
      const before = doc.documentElement.outerHTML;
      const { host, sheets } = fakeHost();
      const frame = createApplier(doc, { style: host, summaryDeps: fakeDeps(), tokensOnly: true });
      // The plan has region ids from another document; a frame must not fail on them.
      expect(frame.apply(plan)).toMatchObject({ ok: true, regions: 0 });
      expect(doc.documentElement.getAttribute("data-skinly")).toBe("on");
      expect(doc.querySelector("[data-skinly-r]")).toBeNull();
      expect(sheets).toHaveLength(1);
      expect(frame.applyTheme("midnight")).toMatchObject({ ok: true });
      frame.restore();
      expect(doc.documentElement.outerHTML).toBe(before);
      expect(sheets).toHaveLength(0);
    }
  });

  it("a rollback in one frame leaves the others themed", () => {
    const [a, b] = frameDocs() as [Document, Document];
    const one = fakeHost();
    const two = fakeHost();
    const fa = createApplier(a, { style: one.host, tokensOnly: true, beforeInvariants: () => a.querySelector("input")!.remove() });
    const fb = createApplier(b, { style: two.host, tokensOnly: true });
    expect(fa.applyTheme("ocean")).toMatchObject({ ok: false, reason: "invariants" });
    expect(fb.applyTheme("ocean")).toMatchObject({ ok: true });
    expect(a.documentElement.hasAttribute("data-skinly")).toBe(false);
    expect(b.documentElement.getAttribute("data-skinly")).toBe("on");
    fb.restore();
    expect(b.documentElement.hasAttribute("data-skinly")).toBe(false);
  });

  it("each frame's bounded observer is disconnected by its own restore", () => {
    const doc = new JSDOM(html("legacy-portal-fonts")).window.document;
    const disconnects = vi.spyOn(doc.defaultView!.MutationObserver.prototype, "disconnect");
    const frame = createApplier(doc, { style: fakeHost().host, tokensOnly: true });
    frame.applyTheme("ocean");
    frame.restore();
    expect(disconnects).toHaveBeenCalled();
    expect(frame.isActive()).toBe(false);
  });
});
