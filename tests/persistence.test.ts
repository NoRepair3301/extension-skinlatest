import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeChrome, type FakeChrome, type FakeChromeOptions } from "./helpers/fakeChrome.ts";
import { planFor } from "./plan/helpers.ts";

/**
 * A1: the keep flow on a fake chrome that keeps the browser's event order. The real popup, background, api.ts, intent and site code run;
 * only the AI flow (flow.ts) and the page scripts are stand-ins. The page is "themed" when the auto files are injected or the popup's
 * flow applies, exactly what the page script would report through isActive.
 */
const flow = vi.hoisted(() => ({ runTransform: vi.fn(), applyTheme: vi.fn() }));
vi.mock("../src/extension/flow.ts", () => ({
  runTransform: flow.runTransform,
  createPageClient: () => ({ applyTheme: flow.applyTheme }),
}));

const ORIGIN = "https://en.wikipedia.org";
const PATTERN = `${ORIGIN}/*`;
const TAB = 7;
const URL_A = `${ORIGIN}/wiki/Solar_System`;

interface PageState {
  themed: boolean;
  autoRuns: number;
}

let fake: FakeChrome;
let page: PageState;
let root: HTMLElement | undefined;

const aiOutcome = () => ({ kind: "preview" as const, source: "ai" as const, plan: planFor("ocean"), baselineThemeId: "calm-light", fingerprint: { hash: "0123abcd", seq: "hnm" }, providerId: "gemini", model: "m-1" });

async function boot(opts: FakeChromeOptions = {}) {
  vi.resetModules();
  page = { themed: false, autoRuns: 0 };
  fake = createFakeChrome({
    tabs: { [TAB]: URL_A },
    onFiles: (_tab, files) => {
      if (files.includes("applier-auto.js")) {
        page.autoRuns++;
        page.themed = true;
      }
    },
    ...opts,
  });
  fake.activeTab.add(TAB);
  fake.install();
  // the page script the popup and the background talk to through executeScript
  (globalThis as unknown as { skinlyApplier: unknown }).skinlyApplier = {
    isActive: () => page.themed,
    repairRules: () => "",
    restore: () => {
      page.themed = false;
      return { ok: true };
    },
    diag: () => ({ page: { theme: page.themed ? "ocean" : "none", art: "off", auto: page.themed ? "applied" : "not-run" }, errors: [] }),
    syncPet: () => false,
  };
  flow.runTransform.mockReset();
  flow.runTransform.mockImplementation(async () => {
    page.themed = true;
    return aiOutcome();
  });
  await import("../src/extension/background.ts");
  await fake.settle();
  // what the worker did on start (migration) is not part of the click
  fake.log.length = 0;
}

const flush = async () => {
  for (let i = 0; i < 3; i++) await act(() => new Promise<void>((r) => setTimeout(r, 0)));
  await fake.settle();
  await act(() => new Promise<void>((r) => setTimeout(r, 0)));
};

async function openPopup() {
  if (root) render(null, root);
  root = document.createElement("div");
  document.body.appendChild(root);
  const { Popup } = await import("../src/extension/popup/Popup.tsx");
  await act(() => render(h(Popup, {}), root!));
  await flush();
  return root;
}

const button = (label: string) => Array.from(root!.querySelectorAll("button")).find((b) => b.textContent === label);
async function click(label: string) {
  const b = button(label);
  expect(b, `button ${label}`).toBeDefined();
  await act(() => b!.click());
  await flush();
}

const sites = () => fake.store.get("sites") as Record<string, { mode: string; paused?: boolean; provider: string; plan: { themeId: string } }> | undefined;
const registration = async () => {
  const { scriptId } = await import("../src/extension/siteActions.ts");
  return fake.registered.get(scriptId(ORIGIN));
};

beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
});
afterEach(() => {
  if (root) render(null, root);
  root = undefined;
  document.body.replaceChildren();
  delete (globalThis as unknown as { skinlyApplier?: unknown }).skinlyApplier;
  vi.unstubAllGlobals();
});

describe("A1a: the popup only writes the intent and asks; the background keeps the site", () => {
  it("Edge: the popup dies at the prompt, the user allows; registration, record and apply still complete", async () => {
    await boot({ popupDies: true, prompt: "allow" });
    await openPopup();
    await click("Change my page");
    // the click: the intent write is issued first, then the permission request is the first awaited call
    expect(fake.log.slice(0, 2)).toEqual(["storage.set intent", `permissions.request ${PATTERN}`]);
    // the popup is dead: its flow never ran
    expect(flow.runTransform).not.toHaveBeenCalled();
    const reg = await registration();
    expect(reg).toMatchObject({ matches: [PATTERN], js: ["applier.js", "applier-auto.js", "scene.js"], runAt: "document_start", persistAcrossSessions: true });
    expect(sites()![ORIGIN]).toMatchObject({ mode: "auto", provider: "builtin", plan: { themeId: "calm-light" } });
    expect(sites()![ORIGIN]!.paused).toBeUndefined();
    // the background themed the open tab the way a page load does
    expect(fake.exec.find((c) => c.files?.includes("applier-auto.js"))).toMatchObject({ tabId: TAB, files: ["applier.js", "applier-auto.js", "scene.js"] });
    expect(page.autoRuns).toBe(1);
    expect(fake.badges.get(TAB)).toBe("ON");
    // done: nothing left pending
    expect(fake.store.has("intent")).toBe(false);
  });

  it("the next pages of the site: the registration matches every path of the origin and nothing else", async () => {
    await boot({ popupDies: true });
    await openPopup();
    await click("Change my page");
    const reg = await registration();
    const re = new RegExp(`^${reg!.matches[0]!.replace(/[.]/g, "\\.").replace("*", ".*")}$`);
    for (const u of [`${ORIGIN}/wiki/Sun`, `${ORIGIN}/wiki/Jupiter#Moons`, `${ORIGIN}/w/index.php?title=Mars`]) expect(re.test(u), u).toBe(true);
    for (const u of ["https://de.wikipedia.org/wiki/Sonne", "http://en.wikipedia.org/wiki/Sun", "https://en.wikipedia.org.evil.example/x"]) expect(re.test(u), u).toBe(false);
  });

  it("Edge: the user denies; nothing is kept; the reopened popup says 'this page only' once and does not ask again", async () => {
    await boot({ popupDies: true, prompt: "deny" });
    await openPopup();
    await click("Change my page");
    expect(await registration()).toBeUndefined();
    expect(sites()?.[ORIGIN]).toBeUndefined();
    expect(fake.store.has("intent")).toBe(true);
    // the user opens the popup again
    await openPopup();
    expect(root!.textContent).toContain("This page only: permission wasn't given");
    expect((fake.store.get("intent") as { denied?: boolean }).denied).toBe(true);
    const asked = fake.log.filter((l) => l.startsWith("permissions.request")).length;
    await click("Change my page");
    expect(fake.log.filter((l) => l.startsWith("permissions.request")).length).toBe(asked);
    expect(flow.runTransform).toHaveBeenCalledTimes(1);
    expect(page.themed).toBe(true);
    expect(await registration()).toBeUndefined();
    expect(button("Keep on this site")).toBeDefined();
  });

  it("already granted (no prompt): the popup runs the AI flow and hands the final plan over; the background saves it", async () => {
    await boot({ granted: [PATTERN] });
    await openPopup();
    await click("Change my page");
    expect(flow.runTransform).toHaveBeenCalledTimes(1);
    expect(sites()![ORIGIN]).toMatchObject({ mode: "auto", provider: "gemini", plan: { themeId: "ocean" } });
    expect(await registration()).toBeDefined();
    // the popup themed the tab itself: the background does not inject the auto files on top
    expect(fake.exec.filter((c) => c.files?.includes("applier-auto.js"))).toEqual([]);
    expect(fake.store.has("intent")).toBe(false);
    expect(root!.textContent).toContain("Every page of this site");
  });

  it("Chrome: the popup survives the prompt; the AI plan the popup applied is what is kept, applied once by the popup", async () => {
    await boot({ prompt: "allow" });
    flow.runTransform.mockImplementation(async () => {
      // by the time the AI answers the background has handled onAdded
      await fake.settle();
      page.themed = true;
      return aiOutcome();
    });
    await openPopup();
    await click("Change my page");
    expect(sites()![ORIGIN]).toMatchObject({ provider: "gemini", plan: { themeId: "ocean" } });
    expect(await registration()).toBeDefined();
    expect(fake.store.has("intent")).toBe(false);
  });

  it("an expired intent is never completed", async () => {
    await boot({ granted: [PATTERN] });
    const { makeIntent, INTENT_TTL_MS } = await import("../src/extension/intent.ts");
    const old = makeIntent(ORIGIN, TAB, "click", { plan: planFor("midnight"), fingerprint: { hash: "00000000", seq: "" }, provider: "builtin", model: "builtin" }, Date.now() - INTENT_TTL_MS - 1);
    fake.store.set("intent", old);
    const { completeIntent } = await import("../src/extension/keeper.ts");
    expect(await completeIntent("start")).toBe("none");
    expect(sites()?.[ORIGIN]).toBeUndefined();
    expect(fake.store.has("intent")).toBe(false);
  });

  it("a forged intent (bad origin, wildcard, bad plan) is ignored", async () => {
    await boot({ granted: ["https://*/*"] });
    const { completeIntent } = await import("../src/extension/keeper.ts");
    const now = Date.now();
    for (const origin of ["https://*", "<all_urls>", `${ORIGIN}/path`, "file:///c"]) {
      fake.store.set("intent", { v: 1, origin, tabId: TAB, stage: "click", createdAt: now, expiresAt: now + 300000, kept: { plan: planFor("ocean"), fingerprint: { hash: "00000000", seq: "" }, provider: "builtin", model: "builtin" } });
      expect(await completeIntent("added")).toBe("none");
    }
    fake.store.set("intent", { v: 1, origin: ORIGIN, tabId: TAB, stage: "click", createdAt: now, expiresAt: now + 300000, kept: { plan: { v: 1 }, fingerprint: { hash: "x", seq: "" }, provider: "builtin", model: "builtin" } });
    expect(await completeIntent("added")).toBe("none");
    expect(sites()?.[ORIGIN]).toBeUndefined();
    expect(fake.registered.size).toBe(0);
  });
});

describe("A1b: reconcile on service-worker start, install and update", () => {
  const v1 = (plan = planFor("ocean")) => ({ v: 1, plan, fingerprint: { hash: "0123abcd", seq: "hnm" }, provider: "builtin", model: "builtin", promptVersion: "5", savedAt: "2026-10-30T10:00:00.000Z", mode: "auto" });

  it("every granted, kept site gets the current files; paused, ungranted and stray registrations go; old records are migrated; idempotent", async () => {
    vi.resetModules();
    const A = "https://a.example";
    const B = "https://b.example:8443";
    const C = "https://c.example";
    const D = "https://d.example";
    const { scriptId } = await import("../src/extension/siteActions.ts");
    fake = createFakeChrome({ granted: [`${A}/*`, `${B}/*`, `${C}/*`] });
    // records written by 0.2.0: no paused field, no blur fields, no storage version
    fake.store.set("sites", { [A]: v1(), [B]: v1(), [C]: { ...v1(), paused: true }, [D]: v1(), "not an origin": v1() });
    fake.registered.set(scriptId(B), { id: scriptId(B), matches: [`${B}/*`], js: ["applier.js", "applier-auto.js"], runAt: "document_start" });
    fake.registered.set(scriptId(C), { id: scriptId(C), matches: [`${C}/*`], js: ["applier.js", "applier-auto.js", "scene.js"], runAt: "document_start" });
    fake.registered.set(scriptId(D), { id: scriptId(D), matches: [`${D}/*`], js: ["applier.js", "applier-auto.js", "scene.js"], runAt: "document_start" });
    fake.registered.set("skinly-deadbeef", { id: "skinly-deadbeef", matches: ["https://gone.example/*"], js: ["applier.js"], runAt: "document_start" });
    fake.registered.set("other-extension-script", { id: "other-extension-script", matches: ["https://x.example/*"], js: ["x.js"], runAt: "document_idle" });
    fake.install();
    await import("../src/extension/background.ts");
    await fake.settle();
    const files = ["applier.js", "applier-auto.js", "scene.js"];
    expect(fake.registered.get(scriptId(A))).toMatchObject({ js: files, matches: [`${A}/*`] });
    expect(fake.registered.get(scriptId(B))).toMatchObject({ js: files, matches: [`${B}/*`] });
    expect(fake.registered.has(scriptId(C))).toBe(false);
    expect(fake.registered.has(scriptId(D))).toBe(false);
    expect(fake.registered.has("skinly-deadbeef")).toBe(false);
    expect(fake.registered.has("other-extension-script")).toBe(true);
    expect(fake.store.get("schema")).toEqual({ v: 2 });
    const stored = fake.store.get("sites") as Record<string, Record<string, unknown>>;
    expect(Object.keys(stored).sort()).toEqual([A, B, C, D]);
    expect(stored[A]).toMatchObject({ blur: [], blurImages: false });
    expect(stored[C]).toMatchObject({ paused: true });

    // the worker starts again, then the extension updates: nothing changes the second time
    const before = fake.log.length;
    const { reconcile } = await import("../src/extension/siteActions.ts");
    expect(await reconcile()).toEqual({ registered: 0, removed: 0 });
    await fake.events.onInstalled.fire({ reason: "update" });
    await fake.settle();
    expect(fake.log.slice(before).filter((l) => l.startsWith("register") || l.startsWith("unregister"))).toEqual([]);
  });

  it("site access removed in the browser's settings: the registration goes, the record stays", async () => {
    await boot({ popupDies: true });
    await openPopup();
    await click("Change my page");
    expect(await registration()).toBeDefined();
    await fake.chrome.permissions.remove({ origins: [PATTERN] });
    await fake.settle();
    expect(await registration()).toBeUndefined();
    expect(sites()![ORIGIN]).toBeDefined();
  });
});

describe("A1e: Restore pauses, Resume and Change my page bring it back", () => {
  it("Restore shows 'Paused on this site' with Resume; Resume re-registers and themes the tab; Change my page clears a pause too", async () => {
    await boot({ popupDies: true });
    await openPopup();
    await click("Change my page");
    expect(await registration()).toBeDefined();
    await openPopup();
    await click("Restore original");
    expect(page.themed).toBe(false);
    expect(sites()![ORIGIN]!.paused).toBe(true);
    expect(await registration()).toBeUndefined();
    await openPopup();
    expect(root!.textContent).toContain("Paused on this site");
    expect(button("Resume")).toBeDefined();
    expect(button("Pause on this site")).toBeUndefined();
    await click("Resume");
    expect(sites()![ORIGIN]!.paused).toBeUndefined();
    expect(await registration()).toBeDefined();
    expect(page.themed).toBe(true);
    expect(fake.store.has("intent")).toBe(false);

    await click("Restore original");
    expect(sites()![ORIGIN]!.paused).toBe(true);
    await openPopup();
    await click("Change my page");
    expect(sites()![ORIGIN]!.paused).toBeUndefined();
    expect(await registration()).toBeDefined();
  });
});

describe("A2: Why not themed here?", () => {
  it("names the state in one line with a next step, and puts the word in the diagnostics (no origin, no URL)", async () => {
    await boot({ granted: [PATTERN] });
    await openPopup();
    await click("Why not themed here?");
    expect(root!.textContent).toContain("This site isn't kept. Choose Change my page");
    await click("Change my page");
    await click("Why not themed here?");
    expect(root!.textContent).toContain("The theme is on.");
    const diag = fake.store.get("diag") as { page?: { auto?: string } };
    expect(diag.page?.auto).toBe("applied");
    expect(JSON.stringify(fake.store.get("diag"))).not.toMatch(/wikipedia|https?:|Solar/);
    // permission taken away
    fake.granted.delete(PATTERN);
    await click("Why not themed here?");
    expect(root!.textContent).toContain("Skinly may not run on this site by itself");
    // registration missing
    fake.granted.add(PATTERN);
    fake.registered.clear();
    await click("Why not themed here?");
    expect(root!.textContent).toContain("the browser has not loaded it");
  });
});
