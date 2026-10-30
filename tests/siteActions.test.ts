import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, unknown>());
const api = vi.hoisted(() => ({
  storageGet: vi.fn(async (k: string) => store.get(k)),
  storageSet: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
  requestOrigins: vi.fn(),
  removeOrigins: vi.fn(),
  registerAutoScript: vi.fn(),
  unregisterAutoScript: vi.fn(),
  setBadge: vi.fn(),
}));
vi.mock("../src/extension/api.ts", () => api);

import { APPLIER_SCRIPT_FILE, AUTO_SCRIPT_FILE, enableAuto, forgetAll, forgetSite, matchFor, pauseSite, rememberSite, scriptId, type KeptPlan } from "../src/extension/siteActions.ts";
import { getSite, loadSites } from "../src/extension/sites.ts";
import { planFor } from "./plan/helpers.ts";

const kept = (): KeptPlan => ({ plan: planFor("ocean"), fingerprint: { hash: "0123abcd", seq: "hnm" }, provider: "gemini", model: "m-1" });
const A = "https://a.example";

describe("site actions", () => {
  beforeEach(() => {
    store.clear();
    Object.values(api).forEach((f) => f.mockClear());
    api.requestOrigins.mockResolvedValue(true);
    api.removeOrigins.mockResolvedValue(true);
  });

  it("Remember saves mode ask and asks for no permission and registers no script", async () => {
    expect(await rememberSite(A, kept())).toEqual({ ok: true });
    expect((await getSite(A))!.mode).toBe("ask");
    expect(api.requestOrigins).not.toHaveBeenCalled();
    expect(api.registerAutoScript).not.toHaveBeenCalled();
  });

  it("Remember refuses a page URL", async () => {
    expect(await rememberSite("https://a.example/page?x=1", kept())).toEqual({ ok: false, reason: "bad-origin" });
    expect(await loadSites()).toEqual({});
  });

  it("Always on requests only the active origin, saves auto, registers one script and sets the badge", async () => {
    expect(await enableAuto(A, kept(), 5)).toEqual({ ok: true });
    expect(api.requestOrigins).toHaveBeenCalledTimes(1);
    expect(api.requestOrigins).toHaveBeenCalledWith([`${A}/*`]);
    expect((await getSite(A))!.mode).toBe("auto");
    expect(api.registerAutoScript).toHaveBeenCalledWith(scriptId(A), [`${A}/*`], [APPLIER_SCRIPT_FILE, AUTO_SCRIPT_FILE]);
    expect(api.setBadge).toHaveBeenCalledWith(5, "ON");
  });

  it("never requests or registers a wildcard or a non-origin", async () => {
    await enableAuto("https://*", kept());
    await enableAuto("<all_urls>", kept());
    await enableAuto("https://a.example/x", kept());
    expect(api.requestOrigins).not.toHaveBeenCalled();
    expect(api.registerAutoScript).not.toHaveBeenCalled();
    for (const o of ["https://a.example", "http://localhost:3000"]) expect(matchFor(o)).toEqual([`${o}/*`]);
  });

  it("a declined permission saves nothing and registers nothing", async () => {
    api.requestOrigins.mockResolvedValue(false);
    expect(await enableAuto(A, kept())).toEqual({ ok: false, reason: "permission" });
    expect(await loadSites()).toEqual({});
    expect(api.registerAutoScript).not.toHaveBeenCalled();
  });

  it("Always on without a plan or record does nothing useful", async () => {
    expect(await enableAuto(A, undefined)).toEqual({ ok: false, reason: "no-record" });
    expect(api.registerAutoScript).not.toHaveBeenCalled();
  });

  it("script ids differ per origin", () => {
    expect(scriptId(A)).not.toBe(scriptId("https://b.example"));
    expect(scriptId(A)).toMatch(/^skinly-[0-9a-f]{8}$/);
  });

  it("Pause sets mode ask and unregisters the script but keeps the record", async () => {
    await enableAuto(A, kept());
    expect(await pauseSite(A)).toEqual({ ok: true });
    expect((await getSite(A))!.mode).toBe("ask");
    expect(api.unregisterAutoScript).toHaveBeenLastCalledWith(scriptId(A));
  });

  it("Forget unregisters the script, removes the permission and deletes the record", async () => {
    await enableAuto(A, kept(), 3);
    api.unregisterAutoScript.mockClear();
    expect(await forgetSite(A, 3)).toEqual({ ok: true });
    expect(api.unregisterAutoScript).toHaveBeenCalledWith(scriptId(A));
    expect(api.removeOrigins).toHaveBeenCalledWith([`${A}/*`]);
    expect(await getSite(A)).toBeUndefined();
    expect(api.setBadge).toHaveBeenLastCalledWith(3, "");
  });

  it("Forget survives a permission that was never granted", async () => {
    api.removeOrigins.mockRejectedValue(new Error("no"));
    await rememberSite(A, kept());
    expect(await forgetSite(A)).toEqual({ ok: true });
    expect(await getSite(A)).toBeUndefined();
  });

  it("Forget never removes a provider host permission", async () => {
    await forgetSite("https://generativelanguage.googleapis.com");
    expect(api.removeOrigins).not.toHaveBeenCalled();
  });

  it("Forget all clears every site, script and permission", async () => {
    await enableAuto(A, kept());
    await enableAuto("https://b.example", kept());
    await forgetAll();
    expect(await loadSites()).toEqual({});
    expect(api.removeOrigins).toHaveBeenCalledTimes(2);
  });
});
