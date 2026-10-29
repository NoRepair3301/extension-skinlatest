import { h, render } from "preact";
import { act } from "preact/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  queryActiveTab: vi.fn(),
  injectFile: vi.fn(),
  runInPage: vi.fn(),
  storageGet: vi.fn(),
  storageSet: vi.fn(),
}));
vi.mock("../src/extension/api.ts", () => api);

import { BLOCKED_MESSAGE, Popup } from "../src/extension/popup/Popup.tsx";

const mount = async () => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  await act(() => render(h(Popup, {}), root));
  return root;
};
const click = async (root: HTMLElement, label: string) => {
  const btn = Array.from(root.querySelectorAll("button")).find((b) => b.textContent === label)!;
  await act(() => btn.click());
  await act(() => Promise.resolve());
};

describe("popup", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    Object.values(api).forEach((f) => f.mockReset());
    api.storageGet.mockResolvedValue(undefined);
    api.storageSet.mockResolvedValue(undefined);
    api.injectFile.mockResolvedValue(undefined);
  });

  it("shows the title, five themes and the not-affiliated line", async () => {
    const root = await mount();
    expect(root.textContent).toContain("Skinly AI");
    expect(root.textContent).toContain("Skinly AI is not affiliated with any website.");
    expect(root.querySelectorAll('input[type="radio"]')).toHaveLength(5);
  });

  it("injects the applier and applies the chosen theme only after the click", async () => {
    api.queryActiveTab.mockResolvedValue({ id: 7, url: "https://example.org/a" });
    api.runInPage.mockResolvedValue({ ok: true });
    const root = await mount();
    expect(api.injectFile).not.toHaveBeenCalled();
    await click(root, "Transform this page");
    expect(api.injectFile).toHaveBeenCalledWith(7, "applier.js");
    expect(api.runInPage).toHaveBeenCalledWith(7, "applyTheme", "calm-light");
    expect(root.querySelector('[role="status"]')!.textContent).toBe("Done.");
  });

  it("saves the picked theme and uses it", async () => {
    api.queryActiveTab.mockResolvedValue({ id: 7, url: "https://example.org/a" });
    api.runInPage.mockResolvedValue({ ok: true });
    const root = await mount();
    const midnight = root.querySelector<HTMLInputElement>('input[value="midnight"]')!;
    await act(() => midnight.click());
    expect(api.storageSet).toHaveBeenCalledWith("settings", expect.objectContaining({ theme: "midnight" }));
    await click(root, "Transform this page");
    expect(api.runInPage).toHaveBeenCalledWith(7, "applyTheme", "midnight");
  });

  it("restores the last saved theme from storage", async () => {
    api.storageGet.mockResolvedValue({ theme: "ocean", blocklist: [] });
    const root = await mount();
    await act(() => Promise.resolve());
    expect(root.querySelector<HTMLInputElement>('input[value="ocean"]')!.checked).toBe(true);
  });

  it.each(["chrome://extensions", "https://chromewebstore.google.com/x", "https://erp.iitkgp.ac.in/", "file:///a.html"])("blocks %s without injecting", async (url) => {
    api.queryActiveTab.mockResolvedValue({ id: 1, url });
    const root = await mount();
    await click(root, "Transform this page");
    expect(root.querySelector('[role="status"]')!.textContent).toBe(BLOCKED_MESSAGE);
    expect(api.injectFile).not.toHaveBeenCalled();
  });

  it("blocks when the tab url is unknown", async () => {
    api.queryActiveTab.mockResolvedValue({ id: 1, url: undefined });
    const root = await mount();
    await click(root, "Transform this page");
    expect(api.injectFile).not.toHaveBeenCalled();
  });

  it("reports a failed apply and leaves the message short", async () => {
    api.queryActiveTab.mockResolvedValue({ id: 7, url: "https://example.org/a" });
    api.runInPage.mockResolvedValue({ ok: false, reason: "invariants" });
    const root = await mount();
    await click(root, "Transform this page");
    expect(root.querySelector('[role="status"]')!.textContent).toContain("left as it was");
  });

  it("restore calls the page restore", async () => {
    api.queryActiveTab.mockResolvedValue({ id: 7, url: "https://example.org/a" });
    api.runInPage.mockResolvedValue({ ok: true });
    const root = await mount();
    await click(root, "Restore original");
    expect(api.runInPage).toHaveBeenCalledWith(7, "restore");
  });
});
