import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../src/extension/api.ts", () => ({
  storageGet: async (k: string) => store.get(k),
  storageSet: async (k: string, v: unknown) => void store.set(k, v),
  storageRemove: async (k: string) => void store.delete(k),
}));

import { migrateStorage, STORAGE_VERSION } from "../src/extension/sites.ts";

/** Everything the removed paid-tier code kept in storage.local; the migration must delete exactly these. */
const OLD = {
  auth: { access: "a", refresh: "r", email: "x@example.org" },
  entitlement: { token: "t", fetchedAt: 1 },
  plan: { v: 1, plan: "plus", until: 9e15 },
};
const KEEP = {
  settings: { theme: "ocean", pet: { on: true } },
  assets: { a1: { name: "mine.png" } },
  keys: { gemini: "k" },
  diag: { last: "ok" },
  intent: { origin: "https://a.example" },
};
const snapshot = () => JSON.stringify([...store.entries()].sort(([a], [b]) => a.localeCompare(b)));

beforeEach(() => store.clear());

describe("storage migration: retired plan data", () => {
  it("removes the old auth, entitlement and plan keys and leaves every other key byte-identical", async () => {
    for (const [k, v] of Object.entries({ ...OLD, ...KEEP })) store.set(k, v);
    store.set("sites", {});
    store.set("schema", { v: 2 });
    const kept = JSON.stringify(Object.keys(KEEP).map((k) => store.get(k)));
    expect(await migrateStorage()).toBe(true);
    for (const k of Object.keys(OLD)) expect(store.has(k), k).toBe(false);
    expect(JSON.stringify(Object.keys(KEEP).map((k) => store.get(k)))).toBe(kept);
    expect(store.get("schema")).toEqual({ v: STORAGE_VERSION });
  });

  it("running it twice is a no-op", async () => {
    for (const [k, v] of Object.entries({ ...OLD, ...KEEP })) store.set(k, v);
    await migrateStorage();
    const after = snapshot();
    expect(await migrateStorage()).toBe(false);
    expect(snapshot()).toBe(after);
  });

  it("a fresh install only gets the version marker", async () => {
    await migrateStorage();
    expect([...store.keys()].sort()).toEqual(["schema", "sites"]);
    expect(store.get("schema")).toEqual({ v: STORAGE_VERSION });
  });

  it("fresh storage that already has the current version is not touched", async () => {
    store.set("schema", { v: STORAGE_VERSION });
    store.set("settings", KEEP.settings);
    const before = snapshot();
    expect(await migrateStorage()).toBe(false);
    expect(snapshot()).toBe(before);
  });
});
