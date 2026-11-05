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

// applier-auto stores a page snapshot with a real 4 s timer (DIAG_SNAPSHOT_MS). One left over from an earlier test fires
// into a later one (about 4 s into this file, so it depends on machine speed) and overwrites the stored snapshot with its own,
// stale one. Every such timer is cleared after its test, so only the timer a test starts itself can fire.
const snapshotTimers: Array<ReturnType<typeof setTimeout>> = [];
const realSetTimeout = window.setTimeout;

beforeEach(() => {
  vi.resetModules();
  store.clear();
  window.setTimeout = ((fn: () => void, ms?: number, ...rest: unknown[]) => {
    const id = realSetTimeout.call(window, fn, ms, ...rest);
    if (ms === 4000) snapshotTimers.push(id);
    return id;
  }) as typeof window.setTimeout;
  // these flows predate Skinly Plus: they run as a Plus user (Plus themes and their scenes); the Free clamp is tested in tests/auto.test.ts
  store.set("plan", { v: 1, plan: "plus", until: Number.MAX_SAFE_INTEGER });
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
  snapshotTimers.splice(0).forEach((id) => clearTimeout(id));
  slot.skinlyApplier?.restore();
  slot.skinlyScene?.destroy();
  hosts().forEach((n) => n.remove());
  document.body.replaceChildren();
  delete slot.skinlyApplier;
  slot.skinlyScene = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.setTimeout = realSetTimeout;
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

  it("CSP: mounting the scene and the pet never makes a <style> element or a style attribute through setAttribute", async () => {
    const { themeToPlan } = await import("../src/plan/themeToPlan.ts");
    const { defaultSettings } = await import("../src/extension/settings.ts");
    store.set("settings", { ...defaultSettings(), pet: { ...defaultSettings().pet, enabled: true } });
    await keep(themeToPlan("field"), { art: true });
    const made = vi.spyOn(Document.prototype, "createElement");
    const attrs = vi.spyOn(Element.prototype, "setAttribute");
    await load("wiki-like");
    expect(hosts()).toHaveLength(1);
    expect(petHosts()).toHaveLength(1);
    expect(made.mock.calls.filter(([tag]) => String(tag).toLowerCase() === "style")).toEqual([]);
    expect(attrs.mock.calls.filter(([name]) => String(name).toLowerCase() === "style")).toEqual([]);
    for (const h of [...hosts(), ...petHosts()]) expect(h.shadowRoot!.querySelector("style")).toBeNull();
  });

  it("timing: at document_start (no body yet) the corner strip shows at once, then moves to the gutter once the DOM is parsed", async () => {
    const { themeToPlan } = await import("../src/plan/themeToPlan.ts");
    await keep(themeToPlan("ocean"), { art: true });
    const body = document.body;
    body.innerHTML = PAGES["wiki-like"];
    body.remove();
    expect(document.body).toBeNull();
    await import("../src/extension/applier.ts");
    await import("../src/extension/scene.ts");
    await import("../src/extension/applier-auto.ts");
    for (let i = 0; i < 4; i++) await tick();
    expect(hosts()).toHaveLength(1);
    expect(lanes()).toEqual(["corner"]);
    expect(actors().length).toBeGreaterThan(0);
    // the parser reaches the body
    document.documentElement.append(body);
    document.dispatchEvent(new Event("DOMContentLoaded"));
    for (let i = 0; i < 4; i++) await tick();
    expect(hosts()).toHaveLength(1);
    expect(lanes().length).toBeGreaterThan(0);
    expect(lanes()).not.toContain("corner");
    expect(document.documentElement.lastElementChild).toBe(hosts()[0]);
  });

  it("every auto step is caught: a storage failure, a throwing art hook and a throwing pet are recorded, never thrown into the page", async () => {
    api.storageGet.mockRejectedValueOnce(new Error("storage"));
    await load("wiki-like");
    const diag = await import("../src/core/diag.ts");
    expect(diag.diagErrors()).toContain("auto-run");
    expect(hosts()).toHaveLength(0);

    // next load: storage works, but the art hook and the pet throw; the theme still goes on
    const { themeToPlan } = await import("../src/plan/themeToPlan.ts");
    await keep(themeToPlan("ocean"), { art: true });
    await reload("wiki-like");
    const fresh = await import("../src/core/diag.ts");
    fresh.resetDiag();
    const live = slot.skinlyApplier as unknown as { syncPet: () => boolean };
    live.syncPet = () => {
      throw new Error("pet");
    };
    slot.skinlyOnApplied = () => {
      throw new Error("art");
    };
    // what applier-auto runs after the theme went on (a same-document navigation re-runs it the same way)
    vi.resetModules();
    document.documentElement.removeAttribute("data-skinly");
    // a fresh run, as on a new document (the live-run flag guards against a second injection into the same document)
    (slot as { skinlyAutoLive?: boolean }).skinlyAutoLive = false;
    await import("../src/extension/applier-auto.ts");
    for (let i = 0; i < 4; i++) await tick();
    const after = await import("../src/core/diag.ts");
    expect(after.diagErrors()).toEqual(expect.arrayContaining(["auto-art", "auto-pet"]));
  });

  it("diagnostics of a real page (stage 2): art state, host, gutters, actors and flags; never text, links, values or the origin", async () => {
    const { themeToPlan } = await import("../src/plan/themeToPlan.ts");
    await keep(themeToPlan("ocean"), { art: true });
    const later: Array<{ fn: () => void; ms: number }> = [];
    const realSet = window.setTimeout.bind(window);
    vi.spyOn(window, "setTimeout").mockImplementation(((fn: () => void, ms?: number) => {
      if (ms === 4000) {
        later.push({ fn, ms });
        return 0;
      }
      return realSet(fn, ms);
    }) as typeof window.setTimeout);
    await load("claude-like");
    const marker = document.createElement("p");
    marker.textContent = "SECRET-PAGE-TEXT";
    const link = document.createElement("a");
    link.href = "https://bank.example/account?id=42";
    link.textContent = "My Account Title";
    const field = document.createElement("input");
    field.value = "hunter2";
    document.body.append(marker, link, field);
    const d = (slot.skinlyApplier as unknown as { diag(): { page: Record<string, unknown>; errors: string[] } }).diag();
    expect(d.page).toMatchObject({ theme: "ocean", art: "ok", host: true, pet: false, mount: "html", htmlEffect: "none" });
    expect((d.page["actors"] as number) > 0).toBe(true);
    expect((d.page["left"] as number) + (d.page["right"] as number)).toBeGreaterThan(0);
    const all = JSON.stringify(d);
    for (const m of ["SECRET-PAGE-TEXT", "bank.example", "My Account Title", "hunter2", location.host, "Hello", "typing", "New chat"]) expect(all, m).not.toContain(m);
    // the auto script stores the same snapshot once, 4 s after the theme went on
    expect(later).toHaveLength(1);
    later[0]!.fn();
    for (let i = 0; i < 4; i++) await tick();
    const stored = store.get("diag") as { page?: { theme: string; art: string } } | undefined;
    expect(stored?.page).toMatchObject({ theme: "ocean", art: "ok" });
    expect(JSON.stringify(stored)).not.toContain(location.host);
  });

  it("reduced motion (often on in Windows) still shows static art and the pet, only the movement stops", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduced-motion"), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
    const { themeToPlan } = await import("../src/plan/themeToPlan.ts");
    const { defaultSettings } = await import("../src/extension/settings.ts");
    store.set("settings", { ...defaultSettings(), pet: { ...defaultSettings().pet, enabled: true, motion: "horizontal" } });
    await keep(themeToPlan("midnight"), { art: true });
    await load("claude-like");
    expect(hosts()).toHaveLength(1);
    expect(actors().length).toBeGreaterThan(0);
    const root = hosts()[0]!.shadowRoot!.querySelector(".root")!;
    expect(root.classList.contains("still")).toBe(true);
    expect(petHosts()).toHaveLength(1);
    expect(petHosts()[0]!.shadowRoot!.querySelector("svg")).not.toBeNull();
    expect((petHosts()[0] as HTMLElement).style.getPropertyValue("display")).toBe("block");
    // the reduced-motion rules only stop animation: nothing in them hides, fades or shrinks the art
    const { SCENE_CSS } = await import("../src/features/scenes/css.ts");
    const still = SCENE_CSS.split("}").filter((r) => r.includes(".still"));
    expect(still.length).toBeGreaterThan(0);
    for (const rule of still) expect(rule).not.toMatch(/display|visibility|opacity|transform|width|height/);
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
