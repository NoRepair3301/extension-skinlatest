import { h, render } from "preact";
import { act } from "preact/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, unknown>());
const api = vi.hoisted(() => ({
  queryActiveTab: vi.fn(),
  injectFile: vi.fn(),
  runInPage: vi.fn(),
  runTool: vi.fn(),
  runScene: vi.fn(),
  captureVisible: vi.fn(),
  storageGet: vi.fn(),
  storageSet: vi.fn(),
  setBadge: vi.fn(),
  requestOrigins: vi.fn(),
  removeOrigins: vi.fn(),
  registerAutoScript: vi.fn(),
  unregisterAutoScript: vi.fn(),
  getCommands: vi.fn(),
  browserHints: vi.fn(),
}));
vi.mock("../src/extension/api.ts", () => api);
const flow = vi.hoisted(() => ({ runTransform: vi.fn(), applyTheme: vi.fn(), applyPlan: vi.fn() }));
vi.mock("../src/extension/flow.ts", () => ({ runTransform: flow.runTransform, createPageClient: () => ({ applyTheme: flow.applyTheme, applyPlan: flow.applyPlan }) }));

import { Popup } from "../src/extension/popup/Popup.tsx";
import { encodeThemeCode } from "../src/extension/themeCode.ts";
import { planFor } from "./plan/helpers.ts";

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
const mount = async () => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  await act(() => render(h(Popup, {}), root));
  await flush();
  return root;
};
const click = async (root: HTMLElement, label: string) => {
  const b = Array.from(root.querySelectorAll("button")).find((x) => x.textContent === label);
  expect(b, label).toBeDefined();
  await act(() => b!.click());
  await flush();
  await flush();
};
const preview = () => ({ kind: "preview" as const, source: "ai" as const, plan: { ...planFor("ocean"), sceneId: "space" as const }, baselineThemeId: "calm-light", fingerprint: { hash: "0123abcd", seq: "hnm" }, providerId: "groq", model: "m" });

describe("popup: scene art after Change my page", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    Object.values(api).forEach((f) => f.mockReset());
    Object.values(flow).forEach((f) => f.mockReset());
    store.clear();
    api.storageGet.mockImplementation(async (k: string) => store.get(k));
    api.storageSet.mockImplementation(async (k: string, v: unknown) => void store.set(k, v));
    api.queryActiveTab.mockResolvedValue({ id: 7, url: "https://example.org/a" });
    api.runInPage.mockResolvedValue(undefined);
    api.getCommands.mockResolvedValue([]);
    api.browserHints.mockReturnValue({ userAgent: "Chrome/130 Edg/130", brave: false });
    api.setBadge.mockResolvedValue(undefined);
    api.registerAutoScript.mockResolvedValue(undefined);
    api.requestOrigins.mockResolvedValue(true);
  });

  it("a built-in theme brings its default scene: scene.js is injected into the top frame and asked to show it", async () => {
    flow.runTransform.mockResolvedValue({ kind: "baseline", themeId: "ocean", why: "no-key", message: "Applied." });
    api.runScene.mockResolvedValue({ gutters: "ok", scene: "shown", asset: "none" });
    const root = await mount();
    await click(root, "Change my page");
    expect(api.injectFile).toHaveBeenCalledWith(7, "scene.js");
    const call = api.runScene.mock.calls.find((c) => c[1] === "sync")!;
    expect(call[0]).toBe(7);
    expect(call[2]).toMatchObject({ scene: { sceneId: "ocean", density: "normal", lane: "both" }, asset: null });
  });

  it("an AI plan that picked a scene uses it", async () => {
    flow.runTransform.mockResolvedValue(preview());
    api.runScene.mockResolvedValue({ gutters: "ok", scene: "shown", asset: "none" });
    const root = await mount();
    await click(root, "Change my page");
    expect(api.runScene.mock.calls.find((c) => c[1] === "sync")![2]).toMatchObject({ scene: { sceneId: "space" } });
  });

  it("says in one line why nothing is shown when the page has no free side space", async () => {
    flow.runTransform.mockResolvedValue({ kind: "baseline", themeId: "ocean", why: "no-key", message: "Applied." });
    api.runScene.mockResolvedValue({ gutters: "none", scene: "no-gutter", asset: "none" });
    const root = await mount();
    await click(root, "Change my page");
    expect(root.textContent).toContain("This page uses the full width, so no scene art is shown.");
  });

  it("high contrast and an off scene inject nothing", async () => {
    flow.runTransform.mockResolvedValue({ kind: "baseline", themeId: "high-contrast", why: "no-key", message: "Applied." });
    const root = await mount();
    await click(root, "Change my page");
    expect(api.injectFile).not.toHaveBeenCalledWith(7, "scene.js");
  });

  it("Keep then Remember saves the scene with the site; Always on registers scene.js too", async () => {
    flow.runTransform.mockResolvedValue(preview());
    api.runScene.mockResolvedValue({ gutters: "ok", scene: "shown", asset: "none" });
    const root = await mount();
    await click(root, "Change my page");
    await click(root, "Keep");
    await click(root, "Always on this site");
    const sites = store.get("sites") as Record<string, { look?: { scene?: { id: string } } }>;
    expect(sites["https://example.org"]!.look!.scene!.id).toBe("space");
    expect(api.registerAutoScript).toHaveBeenCalledWith(expect.any(String), ["https://example.org/*"], ["applier-auto.js", "scene.js"]);
  });

  it("changing the scene in the popup updates art that is already showing, and Restore forgets it", async () => {
    flow.runTransform.mockResolvedValue({ kind: "baseline", themeId: "ocean", why: "no-key", message: "Applied." });
    api.runScene.mockResolvedValue({ gutters: "ok", scene: "shown", asset: "none" });
    const root = await mount();
    await click(root, "Change my page");
    const sel = Array.from(root.querySelectorAll("label")).find((l) => l.textContent?.startsWith("Scene"))!.querySelector("select") as HTMLSelectElement;
    sel.value = "paper";
    await act(() => void sel.dispatchEvent(new Event("change", { bubbles: true })));
    await flush();
    const upd = api.runScene.mock.calls.filter((c) => c[1] === "update");
    expect(upd).toHaveLength(1);
    expect(upd[0]![2]).toMatchObject({ scene: { sceneId: "paper" } });
    expect((store.get("settings") as { scene: { choice: string } }).scene.choice).toBe("paper");
    await click(root, "Restore original");
    sel.value = "space";
    await act(() => void sel.dispatchEvent(new Event("change", { bubbles: true })));
    await flush();
    expect(api.runScene.mock.calls.filter((c) => c[1] === "update")).toHaveLength(1);
  });

  it("theme code: a bad code is refused with no page call; a good one goes through applyPlan", async () => {
    const root = await mount();
    const input = root.querySelector('input[type="text"]') as HTMLInputElement;
    const type = async (v: string) => {
      input.value = v;
      await act(() => { input.dispatchEvent(new Event("input", { bubbles: true })); });
    };
    await type("nonsense");
    await click(root, "Import");
    expect(root.textContent).toContain("isn't a valid theme code");
    expect(flow.applyPlan).not.toHaveBeenCalled();
    flow.applyPlan.mockResolvedValue({ ok: true, themeId: "ocean", regions: 0 });
    await type(encodeThemeCode(planFor("ocean")));
    await click(root, "Import");
    expect(flow.applyPlan).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain("Theme code applied");
  });
});
