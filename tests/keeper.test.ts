import { beforeEach, describe, expect, it, vi } from "vitest";
import { themeToPlan } from "../src/plan/themeToPlan.ts";

/** F1 (S5.2): the keeper puts the kept theme on an open tab only when the page does not show it already, and never stacks a second theme. */
const api = vi.hoisted(() => ({ getPageUrl: vi.fn(), runInPage: vi.fn(), injectFiles: vi.fn() }));
vi.mock("../src/extension/api.ts", async (orig) => ({ ...(await orig<typeof import("../src/extension/api.ts")>()), ...api }));

import { applyToTab } from "../src/extension/keeper.ts";

const ORIGIN = "https://en.wikipedia.org";
const B = themeToPlan("midnight");

const shows = (themeId: string | undefined) =>
  api.runInPage.mockImplementation(async (_tab: number, method: string) => (method === "shownTheme" ? (themeId ? { themeId, strategy: "full" } : undefined) : { ok: true }));

describe("applyToTab (theme-aware)", () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    api.getPageUrl.mockResolvedValue(`${ORIGIN}/wiki/Sun`);
    api.injectFiles.mockResolvedValue(undefined);
  });

  it("skips a tab that already shows the kept theme", async () => {
    shows("midnight");
    expect(await applyToTab(7, ORIGIN, B)).toBe(true);
    expect(api.runInPage.mock.calls.map((c) => c[1])).toEqual(["shownTheme"]);
    expect(api.injectFiles).not.toHaveBeenCalled();
  });

  it("re-applies the kept plan through the live applier, in all frames, when another theme is on", async () => {
    shows("ocean");
    expect(await applyToTab(7, ORIGIN, B)).toBe(true);
    expect(api.runInPage).toHaveBeenLastCalledWith(7, "apply", B, true);
    expect(api.injectFiles).not.toHaveBeenCalled();
  });

  it("injects the auto files into an unthemed tab", async () => {
    shows(undefined);
    expect(await applyToTab(7, ORIGIN, B)).toBe(true);
    expect(api.injectFiles).toHaveBeenCalledWith(7, ["applier.js", "applier-auto.js", "scene.js"]);
    expect(api.runInPage.mock.calls.some((c) => c[1] === "apply")).toBe(false);
  });

  it("injects the auto files when the tab has no applier yet (the page cannot be asked)", async () => {
    api.runInPage.mockRejectedValue(new Error("no applier"));
    expect(await applyToTab(7, ORIGIN, B)).toBe(true);
    expect(api.injectFiles).toHaveBeenCalledTimes(1);
  });

  it("ignores a tab that left the origin", async () => {
    api.getPageUrl.mockResolvedValue("https://de.wikipedia.org/wiki/Sonne");
    shows("ocean");
    expect(await applyToTab(7, ORIGIN, B)).toBe(false);
    expect(api.runInPage).not.toHaveBeenCalled();
    expect(api.injectFiles).not.toHaveBeenCalled();
  });

  it("without a plan (nothing to compare) a themed page is left as it is", async () => {
    shows("ocean");
    expect(await applyToTab(7, ORIGIN)).toBe(true);
    expect(api.runInPage.mock.calls.map((c) => c[1])).toEqual(["shownTheme"]);
  });
});
