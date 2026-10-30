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
  hasOrigins: vi.fn(async (_m: string[]) => true),
}));
vi.mock("../src/extension/api.ts", () => api);

import { effectiveScene, lookFor, sceneRequest, siteRequest, sourceForPlan, sourceForTheme } from "../src/extension/sceneConfig.ts";
import { petFor } from "../src/extension/applier-auto.ts";
import { APPLIER_SCRIPT_FILE, AUTO_SCRIPT_FILE, SCENE_SCRIPT_FILE, enableAuto, hasArt, refreshAutoScripts, rememberSite, scriptId, type KeptPlan } from "../src/extension/siteActions.ts";
import { defaultSettings, type Settings } from "../src/extension/settings.ts";
import { getSite, parseLook, parseSite } from "../src/extension/sites.ts";
import { planFor } from "./plan/helpers.ts";

const settings = (over: Partial<Settings> = {}): Settings => ({ ...defaultSettings(), ...over });
const A = "https://a.example";
const kept = (look?: KeptPlan["look"]): KeptPlan => ({ plan: planFor("ocean"), fingerprint: { hash: "0123abcd", seq: "hnm" }, provider: "gemini", model: "m-1", look });

describe("effectiveScene", () => {
  const s = defaultSettings().scene;
  it("follows the theme: calm-light calm, midnight space, ocean ocean, warm-paper paper, field field", () => {
    expect(effectiveScene(s, "calm-light")).toBe("calm");
    expect(effectiveScene(s, "midnight")).toBe("space");
    expect(effectiveScene(s, "ocean")).toBe("ocean");
    expect(effectiveScene(s, "warm-paper")).toBe("paper");
    expect(effectiveScene(s, "field")).toBe("field");
    expect(effectiveScene(s, "custom")).toBe("none");
  });
  it("auto shows calm in light and midnight stars in dark", () => {
    expect(effectiveScene(s, "calm-light", true, false)).toBe("calm");
    expect(effectiveScene(s, "midnight", true, true)).toBe("midnight-stars");
    expect(sceneRequest(settings(), sourceForTheme("auto", true))!.scene!.sceneId).toBe("midnight-stars");
    expect(sceneRequest(settings(), sourceForTheme("auto", false))!.scene!.sceneId).toBe("calm");
  });
  it("off means none, and high contrast never shows a scene", () => {
    expect(effectiveScene({ ...s, enabled: false }, "ocean")).toBe("none");
    expect(effectiveScene(s, "high-contrast")).toBe("none");
  });
});

describe("sceneRequest and lookFor", () => {
  const src = sourceForTheme("ocean", false);
  it("builds the request from the theme, with the accent and the chosen density and lanes", () => {
    const st = settings({ scene: { enabled: true, choice: "theme", density: "high", lane: "left" } });
    expect(sceneRequest(st, src)).toEqual({ scene: { sceneId: "ocean", density: "high", lane: "left", accent: "#0a7ea4" }, asset: null, fallback: null });
  });
  it("is null when everything is off, and Auto resolves with the colour scheme", () => {
    expect(sceneRequest(settings({ scene: { ...defaultSettings().scene, enabled: false } }), src)).toBeNull();
    expect(sourceForTheme("auto", true).themeId).toBe("midnight");
    expect(sourceForTheme("auto", false).themeId).toBe("calm-light");
  });
  it("a chosen asset is included, with the theme's scene as the fallback when the scene is off; none under high contrast", () => {
    const st = settings({ scene: { ...defaultSettings().scene, enabled: false }, asset: { ...defaultSettings().asset, assetId: "0a1b2c3d" } });
    const r = sceneRequest(st, src)!;
    expect(r.scene).toBeNull();
    expect(r.asset!.assetId).toBe("0a1b2c3d");
    expect(r.fallback!.sceneId).toBe("ocean");
    expect(sceneRequest(st, sourceForTheme("high-contrast", false))).toBeNull();
  });
  it("lookFor saves art on (never a scene id), the pet look when the pet is on, and the asset", () => {
    expect(lookFor(settings(), src)).toEqual({ art: true });
    const st = settings({ pet: { ...defaultSettings().pet, enabled: true, kind: "owl", motion: "horizontal" }, asset: { ...defaultSettings().asset, assetId: "0a1b2c3d" } });
    const look = lookFor(st, src)!;
    expect(look.pet).toMatchObject({ kind: "owl", motion: "horizontal" });
    expect(look.pet).not.toHaveProperty("enabled");
    expect(look.pet).not.toHaveProperty("disabledOrigins");
    expect(look.asset!.assetId).toBe("0a1b2c3d");
    expect(lookFor(settings({ scene: { ...defaultSettings().scene, enabled: false } }), src)).toBeUndefined();
  });
});

describe("art follows the stored plan (stage 1a)", () => {
  it("a built-in plan brings its theme's scene; an AI plan follows its own page colour", () => {
    expect(sourceForPlan(planFor("ocean"))).toEqual({ themeId: "ocean", accent: planFor("ocean").tokens.accent });
    const dark = { ...planFor("midnight"), themeId: "custom" as const };
    const light = { ...planFor("calm-light"), themeId: "custom" as const };
    expect(sceneRequest(settings(), sourceForPlan(dark))!.scene!.sceneId).toBe("midnight-stars");
    expect(sceneRequest(settings(), sourceForPlan(light))!.scene!.sceneId).toBe("calm");
    expect(lookFor(settings(), sourceForPlan(dark))).toEqual({ art: true });
  });
  it("siteRequest: the switch and a saved art off both turn the scene off; an older saved scene id is ignored for the choice", () => {
    const plan = planFor("ocean");
    expect(siteRequest(settings(), { plan, look: { scene: { id: "space", density: "low", lane: "left" }, art: true } })!.scene!.sceneId).toBe("ocean");
    expect(siteRequest(settings(), { plan })!.scene!.sceneId).toBe("ocean");
    expect(siteRequest(settings(), { plan, look: { art: false } })).toBeNull();
    expect(siteRequest(settings({ scene: { ...defaultSettings().scene, enabled: false } }), { plan, look: { art: true } })).toBeNull();
    expect(siteRequest(settings(), { plan: planFor("high-contrast"), look: { art: true } })).toBeNull();
  });
  it("refreshAutoScripts re-registers the auto files for kept sites whose permission is still granted", async () => {
    store.clear();
    api.registerAutoScript.mockClear();
    const rec = (mode: string) => ({ v: 1, plan: planFor("ocean"), fingerprint: { hash: "0123abcd", seq: "h" }, provider: "builtin", model: "builtin", promptVersion: "5", savedAt: "2026-10-30T10:00:00.000Z", mode, blur: [], blurImages: false });
    store.set("sites", { "https://a.example": rec("auto"), "https://b.example": rec("ask"), "https://c.example": rec("auto") });
    api.hasOrigins.mockImplementation(async (m: string[]) => m[0] !== "https://c.example/*");
    expect(await refreshAutoScripts()).toBe(1);
    expect(api.registerAutoScript).toHaveBeenCalledTimes(1);
    expect(api.registerAutoScript).toHaveBeenCalledWith(scriptId("https://a.example"), ["https://a.example/*"], [APPLIER_SCRIPT_FILE, AUTO_SCRIPT_FILE, SCENE_SCRIPT_FILE]);
    api.hasOrigins.mockImplementation(async () => true);
  });
});

describe("site record look", () => {
  const record = (look: unknown) => ({
    v: 1,
    plan: planFor("ocean"),
    fingerprint: { hash: "0123abcd", seq: "hnm" },
    provider: "gemini",
    model: "m-1",
    promptVersion: "3",
    savedAt: new Date().toISOString(),
    mode: "auto",
    blur: [],
    blurImages: false,
    ...(look === undefined ? {} : { look }),
  });
  it("old records without a look still load", () => {
    expect(parseSite(record(undefined))!.look).toBeUndefined();
  });
  it("reads a valid look and drops every unknown or invalid part", () => {
    const good = parseLook({
      scene: { id: "space", density: "low", lane: "left" },
      pet: { kind: "cat", motion: "vertical", speed: "fast", edge: "nope", extra: 1 },
      asset: { assetId: "0a1b2c3d", mode: "cover", size: "L", opacity: 40, speed: "slow", preset: "spin" },
    })!;
    expect(good.scene).toEqual({ id: "space", density: "low", lane: "left" });
    expect(good.pet).toMatchObject({ kind: "cat", motion: "vertical", speed: "fast", edge: "bottom" });
    expect(good.pet).not.toHaveProperty("extra");
    expect(good.asset).toMatchObject({ assetId: "0a1b2c3d", mode: "cover", opacity: 40 });
    expect(parseLook({ scene: { id: "none", density: "low", lane: "left" } })).toBeUndefined();
    expect(parseLook({ scene: { id: "tank", density: "low", lane: "left" }, asset: { assetId: "../x" } })).toBeUndefined();
    expect(parseLook("x")).toBeUndefined();
    expect(parseLook(null)).toBeUndefined();
    expect(parseSite(record({ scene: { id: "space", density: "low", lane: "left" } }))!.look!.scene!.id).toBe("space");
    expect(parseSite(record({ scene: { id: "<script>", density: "low", lane: "left" } }))!.look).toBeUndefined();
  });
  it("the saved pet look wins over the global pet, and means the user wanted the pet there", () => {
    const g = { ...defaultSettings().pet, enabled: false };
    const site = parseSite(record({ pet: { kind: "bunny", motion: "horizontal" } }))!;
    expect(petFor(g, site)).toMatchObject({ enabled: true, kind: "bunny", motion: "horizontal" });
    expect(petFor(g, parseSite(record(undefined))!)).toBe(g);
  });
});

describe("site actions and scene.js registration", () => {
  beforeEach(() => {
    store.clear();
    Object.values(api).forEach((f) => f.mockClear());
    api.requestOrigins.mockResolvedValue(true);
    api.removeOrigins.mockResolvedValue(true);
  });
  const withScene = { scene: { id: "ocean" as const, density: "normal" as const, lane: "both" as const } };

  it("Remember saves the look; the script is not registered", async () => {
    await rememberSite(A, kept(withScene));
    // an older saved scene id counts as art on
    expect((await getSite(A))!.look).toEqual({ ...withScene, art: true });
    expect(api.registerAutoScript).not.toHaveBeenCalled();
  });
  it("a site with saved art gets scene.js after the auto script", async () => {
    await enableAuto(A, kept(withScene), 5);
    expect(api.registerAutoScript).toHaveBeenCalledWith(scriptId(A), [`${A}/*`], [APPLIER_SCRIPT_FILE, AUTO_SCRIPT_FILE, SCENE_SCRIPT_FILE]);
  });
  it("a site with no saved art still gets scene.js: it reads the Show art switch itself after a reload", async () => {
    await enableAuto(A, kept(), 5);
    expect(api.registerAutoScript).toHaveBeenCalledWith(scriptId(A), [`${A}/*`], [APPLIER_SCRIPT_FILE, AUTO_SCRIPT_FILE, SCENE_SCRIPT_FILE]);
    expect(hasArt(undefined)).toBe(false);
    expect(hasArt({ pet: { kind: "fox", size: "medium", corner: "bottom-right", motion: "still", direction: "bounce", edge: "bottom", speed: "normal", sleepWhenIdle: false, keepInFreeSpace: true, edgeFallback: true } })).toBe(false);
    expect(hasArt(withScene)).toBe(true);
  });
  it("keeping a plan without a look does not erase the look saved earlier", async () => {
    await rememberSite(A, kept(withScene));
    await rememberSite(A, kept());
    expect((await getSite(A))!.look).toEqual({ ...withScene, art: true });
  });
});
