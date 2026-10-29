import { h, render } from "preact";
import { act } from "preact/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  storageGet: vi.fn(),
  storageSet: vi.fn(),
  requestOrigins: vi.fn(),
}));
vi.mock("../src/extension/api.ts", () => api);
const keys = vi.hoisted(() => ({
  keyStatus: vi.fn(),
  saveKey: vi.fn(),
  deleteKey: vi.fn(),
  testKey: vi.fn(),
  MASK: "••••••••",
}));
vi.mock("../src/extension/keys.ts", () => keys);

import { Options } from "../src/extension/options/Options.tsx";

const mount = async () => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  await act(() => render(h(Options, {}), root));
  await act(() => Promise.resolve());
  return root;
};
const btn = (root: HTMLElement, label: string, nth = 0) => Array.from(root.querySelectorAll("button")).filter((b) => b.textContent === label)[nth]!;

describe("options page", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    Object.values(api).forEach((f) => f.mockReset());
    Object.values(keys).forEach((f) => typeof f === "function" && f.mockReset());
    api.storageGet.mockResolvedValue(undefined);
    api.storageSet.mockResolvedValue(undefined);
    keys.keyStatus.mockResolvedValue({ gemini: false, groq: false });
  });

  it("has password key inputs, model fields with defaults, and the unencrypted note", async () => {
    const root = await mount();
    expect(root.querySelectorAll('input[type="password"]')).toHaveLength(2);
    const models = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="text"]')).map((i) => i.value);
    expect(models).toEqual(["gemini-3.8-flash", "openai/gpt-oss-120b"]);
    expect(root.textContent).toContain("stored unencrypted in this browser profile");
    expect(root.textContent).toContain("AI calls today: 0 of 20");
    expect(root.textContent).toContain("not affiliated with any website");
  });

  it("saves a key, clears the input and never shows the key again", async () => {
    keys.saveKey.mockResolvedValue({ ok: true });
    const root = await mount();
    const input = root.querySelectorAll<HTMLInputElement>('input[type="password"]')[1]!;
    await act(() => {
      input.value = "my-secret-key-123";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(() => btn(root, "Save key", 1).click());
    await act(() => Promise.resolve());
    expect(keys.saveKey).toHaveBeenCalledWith("groq", "my-secret-key-123");
    expect(root.querySelectorAll<HTMLInputElement>('input[type="password"]')[1]!.value).toBe("");
    expect(root.textContent).not.toContain("my-secret-key-123");
    expect(root.textContent).toContain("Key saved.");
  });

  it("explains a refused permission", async () => {
    keys.saveKey.mockResolvedValue({ ok: false, reason: "permission" });
    const root = await mount();
    const input = root.querySelectorAll<HTMLInputElement>('input[type="password"]')[0]!;
    await act(() => {
      input.value = "abc";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(() => btn(root, "Save key", 0).click());
    await act(() => Promise.resolve());
    expect(root.textContent).toContain("Permission for this provider was not granted");
  });

  it("tests and removes a saved key", async () => {
    keys.keyStatus.mockResolvedValue({ gemini: false, groq: true });
    keys.testKey.mockResolvedValue("ok");
    keys.deleteKey.mockResolvedValue(undefined);
    const root = await mount();
    expect(root.textContent).toContain("saved: ••••••••");
    await act(() => btn(root, "Test key", 1).click());
    await act(() => Promise.resolve());
    expect(keys.testKey).toHaveBeenCalledWith("groq", "openai/gpt-oss-120b");
    expect(root.textContent).toContain("Key works.");
    await act(() => btn(root, "Remove key", 1).click());
    await act(() => Promise.resolve());
    expect(keys.deleteKey).toHaveBeenCalledWith("groq");
    expect(root.textContent).toContain("Key removed.");
  });

  it("reorders providers and saves the order", async () => {
    const root = await mount();
    await act(() => btn(root, "Down", 0).click());
    expect(api.storageSet).toHaveBeenCalledWith("settings", expect.objectContaining({ order: ["groq", "gemini"] }));
  });
});
