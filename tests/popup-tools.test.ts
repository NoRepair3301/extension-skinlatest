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
const flow = vi.hoisted(() => ({ runTransform: vi.fn() }));
vi.mock("../src/extension/flow.ts", () => ({ runTransform: flow.runTransform, createPageClient: () => ({ applyTheme: vi.fn() }) }));

import { Popup } from "../src/extension/popup/Popup.tsx";
import { PET_WHY } from "../src/extension/petActions.ts";

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
  flow.runTransform.mockReset();
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

describe("popup pet button (I)", () => {
  const petOn = (over: Record<string, unknown> = {}) =>
    store.set("settings", { theme: "calm-light", blocklist: [], pet: { enabled: true, kind: "pebble", size: "medium", corner: "bottom-right", disabledOrigins: [], ...over } });
  const button = (root: HTMLElement) => Array.from(root.querySelectorAll("button")).find((b) => b.textContent === "Show pet on this page")!;
  const petNote = (root: HTMLElement) => root.querySelector('fieldset [aria-live="polite"]')!.textContent;
  const click = async (b: HTMLElement) => {
    await act(() => b.click());
    await flush();
  };

  it("has a Show pet on this page button and injects nothing until it is clicked", async () => {
    petOn();
    const root = await mount();
    expect(button(root)).toBeDefined();
    expect(api.injectFile).not.toHaveBeenCalled();
    expect(api.runInPage).not.toHaveBeenCalled();
  });

  it("shows the pet after the click: injects the page script and asks it to show the pet", async () => {
    petOn();
    api.runInPage.mockResolvedValue(true);
    const root = await mount();
    await click(button(root));
    expect(api.injectFile).toHaveBeenCalledWith(7, "applier.js");
    expect(api.runInPage).toHaveBeenCalledWith(7, "syncPet", expect.objectContaining({ enabled: true }));
    expect(petNote(root)).toContain("The pet is on this page");
  });

  it("when the pet is off it says so in one line and injects nothing", async () => {
    const root = await mount();
    await click(button(root));
    expect(petNote(root)).toBe(PET_WHY.off);
    expect(api.injectFile).not.toHaveBeenCalled();
  });

  it("on a page it cannot use, the one line says why", async () => {
    petOn();
    api.queryActiveTab.mockResolvedValue({ id: 7, url: "https://chromewebstore.google.com/x" });
    const root = await mount();
    await click(button(root));
    expect(petNote(root)).toBe(PET_WHY.blocked);
    expect(api.injectFile).not.toHaveBeenCalled();
  });

  it("when the page script cannot show it, the one line says so", async () => {
    petOn();
    api.runInPage.mockResolvedValue(false);
    const root = await mount();
    await click(button(root));
    expect(petNote(root)).toBe(PET_WHY.notShown);
  });

  it("shows after any tool used on the page (Blur whole page)", async () => {
    petOn();
    api.runTool.mockResolvedValue({ share: false, count: 0, missing: 0, images: false, picked: [], picking: false, page: true });
    api.runInPage.mockResolvedValue(true);
    const root = await mount();
    await act(() => labelled(root, "Blur whole page")!.querySelector("input")!.click());
    await flush();
    expect(api.runInPage).toHaveBeenCalledWith(7, "syncPet", expect.objectContaining({ enabled: true }));
  });

  it("does not depend on the theme: a theme that failed to apply still gets the pet", async () => {
    petOn();
    api.runInPage.mockResolvedValue(true);
    flow.runTransform.mockResolvedValue({ kind: "error", errorKind: "baseline", message: "The theme's colours were too hard to read here, so the page was left as it was.", themeId: "calm-light" });
    const root = await mount();
    await click(Array.from(root.querySelectorAll("button")).find((b) => b.textContent === "Change my page")!);
    expect(root.querySelector('[role="status"]')!.textContent).toContain("too hard to read");
    expect(api.runInPage).toHaveBeenCalledWith(7, "syncPet", expect.objectContaining({ enabled: true }));
  });

  it("never on a blocked outcome", async () => {
    petOn();
    flow.runTransform.mockResolvedValue({ kind: "blocked", reason: "internal", message: "Skinly can't change this kind of page" });
    const root = await mount();
    await click(Array.from(root.querySelectorAll("button")).find((b) => b.textContent === "Change my page")!);
    expect(api.runInPage).not.toHaveBeenCalled();
  });

  it("changing a pet setting only updates a pet already on the page, and never injects", async () => {
    petOn();
    const root = await mount();
    await act(() => root.querySelector<HTMLInputElement>('fieldset input[type="checkbox"]')!.click());
    await flush();
    expect(api.runInPage).toHaveBeenCalledWith(7, "updatePet", expect.objectContaining({ enabled: false }));
    expect(api.runInPage).not.toHaveBeenCalledWith(7, "syncPet", expect.anything());
    expect(api.injectFile).not.toHaveBeenCalled();
  });

  it("the pet is off by default", async () => {
    const root = await mount();
    expect(root.querySelector<HTMLInputElement>('fieldset input[type="checkbox"]')!.checked).toBe(false);
  });
});
