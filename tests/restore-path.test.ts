import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F2 (S5.3): the one Restore path (src/extension/restore.ts) that the popup button and the Restore shortcut both run. api.ts is
 * mocked; the site store is the real code on an in-memory storage.
 */
const store = vi.hoisted(() => new Map<string, unknown>());
const api = vi.hoisted(() => ({
  runInPage: vi.fn(),
  injectFile: vi.fn(),
  setBadge: vi.fn(),
  storageGet: vi.fn(),
  storageSet: vi.fn(),
  storageRemove: vi.fn(),
  unregisterAutoScript: vi.fn(),
  registerAutoScript: vi.fn(),
  registeredScripts: vi.fn(),
  hasOrigins: vi.fn(),
  removeOrigins: vi.fn(),
  injectFiles: vi.fn(),
}));
vi.mock("../src/extension/api.ts", () => api);

import { hasSomethingToRestore, restorePage } from "../src/extension/restore.ts";
import { planFor } from "./plan/helpers.ts";

const URL_OK = "https://example.org/a";
const ORIGIN = "https://example.org";
const record = (extra: object = {}) => ({ v: 1, plan: planFor("ocean"), fingerprint: { hash: "0123abcd", seq: "hnm" }, provider: "builtin", model: "builtin", promptVersion: "6", savedAt: "2026-11-05T10:00:00.000Z", mode: "auto", blur: [], blurImages: false, ...extra });
const sites = () => store.get("sites") as Record<string, { paused?: boolean }> | undefined;

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  store.clear();
  api.storageGet.mockImplementation(async (k: string) => store.get(k));
  api.storageSet.mockImplementation(async (k: string, v: unknown) => void store.set(k, v));
  api.storageRemove.mockImplementation(async (k: string) => void store.delete(k));
  api.setBadge.mockResolvedValue(undefined);
  api.injectFile.mockResolvedValue(undefined);
  api.unregisterAutoScript.mockResolvedValue(undefined);
  api.runInPage.mockImplementation(async (_t: number, m: string) => (m === "restore" ? { ok: true } : undefined));
});

describe("restorePage: one path for the button and the shortcut", () => {
  it("injects the applier in all frames, restores in all frames, clears the badge", async () => {
    const r = await restorePage(7, URL_OK, []);
    expect(r).toEqual({ ok: true, paused: false });
    expect(api.injectFile).toHaveBeenCalledWith(7, "applier.js", true);
    expect(api.runInPage).toHaveBeenCalledWith(7, "restore", undefined, true);
    expect(api.setBadge).toHaveBeenCalledWith(7, "");
    expect(api.injectFile.mock.invocationCallOrder[0]).toBeLessThan(api.runInPage.mock.invocationCallOrder[0]!);
  });

  it("pauses a remembered site that is on, and unregisters it; permission is not touched", async () => {
    store.set("sites", { [ORIGIN]: record() });
    const r = await restorePage(7, URL_OK, []);
    expect(r).toEqual({ ok: true, paused: true });
    expect(sites()![ORIGIN]!.paused).toBe(true);
    expect(api.unregisterAutoScript).toHaveBeenCalledTimes(1);
    expect(api.removeOrigins).not.toHaveBeenCalled();
  });

  it("restoring twice is harmless: the second run finds the site paused and does not pause again", async () => {
    store.set("sites", { [ORIGIN]: record() });
    await restorePage(7, URL_OK, []);
    const second = await restorePage(7, URL_OK, []);
    expect(second).toEqual({ ok: true, paused: false });
    expect(api.unregisterAutoScript).toHaveBeenCalledTimes(1);
    expect(sites()![ORIGIN]!.paused).toBe(true);
  });

  it("leaves a site without a record alone (nothing is created)", async () => {
    await restorePage(7, URL_OK, []);
    expect(store.get("sites")).toBeUndefined();
  });

  it("a blocked page is never injected into, but anything we added is still taken away; the caller is told it is blocked", async () => {
    const r = await restorePage(7, "https://blocked.test/x", ["blocked.test"]);
    expect(r).toEqual({ ok: false, reason: "blocked" });
    expect(api.injectFile).not.toHaveBeenCalled();
    expect(api.runInPage).toHaveBeenCalledWith(7, "restore", undefined, true);
    expect(api.setBadge).toHaveBeenCalledWith(7, "");
  });

  it("a page the browser will not let us into (chrome://) reports blocked, never an exception", async () => {
    api.runInPage.mockRejectedValue(new Error("Cannot access"));
    expect(await restorePage(7, "chrome://extensions", [])).toEqual({ ok: false, reason: "blocked" });
  });

  it("injection refused and no applier there: failed, nothing paused, badge untouched (never a half-restored state)", async () => {
    store.set("sites", { [ORIGIN]: record() });
    api.injectFile.mockRejectedValue(new Error("refused"));
    api.runInPage.mockResolvedValue(undefined); // ensureApplier asks isActive: nobody answers
    expect(await restorePage(7, URL_OK, [])).toEqual({ ok: false, reason: "failed" });
    expect(sites()![ORIGIN]!.paused).toBeUndefined();
    expect(api.setBadge).not.toHaveBeenCalled();
    expect(api.runInPage).not.toHaveBeenCalledWith(7, "restore", undefined, true);
  });

  it("injection refused but an applier is already there: restores through it", async () => {
    api.injectFile.mockRejectedValue(new Error("refused"));
    api.runInPage.mockImplementation(async (_t: number, m: string) => (m === "isActive" ? true : m === "restore" ? { ok: true } : undefined));
    expect(await restorePage(7, URL_OK, [])).toEqual({ ok: true, paused: false });
  });

  it("the page script did not answer the restore: failed, and the site is not paused", async () => {
    store.set("sites", { [ORIGIN]: record() });
    api.runInPage.mockResolvedValue(undefined);
    expect(await restorePage(7, URL_OK, [])).toEqual({ ok: false, reason: "failed" });
    expect(sites()![ORIGIN]!.paused).toBeUndefined();
    expect(api.unregisterAutoScript).not.toHaveBeenCalled();
  });

  it("the restore call throwing on an allowed page is a failure, not a thrown error", async () => {
    api.runInPage.mockRejectedValue(new Error("tab closed"));
    expect(await restorePage(7, URL_OK, [])).toEqual({ ok: false, reason: "failed" });
  });

  it("a failing pause does not undo the restore", async () => {
    store.set("sites", { [ORIGIN]: record() });
    api.unregisterAutoScript.mockRejectedValue(new Error("x"));
    expect((await restorePage(7, URL_OK, [])).ok).toBe(true);
  });
});

describe("hasSomethingToRestore: when the Restore button is enabled", () => {
  it("true when the page reports an engine or its marks", async () => {
    api.runInPage.mockResolvedValue(true);
    expect(await hasSomethingToRestore(7, URL_OK)).toBe(true);
    expect(api.runInPage).toHaveBeenCalledWith(7, "canRestore", undefined, true);
  });

  it("false for an untouched page with no record", async () => {
    api.runInPage.mockResolvedValue(false);
    expect(await hasSomethingToRestore(7, URL_OK)).toBe(false);
  });

  it("true for a remembered site that is on, even when the page shows nothing; false once it is paused", async () => {
    api.runInPage.mockResolvedValue(false);
    store.set("sites", { [ORIGIN]: record() });
    expect(await hasSomethingToRestore(7, URL_OK)).toBe(true);
    store.set("sites", { [ORIGIN]: record({ paused: true }) });
    expect(await hasSomethingToRestore(7, URL_OK)).toBe(false);
  });

  it("an ineligible page (the page cannot be asked) with no record is false, not an error", async () => {
    api.runInPage.mockRejectedValue(new Error("Cannot access"));
    expect(await hasSomethingToRestore(7, "chrome://extensions")).toBe(false);
  });
});
