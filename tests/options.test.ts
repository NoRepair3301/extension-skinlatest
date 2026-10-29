import { h, render } from "preact";
import { act } from "preact/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  storageGet: vi.fn(),
  storageSet: vi.fn(),
  requestOrigins: vi.fn(),
  removeOrigins: vi.fn(),
  unregisterAutoScript: vi.fn(),
  setBadge: vi.fn(),
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
    const models = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="text"]:not([placeholder="example.org"])')).map((i) => i.value);
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

  describe("saved sites and blocklist", () => {
    const rec = (provider: string) => ({
      v: 1,
      plan: { v: 1, themeId: "ocean", tokens: {}, regionRules: [], reasons: [] },
      fingerprint: { hash: "0123abcd", seq: "hnm" },
      provider,
      model: "m",
      promptVersion: "1",
      savedAt: "2026-10-30T10:00:00.000Z",
      mode: "auto",
      blur: [],
      blurImages: false,
    });
    const withSites = () => {
      let sites: Record<string, unknown> = { "https://a.example": rec("gemini"), "https://b.example": rec("groq") };
      api.storageGet.mockImplementation(async (k: string) => (k === "sites" ? sites : undefined));
      api.storageSet.mockImplementation(async (k: string, v: unknown) => {
        if (k === "sites") sites = v as Record<string, unknown>;
      });
      api.removeOrigins.mockResolvedValue(true);
      api.unregisterAutoScript.mockResolvedValue(undefined);
      return () => sites;
    };

    it("lists origin, provider and date", async () => {
      withSites();
      const root = await mount();
      expect(root.textContent).toContain("https://a.example · gemini · 2026-10-30");
      expect(root.textContent).toContain("https://b.example · groq");
    });

    it("Forget removes the record, script and permission for that site only", async () => {
      const sites = withSites();
      const root = await mount();
      await act(() => (root.querySelector('button[aria-label="Forget https://a.example"]') as HTMLButtonElement).click());
      await act(() => new Promise<void>((r) => setTimeout(r, 0)));
      expect(Object.keys(sites())).toEqual(["https://b.example"]);
      expect(api.removeOrigins).toHaveBeenCalledWith(["https://a.example/*"]);
      expect(api.unregisterAutoScript).toHaveBeenCalledTimes(1);
      expect(root.textContent).not.toContain("https://a.example ·");
    });

    it("Forget all clears every record", async () => {
      const sites = withSites();
      const root = await mount();
      await act(() => btn(root, "Forget all").click());
      await act(() => new Promise<void>((r) => setTimeout(r, 0)));
      expect(sites()).toEqual({});
      expect(root.textContent).toContain("No sites saved.");
    });

    it("adds a host to the blocklist, reducing an origin to its host, and removes it", async () => {
      const root = await mount();
      const input = root.querySelector<HTMLInputElement>('input[placeholder="example.org"]')!;
      await act(() => {
        input.value = "https://Bad.Example/path?x=1";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(() => btn(root, "Add to blocklist").click());
      expect(api.storageSet).toHaveBeenCalledWith("settings", expect.objectContaining({ blocklist: ["bad.example"] }));
      expect(root.textContent).toContain("bad.example");
      await act(() => btn(root, "Remove").click());
      expect(api.storageSet).toHaveBeenLastCalledWith("settings", expect.objectContaining({ blocklist: [] }));
    });

    it("rejects text that is not a site", async () => {
      const root = await mount();
      const input = root.querySelector<HTMLInputElement>('input[placeholder="example.org"]')!;
      await act(() => {
        input.value = "not a site!";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(() => btn(root, "Add to blocklist").click());
      expect(root.textContent).toContain("Enter a site such as example.org.");
    });
  });
});
