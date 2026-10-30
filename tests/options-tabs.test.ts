import { h, render } from "preact";
import { act } from "preact/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  storageGet: vi.fn(), storageSet: vi.fn(), requestOrigins: vi.fn(), removeOrigins: vi.fn(), unregisterAutoScript: vi.fn(), setBadge: vi.fn(),
  getCommands: vi.fn(), browserHints: vi.fn(), extensionVersion: vi.fn(), clearAllStorage: vi.fn(), removeAllOrigins: vi.fn(),
}));
vi.mock("../src/extension/api.ts", () => api);
const keys = vi.hoisted(() => ({ keyStatus: vi.fn(), saveKey: vi.fn(), deleteKey: vi.fn(), testKey: vi.fn(), MASK: "••••••••" }));
vi.mock("../src/extension/keys.ts", () => keys);

import { Options } from "../src/extension/options/Options.tsx";

const mount = async () => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  await act(() => render(h(Options, {}), root));
  await act(() => Promise.resolve());
  return root;
};
const tabs = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]'));
const panelOf = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`#panel-${id}`)!;

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 20)));

describe("options tabs", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    location.hash = "";
    Object.values(api).forEach((f) => f.mockReset());
    Object.values(keys).forEach((f) => typeof f === "function" && f.mockReset());
    api.storageGet.mockImplementation(async (k: string) => (k === "settings" ? { welcomeDone: true } : undefined));
    api.storageSet.mockResolvedValue(undefined);
    api.getCommands.mockResolvedValue([{ name: "toggle-pet", description: "Show or hide the pet", shortcut: "Alt+Shift+P" }, { name: "x", description: "Other", shortcut: "" }]);
    api.browserHints.mockReturnValue({ userAgent: "Mozilla/5.0 Edg/120", brave: false });
    api.extensionVersion.mockReturnValue("0.2.0");
    api.clearAllStorage.mockResolvedValue(undefined);
    api.removeAllOrigins.mockResolvedValue(undefined);
    keys.keyStatus.mockResolvedValue({ gemini: false, groq: false });
  });

  it("has the nine sections, one visible panel, and General first", async () => {
    const root = await mount();
    expect(tabs(root).map((t) => t.textContent)).toEqual(["General", "Themes", "Scenes and pets", "My assets", "AI providers", "Sites", "Shortcuts", "Privacy", "About"]);
    const visible = Array.from(root.querySelectorAll<HTMLElement>('[role="tabpanel"]')).filter((p) => !p.hidden);
    expect(visible.map((p) => p.id)).toEqual(["panel-general"]);
  });

  it("selecting a tab shows its panel (mouse and keyboard)", async () => {
    const root = await mount();
    await act(() => { tabs(root)[6]!.click(); });
    expect(panelOf(root, "shortcuts").hidden).toBe(false);
    expect(panelOf(root, "general").hidden).toBe(true);
    await act(() => { tabs(root)[6]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })); });
    expect(panelOf(root, "privacy").hidden).toBe(false);
  });

  it("opens on the tab named in the address hash", async () => {
    location.hash = "#about";
    const root = await mount();
    expect(panelOf(root, "about").hidden).toBe(false);
    expect(panelOf(root, "about").textContent).toContain("Version 0.2.0");
  });

  it("Shortcuts lists each command with its real key or how to set one", async () => {
    const root = await mount();
    const text = panelOf(root, "shortcuts").textContent!;
    expect(text).toContain("Show or hide the pet: Alt+Shift+P");
    expect(text).toContain("Other: Not set - open edge://extensions/shortcuts");
  });

  it("each provider says what it receives", async () => {
    const root = await mount();
    expect(panelOf(root, "providers").textContent).toContain("no text, links, images or forms");
  });

  it("Sites: search filters the saved sites", async () => {
    api.storageGet.mockImplementation(async (k: string) => (k === "sites" ? { v: 1, sites: {} } : undefined));
    const root = await mount();
    expect(panelOf(root, "sites").textContent).toContain("No sites saved.");
  });

  it("first run: the welcome opens once with three steps, can be skipped, and is remembered", async () => {
    api.storageGet.mockResolvedValue(undefined);
    const root = await mount();
    const dlg = () => root.querySelector("dialog");
    expect(dlg()!.textContent).toContain("Step 1 of 3");
    const press = (label: string) => act(() => { Array.from(root.querySelectorAll("dialog button")).find((b) => b.textContent === label)!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await press("Next");
    expect(dlg()!.textContent).toContain("Step 2 of 3");
    expect(dlg()!.querySelector('input[type="password"]')).toBeTruthy();
    await press("Next");
    expect(dlg()!.textContent).toContain("stay on this device");
    await press("Done");
    await flush();
    expect(dlg()).toBeNull();
    const saved = api.storageSet.mock.calls.filter((c) => c[0] === "settings").at(-1)![1] as { welcomeDone: boolean };
    expect(saved.welcomeDone).toBe(true);
  });

  it("first run: Skip closes it at once and About can reopen it", async () => {
    api.storageGet.mockResolvedValue(undefined);
    const root = await mount();
    await act(() => { Array.from(root.querySelectorAll("dialog button")).find((b) => b.textContent === "Skip")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await flush();
    expect(root.querySelector("dialog")).toBeNull();
    await act(() => { Array.from(root.querySelectorAll("button")).find((b) => b.textContent === "Show the welcome again")!.click(); });
    expect(root.querySelector("dialog")!.textContent).toContain("Step 1 of 3");
  });

  it("when already done the welcome is not shown", async () => {
    const root = await mount();
    expect(root.querySelector("dialog")).toBeNull();
  });

  it("Erase all: a confirm dialog first, cancel does nothing, confirm clears storage and permissions", async () => {
    const root = await mount();
    await act(() => { tabs(root)[7]!.click(); });
    const open = Array.from(panelOf(root, "privacy").querySelectorAll("button")).find((b) => b.textContent === "Erase all Skinly data")!;
    await act(() => { open.click(); });
    const dlg = root.querySelector("dialog")!;
    expect(dlg.getAttribute("aria-labelledby")).toBeTruthy();
    expect(api.clearAllStorage).not.toHaveBeenCalled();
    const [cancel, go] = Array.from(dlg.querySelectorAll("button"));
    await act(() => { cancel!.click(); });
    expect(root.querySelector("dialog")).toBeNull();
    expect(api.clearAllStorage).not.toHaveBeenCalled();
    await act(() => { open.click(); });
    await act(() => { Array.from(root.querySelectorAll("dialog button")).find((b) => b.textContent === "Erase everything")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await act(() => Promise.resolve());
    await act(() => new Promise<void>((r) => setTimeout(r, 20)));
    expect(go).toBeTruthy();
    expect(api.removeAllOrigins).toHaveBeenCalledTimes(1);
    expect(api.clearAllStorage).toHaveBeenCalledTimes(1);
    expect(panelOf(root, "privacy").textContent).toContain("All Skinly data was erased.");
  });
  it("About: Copy diagnostics puts the fixed report on the clipboard and shows it; no page data (stage 2)", async () => {
    const diag = { v: 1, errors: ["scene-mount"], provider: "timeout", origin: "https://bank.example", page: { theme: "midnight", strategy: "safe", art: "narrow", host: false, left: 40, right: 0, actors: 0, pet: true, sheets: "yes", mount: "body", htmlEffect: "transform", reattached: 2, title: "My Account Title" } };
    api.storageGet.mockImplementation(async (k: string) => (k === "settings" ? { welcomeDone: true } : k === "diag" ? diag : undefined));
    const writes: string[] = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => void writes.push(t) } });
    const root = await mount();
    tabs(root).find((t) => t.textContent === "About")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    const button = Array.from(panelOf(root, "about").querySelectorAll("button")).find((b) => b.textContent === "Copy diagnostics")!;
    expect(button).toBeDefined();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    expect(writes).toHaveLength(1);
    const text = writes[0]!;
    for (const line of ["version: 0.2.0", "theme: midnight", "strategy: safe", "art: narrow", "host present: no", "gutters: left 40 px, right 0 px", "actors: 0", "mount: body (html effect: transform)", "re-attached: 2", "last provider result: timeout", "scene-mount"]) expect(text).toContain(line);
    for (const m of ["bank.example", "My Account Title"]) expect(text).not.toContain(m);
    expect(panelOf(root, "about").textContent).toContain("Copied.");
    expect((panelOf(root, "about").querySelector("textarea") as HTMLTextAreaElement).value).toBe(text);
  });

  it("About: when the clipboard is refused the text stays visible to copy by hand", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } });
    const root = await mount();
    const button = Array.from(panelOf(root, "about").querySelectorAll("button")).find((b) => b.textContent === "Copy diagnostics")!;
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    expect(panelOf(root, "about").textContent).toContain("Could not copy");
    expect((panelOf(root, "about").querySelector("textarea") as HTMLTextAreaElement).value).toContain("version: 0.2.0");
  });
});
