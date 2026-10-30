import { readdirSync, readFileSync, statSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, unknown>());
const api = vi.hoisted(() => ({
  storageGet: vi.fn(async (k: string) => store.get(k)),
  storageSet: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
  injectFile: vi.fn(),
  runScene: vi.fn(),
  runInPage: vi.fn(),
}));
vi.mock("../src/extension/api.ts", () => api);

import { saveAssetForSite, useAssetHere } from "../src/extension/assetActions.ts";
import { rememberSite } from "../src/extension/siteActions.ts";
import { getSite } from "../src/extension/sites.ts";
import { defaultPlacement } from "../src/features/assets/types.ts";
import { artStatus } from "../src/extension/sceneActions.ts";
import { planFor } from "./plan/helpers.ts";

const A = "https://a.example";
const placement = { ...defaultPlacement(), assetId: "0a1b2c3d", mode: "corner" as const, size: "L" as const, opacity: 60, preset: "orbit" as const, speed: "fast" as const };

beforeEach(() => {
  store.clear();
  Object.values(api).forEach((f) => f.mockReset());
  api.storageGet.mockImplementation(async (k: string) => store.get(k));
  api.storageSet.mockImplementation(async (k: string, v: unknown) => void store.set(k, v));
});

describe("Use on this page", () => {
  it("asks the scene engine for the asset next to the scene that is already showing", async () => {
    api.injectFile.mockResolvedValue(undefined);
    api.runScene.mockResolvedValue({ gutters: "ok", scene: "shown", asset: "shown" });
    const scene = { sceneId: "calm" as const, density: "normal" as const, lane: "both" as const, accent: "#2f6fdb" };
    await useAssetHere(3, placement, scene);
    expect(api.runScene).toHaveBeenCalledWith(3, "sync", { scene, asset: placement, fallback: null });
  });

  it("says the script is not loaded when the page refuses it", async () => {
    api.injectFile.mockRejectedValue(new Error("no"));
    api.runScene.mockResolvedValue(undefined);
    const r = await useAssetHere(3, placement, null);
    expect(r).toBeUndefined();
    expect(artStatus(r, true)).toBe("Scene art is not loaded on this page (the browser did not allow it).");
  });

  it("saves per origin on a remembered site, replaces it, and removes it", async () => {
    expect(await saveAssetForSite(A, placement)).toEqual({ ok: false, reason: "no-record" });
    await rememberSite(A, { plan: planFor("ocean"), fingerprint: { hash: "0123abcd", seq: "hnm" }, provider: "builtin", model: "builtin" });
    expect(await saveAssetForSite(A + "/some/page?q=1", placement)).toEqual({ ok: false, reason: "bad-origin" });
    expect(await saveAssetForSite(A, placement)).toEqual({ ok: true });
    expect((await getSite(A))!.look?.asset).toEqual(placement);
    expect(await saveAssetForSite(A, null)).toEqual({ ok: true });
    expect((await getSite(A))!.look).toBeUndefined();
  });

  it("reports narrow and missing side space in one line each", () => {
    expect(artStatus({ gutters: "narrow", scene: "no-gutter", asset: "none" }, true)).toContain("almost no empty side space");
    expect(artStatus({ gutters: "none", scene: "no-gutter", asset: "none" }, true)).toContain("full width");
    expect(artStatus({ gutters: "ok", scene: "shown", asset: "none" }, true)).toContain("showing");
    expect(artStatus(undefined, false)).toContain("off");
  });
});

describe("assets never reach a provider", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(`${dir}/${n}`).isDirectory() ? files(`${dir}/${n}`) : n.endsWith(".ts") ? [`${dir}/${n}`] : []));
  it("no file that builds or sends a provider request imports assets or the asset store", () => {
    for (const f of [...files("src/providers"), ...files("src/ai"), "src/analyzer/summary.ts", "src/analyzer/analyze.ts"]) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/from\s+["'][^"']*(assets\/|assetStore|assetActions)/);
    }
  });
});
