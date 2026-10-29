import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
const api = vi.hoisted(() => ({
  storageGet: vi.fn(async (k: string) => store.data[k]),
  storageSet: vi.fn(async (k: string, v: unknown) => {
    store.data[k] = v;
  }),
  requestOrigins: vi.fn(async () => true),
}));
vi.mock("../src/extension/api.ts", () => api);

import { deleteKey, getKey, keyStatus, MASK, maskKey, readKeys, saveKey, testKey } from "../src/extension/keys.ts";

const KEY = "k-" + "q".repeat(20);

describe("keys", () => {
  beforeEach(() => {
    store.data = {};
    api.requestOrigins.mockReset();
    api.requestOrigins.mockResolvedValue(true);
  });

  it("saves under storage key 'keys' after asking for that provider's host only", async () => {
    expect(await saveKey("groq", ` ${KEY} `)).toEqual({ ok: true });
    expect(api.requestOrigins).toHaveBeenCalledWith(["https://api.groq.com/*"]);
    expect(store.data["keys"]).toEqual({ groq: KEY });
    expect(await getKey("groq")).toBe(KEY);
    expect(await keyStatus()).toEqual({ gemini: false, groq: true });
  });

  it("requests the Gemini host for a Gemini key and keeps the other key", async () => {
    await saveKey("groq", KEY);
    await saveKey("gemini", KEY + "2");
    expect(api.requestOrigins).toHaveBeenLastCalledWith(["https://generativelanguage.googleapis.com/*"]);
    expect(await readKeys()).toEqual({ groq: KEY, gemini: KEY + "2" });
  });

  it("does not save when the permission is refused", async () => {
    api.requestOrigins.mockResolvedValue(false);
    expect(await saveKey("groq", KEY)).toEqual({ ok: false, reason: "permission" });
    expect(store.data["keys"]).toBeUndefined();
  });

  it("rejects empty, whitespace-containing and oversized keys without asking for permission", async () => {
    for (const bad of ["", "   ", "a b", "x".repeat(513)]) expect(await saveKey("groq", bad)).toEqual({ ok: false, reason: "invalid" });
    expect(api.requestOrigins).not.toHaveBeenCalled();
  });

  it("deletes one key only", async () => {
    await saveKey("groq", KEY);
    await saveKey("gemini", KEY + "2");
    await deleteKey("groq");
    expect(await readKeys()).toEqual({ gemini: KEY + "2" });
  });

  it("ignores corrupt stored data", async () => {
    store.data["keys"] = { gemini: 5, groq: "", other: "x" };
    expect(await readKeys()).toEqual({});
    store.data["keys"] = "nope";
    expect(await readKeys()).toEqual({});
  });

  it("masks a saved key without revealing any of it", () => {
    expect(maskKey(KEY)).toBe(MASK);
    expect(maskKey(KEY)).not.toContain("q");
    expect(maskKey(undefined)).toBe("");
  });

  it("testKey reports auth when no key is saved, without any network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await testKey("groq", "m")).toBe("auth");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("testKey sends one tiny request and returns ok or the error kind, never the key", async () => {
    await saveKey("groq", KEY);
    const seen: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      seen.push(String(url) + JSON.stringify(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
    });
    expect(await testKey("groq", "m")).toBe("ok");
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toContain(KEY);
    fetchSpy.mockImplementation(async () => new Response("{}", { status: 401 }));
    expect(await testKey("groq", "m")).toBe("auth");
    fetchSpy.mockRestore();
  });
});
