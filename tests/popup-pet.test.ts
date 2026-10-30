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

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
const mount = async () => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  await act(() => render(h(Popup, {}), root));
  await flush();
  return root;
};
const selectByLabel = (root: HTMLElement, label: string) =>
  Array.from(root.querySelectorAll("label")).find((l) => l.textContent?.startsWith(label))?.querySelector("select") as HTMLSelectElement | undefined;
const pick = async (sel: HTMLSelectElement, value: string) => {
  sel.value = value;
  await act(() => void sel.dispatchEvent(new Event("change", { bubbles: true })));
  await flush();
};

describe("popup: pet options and the toggle-pet shortcut", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    Object.values(api).forEach((f) => f.mockReset());
    store.clear();
    api.storageGet.mockImplementation(async (k: string) => store.get(k));
    api.storageSet.mockImplementation(async (k: string, v: unknown) => void store.set(k, v));
    api.queryActiveTab.mockResolvedValue({ id: 7, url: "https://example.org/a" });
    api.runInPage.mockResolvedValue(undefined);
    api.browserHints.mockReturnValue({ userAgent: "Chrome/130 Edg/130", brave: false });
    api.getCommands.mockResolvedValue([
      { name: "toggle-pet", description: "Show or hide the pet on this page", shortcut: "Alt+Shift+P" },
      { name: "open-palette", description: "Find a link or button on this page", shortcut: "" },
    ]);
  });

  it("shows the real key for toggle-pet and the not-set hint for an unassigned one", async () => {
    const root = await mount();
    const items = Array.from(root.querySelectorAll('section[aria-label="Shortcuts"] li')).map((l) => l.textContent ?? "");
    expect(items.some((t) => t.includes("Alt+Shift+P"))).toBe(true);
    expect(items.some((t) => t.includes("Not set"))).toBe(true);
  });

  it("offers the five pets plus the two originals, and saves a changed pet and movement", async () => {
    const root = await mount();
    const kind = selectByLabel(root, "Pet")!;
    expect(Array.from(kind.options).map((o) => o.value)).toEqual(["fox", "cat", "bunny", "slime", "owl", "pebble", "sprout"]);
    await pick(kind, "owl");
    await pick(selectByLabel(root, "Movement")!, "horizontal");
    const saved = store.get("settings") as { pet: Record<string, unknown> };
    expect(saved.pet).toMatchObject({ kind: "owl", motion: "horizontal", keepInFreeSpace: true });
    // the direction and speed selects only exist once the pet walks
    expect(selectByLabel(root, "Direction")).toBeDefined();
    expect(Array.from(selectByLabel(root, "Direction")!.options).map((o) => o.textContent)).toEqual(["Left to right", "Right to left", "Back and forth"]);
    await pick(selectByLabel(root, "Movement")!, "vertical");
    expect(Array.from(selectByLabel(root, "Direction")!.options).map((o) => o.textContent)).toEqual(["Top to bottom", "Bottom to top", "Back and forth"]);
  });

  it("hides the walking controls while the pet stays still", async () => {
    const root = await mount();
    expect(selectByLabel(root, "Direction")).toBeUndefined();
    expect(selectByLabel(root, "Speed")).toBeUndefined();
  });
});
