import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** F1 / D5 (S5.2): clicking a theme applies it at once, saves it and remembers the site. Popup component with a mocked api.ts. */
const store = vi.hoisted(() => new Map<string, unknown>());
const api = vi.hoisted(() => ({
  queryActiveTab: vi.fn(),
  injectFile: vi.fn(),
  runInPage: vi.fn(),
  runTool: vi.fn(),
  captureVisible: vi.fn(),
  storageGet: vi.fn(),
  storageSet: vi.fn(),
  setBadge: vi.fn(),
  requestOrigins: vi.fn(),
  removeOrigins: vi.fn(),
  registerAutoScript: vi.fn(),
  unregisterAutoScript: vi.fn(),
  getCommands: vi.fn(),
  runScene: vi.fn(),
  browserHints: vi.fn(),
  hasOrigins: vi.fn(),
  registeredScripts: vi.fn(),
  storageRemove: vi.fn(),
  injectFiles: vi.fn(),
}));
vi.mock("../src/extension/api.ts", () => api);

const flow = vi.hoisted(() => ({ runTransform: vi.fn(), applyTheme: vi.fn() }));
vi.mock("../src/extension/flow.ts", () => ({
  runTransform: flow.runTransform,
  createPageClient: () => ({ applyTheme: flow.applyTheme }),
}));

import { blockedWhy, themeFailureMessage } from "../src/ai/messages.ts";
import { S } from "../src/ui/strings.ts";
import { wireBackground } from "./helpers/popupBackground.ts";
import { planFor } from "./plan/helpers.ts";
import { Popup } from "../src/extension/popup/Popup.tsx";

const TAB = { id: 7, url: "https://example.org/a" };
const ORIGIN = "https://example.org";

let bg = { settled: (): Promise<unknown> => Promise.resolve() };
/** Answers the permission prompt a test left open (rapid clicks hold one open on purpose). */
let answer: (ok: boolean) => void = () => undefined;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const flush = () =>
  act(async () => {
    await tick();
    await bg.settled();
    await tick();
  });
/** Lets the popup run without waiting for the background (which may wait on an unanswered prompt). */
const ticks = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await tick();
  });
const mount = async () => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  await act(() => render(h(Popup, {}), root));
  await act(() => tick());
  await flush();
  return root;
};
const radio = (root: HTMLElement, id: string) => root.querySelector<HTMLInputElement>(`input[type="radio"][value="${id}"]`)!;
const pick = async (root: HTMLElement, id: string) => {
  await act(() => radio(root, id).click());
  await flush();
};
const find = (root: HTMLElement, label: string) => Array.from(root.querySelectorAll("button")).find((b) => b.textContent === label);
const status = (root: HTMLElement) => root.querySelector(".popup-head [role=status]")!.textContent;
const success = (root: HTMLElement) => root.querySelector(".banner-success")?.textContent;
const sites = () => store.get("sites") as Record<string, { provider: string; mode: string; paused?: boolean; plan: { themeId: string } }> | undefined;
const savedTheme = () => (store.get("settings") as { theme?: string } | undefined)?.theme;
const darkScheme = (dark: boolean) => vi.stubGlobal("matchMedia", (q: string) => ({ matches: dark && q.includes("dark"), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));

describe("popup: a theme click applies at once (F1)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    Object.values(api).forEach((f) => f.mockReset());
    Object.values(flow).forEach((f) => f.mockReset());
    store.clear();
    api.storageGet.mockImplementation(async (k: string) => store.get(k));
    api.setBadge.mockResolvedValue(undefined);
    api.requestOrigins.mockResolvedValue(true);
    api.removeOrigins.mockResolvedValue(true);
    api.queryActiveTab.mockResolvedValue(TAB);
    api.getCommands.mockResolvedValue([]);
    api.browserHints.mockReturnValue({ userAgent: "Chrome/130", brave: false });
    flow.applyTheme.mockImplementation(async (id: string) => ({ ok: true, themeId: id, regions: 0, strategy: "full", steppedDown: false, repairs: 0, samples: 3 }));
    bg = wireBackground(api, store);
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    // A prompt left unanswered by a failing test would hold the keeper's queue (module-wide) and fail every later test.
    answer(false);
    answer = () => undefined;
    await bg.settled();
  });

  it("theme click applies at once, with no second action: one apply, no AI flow, a success line, the site kept", async () => {
    const root = await mount();
    await pick(root, "midnight");
    expect(flow.applyTheme).toHaveBeenCalledTimes(1);
    expect(flow.applyTheme).toHaveBeenCalledWith("midnight");
    expect(flow.runTransform).not.toHaveBeenCalled();
    expect(success(root)).toBe(S.popup.applied("Midnight", 0));
    expect(radio(root, "midnight").checked).toBe(true);
    expect(root.querySelector(".theme-card.on input")).toBe(radio(root, "midnight"));
    expect(api.setBadge).toHaveBeenCalledWith(7, "ON");
    expect(savedTheme()).toBe("midnight");
    expect(sites()![ORIGIN]).toMatchObject({ provider: "builtin", mode: "auto", plan: { themeId: "midnight" } });
    expect(api.registerAutoScript).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain(S.popup.siteAutoWith(S.popup.builtinTheme));
  });

  it("inside the click: the intent is written, then the permission is requested, then the settings are saved; the page comes after", async () => {
    const root = await mount();
    api.storageSet.mockClear();
    await pick(root, "ocean");
    const order = (m: { mock: { invocationCallOrder: number[] } }, i = 0) => m.mock.invocationCallOrder[i]!;
    const intentAt = api.storageSet.mock.calls.findIndex((c) => c[0] === "intent");
    const settingsAt = api.storageSet.mock.calls.findIndex((c) => c[0] === "settings");
    expect(intentAt).toBeGreaterThanOrEqual(0);
    expect(order(api.storageSet, intentAt)).toBeLessThan(order(api.requestOrigins, api.requestOrigins.mock.calls.length - 1));
    expect(order(api.requestOrigins, api.requestOrigins.mock.calls.length - 1)).toBeLessThan(order(api.storageSet, settingsAt));
    expect(order(api.storageSet, settingsAt)).toBeLessThan(order(flow.applyTheme));
    expect(api.requestOrigins).toHaveBeenLastCalledWith([`${ORIGIN}/*`]);
  });

  it("after Restore no theme is active; picking the theme that was on applies it again", async () => {
    api.runInPage.mockResolvedValue({ ok: true });
    const root = await mount();
    await pick(root, "field");
    await act(() => find(root, "Restore original")!.click());
    await flush();
    expect(status(root)).toBe(S.popup.restored);
    // F2: the page is original, so no radio claims to be active (the global default stays stored)
    expect(root.querySelector('input[type="radio"]:checked')).toBeNull();
    expect(savedTheme()).toBe("field");
    await pick(root, "field");
    expect(radio(root, "field").checked).toBe(true);
    expect(flow.applyTheme).toHaveBeenCalledTimes(2);
    expect(flow.applyTheme).toHaveBeenLastCalledWith("field");
    expect(status(root)).not.toBe(S.popup.restored);
    expect(success(root)).toBe(S.popup.applied("Field", 0));
  });

  it("Auto applies the variant for the colour scheme and stores it: global stays auto, the site keeps the variant (O2)", async () => {
    darkScheme(true);
    const root = await mount();
    await pick(root, "auto");
    expect(flow.applyTheme).toHaveBeenCalledWith("midnight");
    expect(savedTheme()).toBe("auto");
    expect(sites()![ORIGIN]!.plan.themeId).toBe("midnight");
    expect(radio(root, "auto").checked).toBe(true);
    darkScheme(false);
    await pick(root, "auto");
    expect(flow.applyTheme).toHaveBeenLastCalledWith("calm-light");
    expect(sites()![ORIGIN]!.plan.themeId).toBe("calm-light");
  });

  it("rapid clicks end in the last theme: page, settings and record; one permission request; no stale result shown", async () => {
    api.requestOrigins.mockImplementation(() => new Promise<boolean>((r) => (answer = r)));
    const applies: Array<{ id: string; done: (v: unknown) => void }> = [];
    flow.applyTheme.mockImplementation((id: string) => new Promise((done) => applies.push({ id, done })));
    const root = await mount();
    for (const id of ["ocean", "field", "warm-paper"]) await act(() => radio(root, id).click());
    await ticks();
    // the first click's swap is in the page; the later ones wait behind it and only the last will run
    expect(applies.map((a) => a.id)).toEqual(["ocean"]);
    expect(status(root)).toBe(S.popup.applying("Warm paper"));
    await act(async () => applies[0]!.done({ ok: true }));
    await ticks();
    expect(applies.map((a) => a.id)).toEqual(["ocean", "warm-paper"]);
    expect(success(root)).toBeUndefined();
    await act(async () => applies[1]!.done({ ok: true }));
    await act(async () => answer(true));
    await flush();
    expect(api.requestOrigins).toHaveBeenCalledTimes(1);
    expect(success(root)).toBe(S.popup.applied("Warm paper", 0));
    expect(savedTheme()).toBe("warm-paper");
    expect(sites()![ORIGIN]!.plan.themeId).toBe("warm-paper");
    expect(radio(root, "warm-paper").checked).toBe(true);
    expect(store.has("intent")).toBe(false);
  });

  it("a refused permission keeps the theme on this tab only: one message, Keep on this site, and the next click does not ask again", async () => {
    api.requestOrigins.mockResolvedValue(false);
    const root = await mount();
    await pick(root, "ocean");
    expect(flow.applyTheme).toHaveBeenCalledWith("ocean");
    expect(root.textContent).toContain(S.popup.keepDenied);
    expect(sites()).toBeUndefined();
    expect(api.registerAutoScript).not.toHaveBeenCalled();
    expect(find(root, "Keep on this site")).toBeDefined();
    expect(savedTheme()).toBe("ocean");
    await pick(root, "midnight");
    expect(api.requestOrigins).toHaveBeenCalledTimes(1);
    expect(flow.applyTheme).toHaveBeenLastCalledWith("midnight");
    expect(root.textContent).toContain(S.popup.thisPageOnly);
    expect(sites()).toBeUndefined();
    api.requestOrigins.mockResolvedValue(true);
    await act(() => find(root, "Keep on this site")!.click());
    await flush();
    expect(sites()![ORIGIN]).toMatchObject({ provider: "builtin", mode: "auto", plan: { themeId: "midnight" } });
  });

  it.each([
    ["a browser page", "chrome://extensions/"],
    ["a store page", "https://chromewebstore.google.com/detail/x"],
    ["a local file", "file:///C:/notes/a.html"],
    ["a .pdf on an allowed origin (the full URL is checked)", "https://example.org/files/report.pdf"],
  ])("on %s a theme click saves the choice, shows the blocked message, injects nothing and asks nothing", async (_n, url) => {
    api.queryActiveTab.mockResolvedValue({ id: 3, url });
    const root = await mount();
    await pick(root, "midnight");
    expect(savedTheme()).toBe("midnight");
    // S5.4: the reason is named, with what to do (one distinct line per kind of page)
    expect(status(root)).toBe(blockedWhy(url, []));
    expect(status(root)).not.toBe(blockedWhy(undefined));
    expect(root.textContent).toContain(S.popup.choiceSaved);
    expect(api.requestOrigins).not.toHaveBeenCalled();
    expect(api.injectFile).not.toHaveBeenCalled();
    expect(flow.applyTheme).not.toHaveBeenCalled();
    expect(store.has("intent")).toBe(false);
    expect(radio(root, "midnight").checked).toBe(true);
  });

  it("theme radios are disabled while Change my page runs", async () => {
    flow.runTransform.mockImplementation(() => new Promise(() => undefined));
    const root = await mount();
    await act(() => find(root, "Change my page")!.click());
    await ticks();
    expect(root.querySelectorAll('input[type="radio"]:disabled')).toHaveLength(7);
    await act(() => radio(root, "ocean").click());
    await ticks();
    expect(flow.applyTheme).not.toHaveBeenCalled();
  });

  it("a theme click in the preview state replaces the AI theme and its record (O3)", async () => {
    flow.runTransform.mockResolvedValue({ kind: "preview", source: "ai", plan: planFor("ocean"), baselineThemeId: "calm-light", fingerprint: { hash: "0123abcd", seq: "hnm" }, providerId: "gemini", model: "m-1" });
    const root = await mount();
    await act(() => find(root, "Change my page")!.click());
    await flush();
    expect(root.querySelector('section[aria-label="Preview"]')).not.toBeNull();
    expect(sites()![ORIGIN]!.provider).toBe("gemini");
    // an AI theme is none of the seven (O4)
    expect(root.querySelectorAll('input[type="radio"]:checked')).toHaveLength(0);
    await pick(root, "warm-paper");
    expect(root.querySelector('section[aria-label="Preview"]')).toBeNull();
    expect(flow.applyTheme).toHaveBeenCalledWith("warm-paper");
    expect(sites()![ORIGIN]).toMatchObject({ provider: "builtin", mode: "auto", plan: { themeId: "warm-paper" } });
    expect(radio(root, "warm-paper").checked).toBe(true);
  });

  it("busy: the fieldset is aria-busy and the status says Applying while the theme goes on; Change my page and Restore wait; cleared after", async () => {
    let done: (v: unknown) => void = () => undefined;
    flow.applyTheme.mockImplementation(() => new Promise((r) => (done = r)));
    const root = await mount();
    await act(() => radio(root, "ocean").click());
    await ticks();
    expect(root.querySelector("fieldset.themes")!.getAttribute("aria-busy")).toBe("true");
    expect(status(root)).toBe(S.popup.applying("Ocean"));
    expect(find(root, "Change my page")!.disabled).toBe(true);
    expect(find(root, "Restore original")!.disabled).toBe(true);
    expect(root.querySelectorAll('input[type="radio"]:disabled')).toHaveLength(0);
    await act(async () => done({ ok: true }));
    await flush();
    expect(root.querySelector("fieldset.themes")!.hasAttribute("aria-busy")).toBe(false);
    expect(find(root, "Change my page")!.disabled).toBe(false);
    expect(find(root, "Restore original")!.disabled).toBe(false);
    expect(success(root)).toBe(S.popup.applied("Ocean", 0));
  });

  it("an apply failure shows the failure message and no success line", async () => {
    const failed = { ok: false, reason: "invariants" };
    flow.applyTheme.mockResolvedValue(failed);
    const root = await mount();
    await pick(root, "midnight");
    expect(status(root)).toBe(themeFailureMessage(failed));
    expect(root.querySelector(".popup-head [role=status]")!.className).toContain("banner-error");
    expect(success(root)).toBeUndefined();
    flow.applyTheme.mockRejectedValue(new Error("Cannot access contents of the page"));
    await pick(root, "ocean");
    expect(status(root)).toBe(S.edge.injectFailed);
    expect(root.textContent).not.toContain("Cannot access");
  });

  it("the checked radio is this site's remembered built-in theme, else the global choice (O4)", async () => {
    store.set("settings", { theme: "midnight", blocklist: [] });
    store.set("sites", { [ORIGIN]: { v: 1, plan: planFor("ocean"), fingerprint: { hash: "00000000", seq: "" }, provider: "builtin", model: "builtin", promptVersion: "7", savedAt: "2026-11-01T10:00:00.000Z", mode: "auto", blur: [], blurImages: false, paused: true } });
    const root = await mount();
    // paused = restored (F2): the site's theme is not active, so no radio is checked
    expect(root.querySelector('input[type="radio"]:checked')).toBeNull();
    store.set("sites", { [ORIGIN]: { ...(store.get("sites") as Record<string, object>)[ORIGIN], paused: false } });
    document.body.innerHTML = "";
    const resumed = await mount();
    expect(radio(resumed, "ocean").checked).toBe(true);
    api.queryActiveTab.mockResolvedValue({ id: 8, url: "https://other.example/" });
    document.body.innerHTML = "";
    const other = await mount();
    expect(radio(other, "midnight").checked).toBe(true);
  });
});
