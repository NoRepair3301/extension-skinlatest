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
  getCommands: vi.fn(),
  browserHints: vi.fn(),
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
  api.getCommands.mockResolvedValue([]);
  api.browserHints.mockReturnValue({ userAgent: "Chrome/130 Edg/130", brave: false });
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

describe("popup shortcut list (H)", () => {
  const cmds = [
    { name: "transform-page", description: "Apply your built-in theme to this page", shortcut: "Alt+Shift+S" },
    { name: "restore-page", description: "Restore the original page", shortcut: "" },
    { name: "open-palette", description: "Find a link or button on this page", shortcut: "Alt+Shift+K" },
    { name: "toggle-blur-page", description: "Blur or unblur the whole page", shortcut: "" },
    { name: "_execute_action", description: "", shortcut: "" },
  ];

  it("lists every command with the key the browser assigned, or how to set one", async () => {
    api.getCommands.mockResolvedValue(cmds);
    const root = await mount();
    const items = Array.from(root.querySelectorAll('[aria-label="Shortcuts"] li')).map((li) => li.textContent);
    expect(items).toEqual([
      "Apply your built-in theme to this page: Alt+Shift+S",
      "Restore the original page: Not set - open edge://extensions/shortcuts",
      "Find a link or button on this page: Alt+Shift+K",
      "Blur or unblur the whole page: Not set - open edge://extensions/shortcuts",
    ]);
    expect(root.textContent).toContain("open edge://extensions/shortcuts in the address bar");
  });

  it("still explains where to set keys when the command list cannot be read", async () => {
    api.getCommands.mockRejectedValue(new Error("x"));
    const root = await mount();
    expect(root.querySelectorAll('[aria-label="Shortcuts"] li')).toHaveLength(0);
    expect(root.textContent).toContain("edge://extensions/shortcuts");
  });

  it("names Chrome's page on Chrome", async () => {
    api.browserHints.mockReturnValue({ userAgent: "Mozilla/5.0 Chrome/130 Safari/537.36", brave: false });
    api.getCommands.mockResolvedValue([cmds[1]!]);
    const root = await mount();
    expect(root.textContent).toContain("Not set - open chrome://extensions/shortcuts");
  });
});
