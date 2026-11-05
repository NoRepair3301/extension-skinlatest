import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** F2 (S5.3): the Restore button's states in the popup. Popup component with a mocked api.ts; the page is a small stand-in that knows whether it is themed. */
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

import { MSG } from "../src/ai/messages.ts";
import { S } from "../src/ui/strings.ts";
import { wireBackground } from "./helpers/popupBackground.ts";
import { planFor } from "./plan/helpers.ts";
import { Popup } from "../src/extension/popup/Popup.tsx";

const TAB = { id: 7, url: "https://example.org/a" };
const ORIGIN = "https://example.org";

let bg = { settled: (): Promise<unknown> => Promise.resolve() };
/** What the page stand-in is doing: themed or not, and how a restore is answered. */
let page: { themed: boolean; restoreAnswer: () => Promise<unknown> };
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const flush = () =>
  act(async () => {
    await tick();
    await bg.settled();
    await tick();
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
const restoreButton = (root: HTMLElement) => Array.from(root.querySelectorAll("button")).find((b) => [S.popup.restore, S.popup.restoring, S.popup.restoredShort].includes(b.textContent ?? ""))!;
const hint = (root: HTMLElement) => root.querySelector("#restore-hint")!.textContent;
const status = (root: HTMLElement) => root.querySelector(".popup-head [role=status]")!.textContent;
const restoreCalls = () => api.runInPage.mock.calls.filter((c) => c[1] === "restore");
const sites = () => store.get("sites") as Record<string, { mode: string; paused?: boolean }> | undefined;
const record = (extra: object = {}) => ({ v: 1, plan: planFor("ocean"), fingerprint: { hash: "00000000", seq: "" }, provider: "builtin", model: "builtin", promptVersion: "7", savedAt: "2026-11-01T10:00:00.000Z", mode: "auto", blur: [], blurImages: false, ...extra });

describe("popup: the Restore button (F2)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    Object.values(api).forEach((f) => f.mockReset());
    Object.values(flow).forEach((f) => f.mockReset());
    store.clear();
    page = { themed: false, restoreAnswer: async () => ({ ok: true }) };
    api.storageGet.mockImplementation(async (k: string) => store.get(k));
    api.setBadge.mockResolvedValue(undefined);
    api.requestOrigins.mockResolvedValue(true);
    api.removeOrigins.mockResolvedValue(true);
    api.queryActiveTab.mockResolvedValue(TAB);
    api.getCommands.mockResolvedValue([]);
    api.browserHints.mockReturnValue({ userAgent: "Chrome/130", brave: false });
    api.injectFile.mockResolvedValue(undefined);
    api.runInPage.mockImplementation(async (_t: number, m: string) => {
      if (m === "canRestore") return page.themed;
      if (m === "restore") {
        const answer = await page.restoreAnswer();
        if ((answer as { ok?: boolean } | undefined)?.ok === true) page.themed = false;
        return answer;
      }
      return undefined;
    });
    flow.applyTheme.mockImplementation(async (id: string) => {
      page.themed = true;
      return { ok: true, themeId: id, regions: 0, strategy: "full", steppedDown: false, repairs: 0, samples: 3 };
    });
    bg = wireBackground(api, store);
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await bg.settled();
  });

  it("is disabled before any theme: aria-disabled, a spoken reason, and a click does nothing", async () => {
    const root = await mount();
    const b = restoreButton(root);
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.getAttribute("aria-describedby")).toBe("restore-hint");
    expect(hint(root)).toBe(S.popup.nothingToRestore);
    expect(root.querySelector("#restore-hint")!.getAttribute("aria-live")).toBe("polite");
    await act(() => b.click());
    await flush();
    expect(restoreCalls()).toEqual([]);
    expect(api.injectFile).not.toHaveBeenCalled();
    expect(status(root)).not.toBe(S.popup.restored);
  });

  it("becomes enabled after a theme goes on, and the reason is gone", async () => {
    const root = await mount();
    await pick(root, "midnight");
    expect(restoreButton(root).getAttribute("aria-disabled")).toBeNull();
    expect(hint(root)).toBe("");
  });

  it("is enabled when the page already carries a theme (popup reopened on a themed page)", async () => {
    page.themed = true;
    const root = await mount();
    expect(restoreButton(root).getAttribute("aria-disabled")).toBeNull();
  });

  it("is enabled for a remembered site that is on, even when this page shows nothing yet", async () => {
    store.set("sites", { [ORIGIN]: record() });
    const root = await mount();
    expect(restoreButton(root).getAttribute("aria-disabled")).toBeNull();
  });

  it("is disabled on an ineligible page with the blocked message, and nothing is asked of the page", async () => {
    api.queryActiveTab.mockResolvedValue({ id: 7, url: "chrome://extensions" });
    api.runInPage.mockRejectedValue(new Error("Cannot access a chrome:// URL"));
    const root = await mount();
    expect(restoreButton(root).getAttribute("aria-disabled")).toBe("true");
    expect(hint(root)).toBe(MSG.blocked);
    await act(() => restoreButton(root).click());
    await flush();
    expect(restoreCalls()).toEqual([]);
  });

  it("while restoring it shows a busy state and ignores repeat clicks; then confirms and reads disabled again", async () => {
    let finish: (v: unknown) => void = () => undefined;
    page.themed = true;
    store.set("sites", { [ORIGIN]: record() });
    const root = await mount();
    page.restoreAnswer = () => new Promise((r) => (finish = r));
    const b = restoreButton(root);
    b.focus();
    await act(() => b.click());
    await act(() => tick());
    expect(b.textContent).toBe(S.popup.restoring);
    expect(b.getAttribute("aria-busy")).toBe("true");
    expect(b.getAttribute("aria-disabled")).toBe("true");
    await act(() => b.click());
    await act(() => b.click());
    await act(() => tick());
    expect(restoreCalls()).toHaveLength(1);
    await act(async () => {
      finish({ ok: true });
      await tick();
    });
    await flush();
    expect(b.textContent).toBe(S.popup.restoredShort);
    expect(status(root)).toBe(S.popup.restored);
    expect(b.getAttribute("aria-busy")).toBeNull();
    expect(b.getAttribute("aria-disabled")).toBe("true"); // nothing is left to restore
    expect(document.activeElement).toBe(b); // focus is not lost
    // the confirmation is short: the label returns to Restore original and the explanation shows
    await act(() => new Promise<void>((r) => setTimeout(r, 2100)));
    expect(b.textContent).toBe(S.popup.restore);
    expect(hint(root)).toBe(S.popup.nothingToRestore);
    expect(restoreCalls()).toHaveLength(1);
  });

  it("after Restore: the site is paused, no theme radio is active, the pick hint shows; a theme click turns it all back on", async () => {
    const root = await mount();
    await pick(root, "midnight");
    expect(sites()![ORIGIN]).toMatchObject({ mode: "auto" });
    await act(() => restoreButton(root).click());
    await flush();
    expect(page.themed).toBe(false);
    expect(sites()![ORIGIN]!.paused).toBe(true);
    expect(root.querySelector('input[type="radio"]:checked')).toBeNull();
    expect(root.querySelector(".theme-card.on")).toBeNull();
    expect(root.textContent).toContain(S.popup.pausedLine);
    expect(root.textContent).toContain(S.popup.pickToResume);
    expect((store.get("settings") as { theme: string }).theme).toBe("midnight");
    await pick(root, "midnight");
    expect(radio(root, "midnight").checked).toBe(true);
    expect(sites()![ORIGIN]!.paused).toBeUndefined();
    expect(restoreButton(root).getAttribute("aria-disabled")).toBeNull();
    expect(root.textContent).not.toContain(S.popup.pickToResume);
  });

  it("a page themed for this tab only (permission refused, nothing remembered): after Restore no radio is active either, the global default stays stored", async () => {
    api.requestOrigins.mockResolvedValue(false);
    const root = await mount();
    await pick(root, "ocean");
    expect(page.themed).toBe(true);
    expect(sites()).toBeUndefined();
    expect(restoreButton(root).getAttribute("aria-disabled")).toBeNull();
    await act(() => restoreButton(root).click());
    await flush();
    expect(page.themed).toBe(false);
    expect(status(root)).toBe(S.popup.restored);
    expect(root.querySelector('input[type="radio"]:checked')).toBeNull();
    expect((store.get("settings") as { theme: string }).theme).toBe("ocean");
    expect(sites()).toBeUndefined();
    await pick(root, "ocean");
    expect(radio(root, "ocean").checked).toBe(true);
  });

  it("reopening the popup shows the same restored state", async () => {
    const root = await mount();
    await pick(root, "ocean");
    await act(() => restoreButton(root).click());
    await flush();
    document.body.innerHTML = "";
    const again = await mount();
    expect(again.querySelector('input[type="radio"]:checked')).toBeNull();
    expect(restoreButton(again).getAttribute("aria-disabled")).toBe("true");
    expect(hint(again)).toBe(S.popup.nothingToRestore);
    expect(again.textContent).toContain(S.popup.pausedLine);
  });

  it("Restore twice in a row is harmless: the second click has nothing to do and changes nothing", async () => {
    const root = await mount();
    await pick(root, "field");
    await act(() => restoreButton(root).click());
    await flush();
    const before = JSON.stringify([...store.entries()]);
    await act(() => restoreButton(root).click());
    await flush();
    expect(restoreCalls()).toHaveLength(1);
    expect(JSON.stringify([...store.entries()])).toBe(before);
  });

  it("when nothing in the page answers, the failure message shows, the site is not paused and the button stays usable", async () => {
    const root = await mount();
    await pick(root, "midnight");
    page.restoreAnswer = async () => undefined;
    await act(() => restoreButton(root).click());
    await flush();
    expect(status(root)).toBe(S.popup.restoreFailed);
    expect(sites()![ORIGIN]!.paused).toBeUndefined();
    expect(root.querySelector('input[type="radio"]:checked')).toBe(radio(root, "midnight"));
    expect(restoreButton(root).textContent).toBe(S.popup.restore);
    expect(restoreButton(root).getAttribute("aria-disabled")).toBeNull();
    // a second try works
    page.restoreAnswer = async () => ({ ok: true });
    await act(() => restoreButton(root).click());
    await flush();
    expect(status(root)).toBe(S.popup.restored);
    expect(sites()![ORIGIN]!.paused).toBe(true);
  });

  it("injection refused (no applier anywhere): the failure message, no pause", async () => {
    const root = await mount();
    await pick(root, "midnight");
    api.injectFile.mockRejectedValue(new Error("refused"));
    const was = api.runInPage.getMockImplementation()!;
    api.runInPage.mockImplementation(async (t: number, m: string, ...rest: unknown[]) => (m === "isActive" || m === "restore" ? undefined : was(t, m, ...rest)));
    await act(() => restoreButton(root).click());
    await flush();
    expect(status(root)).toBe(S.popup.restoreFailed);
    expect(sites()![ORIGIN]!.paused).toBeUndefined();
  });
});
