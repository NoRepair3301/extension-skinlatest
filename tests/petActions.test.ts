import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ queryActiveTab: vi.fn(), injectFile: vi.fn(), runInPage: vi.fn(), storageGet: vi.fn(), storageSet: vi.fn() }));
vi.mock("../src/extension/api.ts", () => api);

import { PET_WHY, showPetHere } from "../src/extension/petActions.ts";

const settings = (pet: Record<string, unknown> = {}, blocklist: string[] = []) => ({ theme: "calm-light", blocklist, pet: { enabled: true, kind: "pebble", size: "medium", corner: "bottom-right", disabledOrigins: [], ...pet } });

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.storageGet.mockResolvedValue(settings());
  api.queryActiveTab.mockResolvedValue({ id: 4, url: "https://example.org/a" });
  api.injectFile.mockResolvedValue(undefined);
  api.runInPage.mockResolvedValue(true);
});

describe("showPetHere", () => {
  it("injects the page script and shows the pet when the pet is on and the page is allowed", async () => {
    expect(await showPetHere()).toEqual({ ok: true });
    expect(api.injectFile).toHaveBeenCalledWith(4, "applier.js");
    expect(api.runInPage).toHaveBeenCalledWith(4, "syncPet", expect.objectContaining({ enabled: true }));
  });

  it("does nothing, and injects nothing, when the pet is off", async () => {
    api.storageGet.mockResolvedValue(settings({ enabled: false }));
    expect(await showPetHere()).toEqual({ ok: false, why: PET_WHY.off });
    expect(api.injectFile).not.toHaveBeenCalled();
    expect(api.runInPage).not.toHaveBeenCalled();
  });

  it.each(["chrome://extensions", "https://chromewebstore.google.com/x", "https://example.org/a.pdf", "about:blank", "file:///a.html"])("never injects into %s", async (url) => {
    api.queryActiveTab.mockResolvedValue({ id: 4, url });
    expect(await showPetHere()).toEqual({ ok: false, why: PET_WHY.blocked });
    expect(api.injectFile).not.toHaveBeenCalled();
  });

  it("honours the user blocklist and the per-site switch", async () => {
    api.storageGet.mockResolvedValue(settings({}, ["example.org"]));
    expect(await showPetHere()).toEqual({ ok: false, why: PET_WHY.blocked });
    api.storageGet.mockResolvedValue(settings({ disabledOrigins: ["https://example.org"] }));
    expect(await showPetHere()).toEqual({ ok: false, why: PET_WHY.siteOff });
    expect(api.injectFile).not.toHaveBeenCalled();
  });

  it("says so when there is no page, the browser refuses the injection, or the page script does not show it", async () => {
    api.queryActiveTab.mockResolvedValue(undefined);
    expect(await showPetHere()).toEqual({ ok: false, why: PET_WHY.noTab });
    api.queryActiveTab.mockResolvedValue({ id: 4, url: "https://example.org/a" });
    api.injectFile.mockRejectedValue(new Error("no"));
    expect(await showPetHere()).toEqual({ ok: false, why: PET_WHY.denied });
    api.injectFile.mockResolvedValue(undefined);
    api.runInPage.mockResolvedValue(false);
    expect(await showPetHere()).toEqual({ ok: false, why: PET_WHY.notShown });
    api.runInPage.mockRejectedValue(new Error("x"));
    expect(await showPetHere()).toEqual({ ok: false, why: PET_WHY.denied });
  });

  it("every reason is one short line", () => {
    for (const why of Object.values(PET_WHY)) {
      expect(why).not.toContain("\n");
      expect(why.length).toBeLessThan(80);
    }
  });
});
