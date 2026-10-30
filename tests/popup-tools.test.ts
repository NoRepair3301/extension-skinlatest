import { h, render } from "preact";
import { act } from "preact/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, unknown>());
const api = vi.hoisted(() => ({
  queryActiveTab: vi.fn(),
  injectFile: vi.fn(),
  runInPage: vi.fn(),
  runTool: vi.fn(),
  captureVisible: vi.fn(),
  storageGet: vi.fn(),
  storageSet: vi.fn(),
  setBadge: vi.fn(),
  requestOrigins: vi.fn(),
  removeOrigins: vi.fn(),
  registerAutoScript: vi.fn(),
  unregisterAutoScript: vi.fn(),
}));
vi.mock("../src/extension/api.ts", () => api);
vi.mock("../src/extension/flow.ts", () => ({ runTransform: vi.fn(), createPageClient: () => ({ applyTheme: vi.fn() }) }));

import { Popup } from "../src/extension/popup/Popup.tsx";

const TAB = { id: 7, url: "https://example.org/a" };
const mount = async () => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  await act(() => render(h(Popup, {}), root));
  await act(() => new Promise<void>((r) => setTimeout(r, 0)));
  return root;
};
const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
const labelled = (root: HTMLElement, text: string) => Array.from(root.querySelectorAll("label")).find((l) => l.textContent?.trim() === text);

beforeEach(() => {
  document.body.innerHTML = "";
  Object.values(api).forEach((f) => f.mockReset());
  store.clear();
  api.storageGet.mockImplementation(async (k: string) => store.get(k));
  api.storageSet.mockImplementation(async (k: string, v: unknown) => void store.set(k, v));
  api.setBadge.mockResolvedValue(undefined);
  api.queryActiveTab.mockResolvedValue(TAB);
  api.injectFile.mockResolvedValue(undefined);
});

describe("popup privacy labels (G)", () => {
  it("uses the three blur labels", async () => {
    const root = await mount();
    for (const label of ["Blur whole page", "Blur picked parts", "Blur images and video"]) expect(labelled(root, label), label).toBeDefined();
    expect(root.textContent).not.toContain("Share mode");
    expect(root.textContent).not.toContain("Blur all images");
  });

  it("Blur whole page injects the page script after the click and asks the page for the overlay", async () => {
    api.runTool.mockResolvedValueOnce(undefined); // nothing injected yet, so the first state read is empty
    api.runTool.mockResolvedValue({ share: false, count: 0, missing: 0, images: false, picked: [], picking: false, page: true });
    const root = await mount();
    expect(api.injectFile).not.toHaveBeenCalled();
    await act(() => labelled(root, "Blur whole page")!.querySelector("input")!.click());
    await flush();
    expect(api.injectFile).toHaveBeenCalledWith(7, "applier.js", true);
    expect(api.runTool).toHaveBeenCalledWith(7, "blurPage", true);
    expect(labelled(root, "Blur whole page")!.querySelector("input")!.checked).toBe(true);
  });

  it("reflects a veil that is already on when the popup opens, without injecting anything", async () => {
    api.runTool.mockResolvedValue({ share: false, count: 0, missing: 0, images: false, picked: [], picking: false, page: true });
    const root = await mount();
    expect(labelled(root, "Blur whole page")!.querySelector("input")!.checked).toBe(true);
    expect(api.injectFile).not.toHaveBeenCalled();
  });
});
