import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneRequest } from "../src/extension/sceneConfig.ts";
import { toBase64 } from "../src/features/assets/store.ts";
import { defaultPlacement } from "../src/features/assets/types.ts";

const store = vi.hoisted(() => new Map<string, unknown>());
const api = vi.hoisted(() => ({
  storageGet: vi.fn(),
  storageSet: vi.fn(),
}));
vi.mock("../src/extension/api.ts", () => api);

type Slot = typeof globalThis & { skinlyApplier?: unknown; skinlyScene?: { sync(r: SceneRequest | null): Promise<Report>; update(r: SceneRequest | null): Promise<Report>; status(): Report; destroy(): void } | undefined; skinlyOnApplied?: ((s: unknown) => void) | undefined };
interface Report {
  gutters: string;
  scene: string;
  asset: string;
}
const slot = globalThis as Slot;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4];
const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10];
const asset = {
  id: "0a1b2c3d",
  kind: "image",
  mime: "image/png",
  name: "Pic",
  w: 20,
  h: 10,
  data: toBase64(new Uint8Array(PNG)),
  poster: toBase64(new Uint8Array(JPG)),
  posterMime: "image/jpeg",
};

const scene = (over: Partial<NonNullable<SceneRequest["scene"]>> = {}): NonNullable<SceneRequest["scene"]> => ({ sceneId: "calm", density: "normal", lane: "both", accent: "#2f6fdb", ...over });
const hostEls = () => Array.from(document.querySelectorAll("[data-skinly-scene]"));

let hooks: Array<() => void>;
let wide = false;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = '<p id="c">content</p>';
  hooks = [];
  wide = false;
  store.clear();
  // pictures are a Plus feature (B4); these cases run as a Plus user, the Free case is below
  store.set("plan", { v: 1, plan: "plus", until: Number.MAX_SAFE_INTEGER });
  api.storageGet.mockImplementation(async (k: string) => store.get(k));
  api.storageSet.mockImplementation(async (k: string, v: unknown) => void store.set(k, v));
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(1200);
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const r = this.id === "c" ? (wide ? { x: 0, w: 1200 } : { x: 300, w: 600 }) : { x: 0, w: 0 };
    return { x: r.x, y: 0, left: r.x, top: 0, width: r.w, height: r.w ? 40 : 0, right: r.x + r.w, bottom: 40 } as DOMRect;
  });
  slot.skinlyApplier = { onRestore: (fn: () => void) => void hooks.push(fn), isActive: () => false };
  slot.skinlyScene = undefined;
  slot.skinlyOnApplied = undefined;
  await import("../src/extension/scene.ts");
});

afterEach(() => {
  slot.skinlyScene?.destroy();
  document.documentElement.querySelectorAll("[data-skinly-scene]").forEach((n) => n.remove());
  document.body.replaceChildren();
  slot.skinlyApplier = undefined;
  slot.skinlyScene = undefined;
  slot.skinlyOnApplied = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("scene.js page script", () => {
  it("registers itself once, only where an applier exists", async () => {
    expect(slot.skinlyScene).toBeDefined();
    const first = slot.skinlyScene;
    await import("../src/extension/scene.ts");
    expect(slot.skinlyScene).toBe(first);
    expect(hooks).toHaveLength(1);
    vi.resetModules();
    slot.skinlyApplier = undefined;
    slot.skinlyScene = undefined;
    await import("../src/extension/scene.ts");
    expect(slot.skinlyScene).toBeUndefined();
  });

  it("shows the scene in the free gutters and reports it", async () => {
    const r = await slot.skinlyScene!.sync({ scene: scene(), asset: null, fallback: null });
    expect(r).toEqual({ gutters: "ok", scene: "shown", asset: "none" });
    expect(hostEls()).toHaveLength(1);
    expect(hostEls()[0]!.shadowRoot!.querySelectorAll(".lane")).toHaveLength(2);
  });

  it("uses one small corner strip when the page uses the full width", async () => {
    wide = true;
    const r = await slot.skinlyScene!.sync({ scene: scene(), asset: null, fallback: null });
    expect(r).toEqual({ gutters: "none", scene: "corner", asset: "none" });
    expect(hostEls()).toHaveLength(1);
    const lane = hostEls()[0]!.shadowRoot!.querySelector(".lane") as HTMLElement;
    expect(lane.getAttribute("data-lane")).toBe("corner");
    expect(parseFloat(lane.style.width)).toBeLessThanOrEqual(120);
    expect(parseFloat(lane.style.height)).toBeLessThanOrEqual(160);
    expect(lane.querySelectorAll(".actor").length).toBeGreaterThan(0);
    expect(lane.querySelectorAll(".actor").length).toBeLessThanOrEqual(2);
  });

  it("Restore (the applier rollback hook) removes everything and the script can be installed again", async () => {
    await slot.skinlyScene!.sync({ scene: scene(), asset: null, fallback: null });
    expect(hostEls()).toHaveLength(1);
    hooks.forEach((h) => h());
    expect(hostEls()).toHaveLength(0);
    expect(slot.skinlyScene).toBeUndefined();
  });

  it("update never brings art back, but changes art that is showing", async () => {
    const before = await slot.skinlyScene!.update({ scene: scene(), asset: null, fallback: null });
    expect(before.scene).toBe("none");
    expect(hostEls()).toHaveLength(0);
    await slot.skinlyScene!.sync({ scene: scene({ lane: "both" }), asset: null, fallback: null });
    await slot.skinlyScene!.update({ scene: scene({ lane: "left" }), asset: null, fallback: null });
    expect(hostEls()[0]!.shadowRoot!.querySelectorAll(".lane")).toHaveLength(1);
    await slot.skinlyScene!.update(null);
    expect(hostEls()).toHaveLength(0);
  });

  it("a saved picture is read from storage, checked again, and shown", async () => {
    store.set("assets", [asset]);
    const r = await slot.skinlyScene!.sync({ scene: null, asset: { ...defaultPlacement(), assetId: "0a1b2c3d" }, fallback: null });
    expect(r.asset).toBe("shown");
    expect(document.querySelector('[data-skinly-scene="asset"]')).not.toBeNull();
  });

  it("My assets is free: a leftover free plan flag in storage does not hide a saved picture; the scene shows too", async () => {
    store.set("plan", { v: 1, plan: "free", until: 0 });
    store.set("assets", [asset]);
    const r = await slot.skinlyScene!.sync({ scene: scene(), asset: { ...defaultPlacement(), assetId: "0a1b2c3d" }, fallback: null });
    expect(r.asset).toBe("shown");
    expect(r.scene).toBe("shown");
    expect(document.querySelector('[data-skinly-scene="asset"]')).not.toBeNull();
    expect(store.get("assets")).toEqual([asset]);
  });

  it("a deleted or corrupt picture is reported missing and nothing breaks", async () => {
    store.set("assets", [{ ...asset, mime: "image/jpeg" }]);
    const r = await slot.skinlyScene!.sync({ scene: scene(), asset: { ...defaultPlacement(), assetId: "0a1b2c3d" }, fallback: null });
    expect(r.asset).toBe("missing");
    expect(r.scene).toBe("shown");
    expect(document.querySelector('[data-skinly-scene="asset"]')).toBeNull();
  });

  it("when the page blocks the picture and its still, the theme's own scene is shown instead", async () => {
    store.set("assets", [asset]);
    // no createImageBitmap in jsdom: the still picture cannot be decoded either
    const r = await slot.skinlyScene!.sync({ scene: null, asset: { ...defaultPlacement(), assetId: "0a1b2c3d" }, fallback: scene({ sceneId: "paper" }) });
    expect(r.asset).toBe("shown");
    const img = document.querySelector('[data-skinly-scene="asset"]')!.shadowRoot!.querySelector("img")!;
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined });
    img.dispatchEvent(new Event("error"));
    await new Promise((res) => setTimeout(res, 5));
    expect(slot.skinlyScene!.status().asset).toBe("failed");
    expect(slot.skinlyScene!.status().scene).toBe("shown");
    expect(hostEls().some((h) => h.getAttribute("data-skinly-scene") === "")).toBe(true);
  });

  it("the auto script hook restores the art of a site: the scene follows the stored plan's theme, not a saved scene id", async () => {
    expect(typeof slot.skinlyOnApplied).toBe("function");
    const { requestFromSite } = await import("../src/extension/scene.ts");
    const site = {
      v: 1,
      plan: { v: 1, themeId: "ocean", tokens: { accent: "#0a7ea4" }, regionRules: [], reasons: [] },
      fingerprint: { hash: "0123abcd", seq: "h" },
      provider: "groq",
      model: "m",
      promptVersion: "3",
      savedAt: new Date().toISOString(),
      mode: "auto" as const,
      blur: [],
      blurImages: false,
      look: { scene: { id: "ocean" as const, density: "high" as const, lane: "right" as const } },
    };
    expect(requestFromSite(site as never)).toEqual({ scene: { sceneId: "ocean", density: "normal", lane: "both", accent: "#0a7ea4" }, asset: null, fallback: null });
    // a site kept without a look still shows the theme's art while Show art is on; kept with art off, it shows none
    expect(requestFromSite({ ...site, look: undefined } as never)!.scene!.sceneId).toBe("ocean");
    expect(requestFromSite({ ...site, look: { art: false } } as never)).toBeNull();
    slot.skinlyOnApplied!(site);
    await new Promise((res) => setTimeout(res, 5));
    expect(hostEls()).toHaveLength(1);
    expect(hostEls()[0]!.shadowRoot!.querySelectorAll(".lane").length).toBeGreaterThan(0);
  });
});
