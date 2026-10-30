import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, unknown>());
const api = vi.hoisted(() => ({
  storageGet: vi.fn(),
  storageSet: vi.fn(),
  sendMessage: vi.fn(),
}));
vi.mock("../src/extension/api.ts", () => api);

interface Slot {
  skinlyApplier?: { applyTheme(id: string): { ok: boolean }; restore(): unknown; isActive(): boolean };
  skinlyScene?: { sync(r: unknown): Promise<{ gutters: string; scene: string; asset: string }>; destroy(): void } | undefined;
  skinlyOnApplied?: unknown;
}
const slot = globalThis as unknown as Slot;

/** Pages as rectangles: data-r is x,y,w,h in the 1200 by 800 window. */
const PAGES = {
  "claude-like": '<aside data-r="0,0,240,800"><a href="#a" data-r="10,10,200,30">New chat</a></aside><main data-r="300,0,600,800"><p data-r="300,20,600,40">Hello</p><div contenteditable="true" data-r="300,700,600,60">typing</div></main>',
  "wiki-like": '<nav><a href="#m" data-r="10,100,160,20">Main page</a></nav><div><h1 data-r="220,20,760,40">Title</h1><p data-r="220,80,760,60">Article text</p></div>',
  "full-width": '<header><a href="#h" data-r="0,0,1200,40">Menu</a></header><p data-r="0,60,1200,600">Everything uses the whole width</p>',
  sidebar: '<nav><a href="#s" data-r="0,0,260,30">Section</a></nav><p data-r="260,0,940,700">Content next to a sidebar</p>',
} as const;
type PageName = keyof typeof PAGES;
const GUTTERED: PageName[] = ["claude-like", "wiki-like"];

const hosts = () => Array.from(document.documentElement.querySelectorAll("[data-skinly-scene]"));
const actors = (): string[] => hosts().flatMap((h) => Array.from(h.shadowRoot!.querySelectorAll(".actor")).map((a) => a.getAttribute("data-actor") ?? ""));
const lanes = (): string[] => hosts().flatMap((h) => Array.from(h.shadowRoot!.querySelectorAll(".lane")).map((l) => l.getAttribute("data-lane") ?? ""));
const tick = () => new Promise<void>((r) => setTimeout(r, 20));

beforeEach(() => {
  vi.resetModules();
  store.clear();
  api.storageGet.mockImplementation(async (k: string) => store.get(k));
  api.storageSet.mockImplementation(async (k: string, v: unknown) => void store.set(k, v));
  api.sendMessage.mockResolvedValue(undefined);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
  // jsdom has no constructable stylesheets
  (window as unknown as { CSSStyleSheet: unknown }).CSSStyleSheet = class {
    replaceSync(): void {}
  };
  const sheets: unknown[] = [];
  Object.defineProperty(document, "adoptedStyleSheets", { configurable: true, get: () => sheets, set: (v: unknown[]) => void sheets.splice(0, sheets.length, ...v) });
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(1200);
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const [x = 0, y = 0, w = 0, h = 0] = (this.getAttribute("data-r") ?? "0,0,0,0").split(",").map(Number);
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) } as DOMRect;
  });
  delete slot.skinlyApplier;
  slot.skinlyScene = undefined;
  slot.skinlyOnApplied = undefined;
});

afterEach(() => {
  slot.skinlyApplier?.restore();
  slot.skinlyScene?.destroy();
  hosts().forEach((n) => n.remove());
  document.body.replaceChildren();
  delete slot.skinlyApplier;
  slot.skinlyScene = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function manual(themeId: "midnight" | "field" | "ocean", page: PageName) {
  document.body.innerHTML = PAGES[page];
  await import("../src/extension/applier.ts");
  expect(slot.skinlyApplier!.applyTheme(themeId)).toMatchObject({ ok: true });
  // what the popup does next: inject scene.js, then ask it to show the request for the theme
  await import("../src/extension/scene.ts");
  const { defaultSettings } = await import("../src/extension/settings.ts");
  const { sceneRequest, sourceForTheme } = await import("../src/extension/sceneConfig.ts");
  const settings = { ...defaultSettings(), scene: { ...defaultSettings().scene, density: "high" as const } };
  const req = sceneRequest(settings, sourceForTheme(themeId, false));
  expect(req).not.toBeNull();
  return slot.skinlyScene!.sync(req);
}

describe("manual path: the real apply flow, then scene.js", () => {
  it.each(Object.keys(PAGES) as PageName[])("%s: the scene host exists with at least one actor", async (page) => {
    const report = await manual("ocean", page);
    expect(hosts()).toHaveLength(1);
    expect(actors().length).toBeGreaterThan(0);
    expect(report.scene).toBe(GUTTERED.includes(page) ? "shown" : "corner");
    expect(lanes().every((l) => (GUTTERED.includes(page) ? l !== "corner" : l === "corner"))).toBe(true);
  });

  it("the host never takes a click: pointer-events none on the host, the lanes and the actors", async () => {
    await manual("ocean", "full-width");
    const host = hosts()[0] as HTMLElement;
    expect(host.style.getPropertyValue("pointer-events")).toBe("none");
    expect(host.shadowRoot!.querySelector("style, [adoptedstylesheets]") !== undefined).toBe(true);
  });

  it("Space shows its stars and planets", async () => {
    await manual("midnight", "claude-like");
    const ids = actors();
    expect(ids).toContain("stars");
    expect(ids.some((id) => /planet|gas-giant/.test(id))).toBe(true);
  });

  it("Field shows the tank, the helicopter and the weapon prop while ARMY_WEAPON_PROPS is true", async () => {
    const { ARMY_WEAPON_PROPS } = await import("../src/config.ts");
    expect(ARMY_WEAPON_PROPS).toBe(true);
    await manual("field", "wiki-like");
    const ids = actors();
    for (const id of ["tank", "helicopter", "rifle-prop"]) expect(ids, id).toContain(id);
  });

  it("Restore removes the host", async () => {
    await manual("ocean", "claude-like");
    expect(hosts()).toHaveLength(1);
    slot.skinlyApplier!.restore();
    expect(hosts()).toHaveLength(0);
  });
});

/** A kept site as siteActions saves it. */
async function keep(plan: unknown, look?: unknown) {
  store.set("sites", {
    [location.origin]: {
      v: 1,
      plan,
      fingerprint: { hash: "0123abcd", seq: "hnm" },
      provider: "builtin",
      model: "builtin",
      promptVersion: "5",
      savedAt: "2026-10-30T10:00:00.000Z",
      mode: "auto",
      blur: [],
      blurImages: false,
      ...(look === undefined ? {} : { look }),
    },
  });
}

/** What the browser does on every page load of a kept site: the three registered files at document_start, in order. */
async function load(page: PageName) {
  document.body.innerHTML = PAGES[page];
  await import("../src/extension/applier.ts");
  await import("../src/extension/scene.ts");
  await import("../src/extension/applier-auto.ts");
  for (let i = 0; i < 4; i++) await tick();
}

/** A reload: the old document and its scripts go away (their hosts with them), then the page loads again from storage. */
async function reload(page: PageName) {
  slot.skinlyApplier?.restore();
  slot.skinlyScene?.destroy();
  document.querySelectorAll("[data-skinly-ui]").forEach((n) => n.remove());
  delete slot.skinlyApplier;
  slot.skinlyScene = undefined;
  slot.skinlyOnApplied = undefined;
  vi.resetModules();
  await load(page);
}

const petHosts = () => Array.from(document.querySelectorAll('[data-skinly-ui="pet"]'));

describe("auto path after a reload: art follows the stored plan's theme, not a saved scene id", () => {
  it.each(Object.keys(PAGES) as PageName[])("%s: a built-in theme kept with art on comes back with its scene, and again after a reload", async (page) => {
    const { themeToPlan } = await import("../src/plan/themeToPlan.ts");
    await keep(themeToPlan("ocean"), { art: true });
    await load(page);
    expect(document.documentElement.getAttribute("data-skinly")).toBe("on");
    expect(hosts()).toHaveLength(1);
    expect(actors().length).toBeGreaterThan(0);
    await reload(page);
    expect(document.documentElement.getAttribute("data-skinly")).toBe("on");
    expect(hosts()).toHaveLength(1);
    expect(actors().length).toBeGreaterThan(0);
  });

  it.each(Object.keys(PAGES) as PageName[])("%s: an AI plan (custom, dark page) kept without any look shows midnight art", async (page) => {
    const { themeToPlan } = await import("../src/plan/themeToPlan.ts");
    await keep({ ...themeToPlan("midnight"), themeId: "custom" });
    await load(page);
    expect(document.documentElement.getAttribute("data-skinly")).toBe("on");
    expect(hosts()).toHaveLength(1);
    expect(actors().length).toBeGreaterThan(0);
  });

  it("the host is the last child of the html element after the page finished parsing", async () => {
    const { themeToPlan } = await import("../src/plan/themeToPlan.ts");
    await keep(themeToPlan("ocean"), { art: true });
    await load("wiki-like");
    const host = hosts()[0]!;
    expect(host.parentElement).toBe(document.documentElement);
    expect(document.documentElement.lastElementChild).toBe(host);
  });

  it("Show art off: the theme comes back, the art does not", async () => {
    const { themeToPlan } = await import("../src/plan/themeToPlan.ts");
    const { defaultSettings } = await import("../src/extension/settings.ts");
    store.set("settings", { ...defaultSettings(), scene: { ...defaultSettings().scene, enabled: false } });
    await keep(themeToPlan("ocean"), { art: true });
    await load("claude-like");
    expect(document.documentElement.getAttribute("data-skinly")).toBe("on");
    expect(hosts()).toHaveLength(0);
  });

  it("the pet comes back with the theme after a reload", async () => {
    const { themeToPlan } = await import("../src/plan/themeToPlan.ts");
    const { defaultSettings } = await import("../src/extension/settings.ts");
    store.set("settings", { ...defaultSettings(), pet: { ...defaultSettings().pet, enabled: true } });
    await keep(themeToPlan("ocean"), { art: true });
    await load("sidebar");
    expect(petHosts()).toHaveLength(1);
    await reload("sidebar");
    expect(petHosts()).toHaveLength(1);
    expect(hosts()).toHaveLength(1);
  });
});

describe("auto path: applier-auto applies the stored plan and an older saved scene", () => {
  it.each(Object.keys(PAGES) as PageName[])("%s", async (page) => {
    document.body.innerHTML = PAGES[page];
    const { themeToPlan } = await import("../src/plan/themeToPlan.ts");
    const origin = location.origin;
    store.set("sites", {
      [origin]: {
        v: 1,
        plan: themeToPlan("midnight"),
        fingerprint: { hash: "0123abcd", seq: "hnm" },
        provider: "builtin",
        model: "builtin",
        promptVersion: "5",
        savedAt: "2026-10-30T10:00:00.000Z",
        mode: "auto",
        blur: [],
        blurImages: false,
        look: { scene: { id: "space", density: "high", lane: "both" } },
      },
    });
    await import("../src/extension/applier.ts");
    await import("../src/extension/scene.ts");
    await import("../src/extension/applier-auto.ts");
    await tick();
    await tick();
    expect(document.documentElement.getAttribute("data-skinly")).toBe("on");
    expect(hosts()).toHaveLength(1);
    expect(actors().length).toBeGreaterThan(0);
  });
});
