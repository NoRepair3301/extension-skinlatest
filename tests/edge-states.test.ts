import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * S5.4: every failure and waiting state of the popup (F1_DESIGN section 9) shows one distinct plain line, never raw error text, and
 * leaves the UI, the stored settings and the page in agreement. Popup component with a mocked api.ts (fakes for permission, injection,
 * navigation and storage failures).
 */
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
import { en, S } from "../src/ui/strings.ts";
import { wireBackground } from "./helpers/popupBackground.ts";
import { planFor } from "./plan/helpers.ts";
import { APPLY_TIMEOUT_MS, Popup, RESTORE_TIMEOUT_MS } from "../src/extension/popup/Popup.tsx";

const TAB = { id: 7, url: "https://example.org/a" };
const ORIGIN = "https://example.org";

let bg = { settled: (): Promise<unknown> => Promise.resolve() };
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
const find = (root: HTMLElement, label: string) => Array.from(root.querySelectorAll("button")).find((b) => b.textContent === label);
const restoreButton = (root: HTMLElement) => Array.from(root.querySelectorAll("button")).find((b) => [S.popup.restore, S.popup.restoring, S.popup.restoredShort].includes(b.textContent ?? ""))!;
const status = (root: HTMLElement) => root.querySelector(".popup-head [role=status]")!.textContent;
const sites = () => store.get("sites") as Record<string, { plan: { themeId: string }; paused?: boolean }> | undefined;
const savedTheme = () => (store.get("settings") as { theme?: string } | undefined)?.theme;
const checked = (root: HTMLElement) => root.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.value;
const noRawText = (text: string | null) => {
  for (const bad of ["undefined", "null", "Error", "Cannot access", "chrome-extension", "TypeError"]) expect(text ?? "").not.toContain(bad);
};

describe("edge states (S5.4)", () => {
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
    api.runInPage.mockResolvedValue(false);
    flow.applyTheme.mockImplementation(async (id: string) => ({ ok: true, themeId: id, regions: 0, strategy: "full", steppedDown: false, repairs: 0, samples: 3 }));
    bg = wireBackground(api, store);
  });
  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    await bg.settled();
  });

  describe("ineligible pages: one distinct line per kind, nothing injected or asked", () => {
    const rows: Array<[string, string, string]> = [
      ["browser page", "chrome://extensions/", S.edge.blockedInternal],
      ["edge page", "edge://settings/", S.edge.blockedInternal],
      ["about page", "about:blank", S.edge.blockedInternal],
      ["extension page", "chrome-extension://abcdefghijklmnop/options.html", S.edge.blockedInternal],
      ["extension store", "https://chromewebstore.google.com/detail/x", S.edge.blockedStore],
      ["pdf", "https://example.org/files/report.pdf", S.edge.blockedPdf],
      ["local file", "file:///C:/notes/a.html", S.edge.blockedFile],
    ];
    it.each(rows)("edge: %s", async (_n, url, expected) => {
      api.queryActiveTab.mockResolvedValue({ id: 3, url });
      const root = await mount();
      await pick(root, "midnight");
      expect(status(root)).toBe(expected);
      expect(blockedWhy(url, [])).toBe(expected);
      noRawText(status(root));
      expect(api.requestOrigins).not.toHaveBeenCalled();
      expect(api.injectFile).not.toHaveBeenCalled();
      expect(flow.applyTheme).not.toHaveBeenCalled();
      // Restore is explained the same way and stays focusable (aria-disabled), not a dead control
      expect(restoreButton(root).getAttribute("aria-disabled")).toBe("true");
      expect(root.querySelector("#restore-hint")!.textContent).toBe(expected);
      // the popup stays usable: the next theme click works the same
      await pick(root, "ocean");
      expect(status(root)).toBe(expected);
    });

    it("edge: a site on the user's blocklist says so", async () => {
      store.set("settings", { theme: "auto", blocklist: ["example.org"] });
      const root = await mount();
      await pick(root, "midnight");
      expect(status(root)).toBe(S.edge.blockedSite);
    });

    it("edge: every kind of page has its own text", () => {
      const texts = [S.edge.blockedInternal, S.edge.blockedStore, S.edge.blockedPdf, S.edge.blockedFile, S.edge.blockedSite, S.edge.blockedOther];
      expect(new Set(texts).size).toBe(texts.length);
    });
  });

  describe("permission and injection", () => {
    it("edge: denied permission keeps previous selection and page untouched", async () => {
      store.set("settings", { theme: "ocean", blocklist: [] });
      api.requestOrigins.mockResolvedValue(false);
      flow.applyTheme.mockRejectedValue(new Error("Cannot access contents of the page. Extension manifest must request permission"));
      const root = await mount();
      expect(checked(root)).toBe("ocean");
      await pick(root, "midnight");
      expect(status(root)).toBe(S.edge.notAllowed);
      noRawText(root.textContent);
      // selection, stored choice and record are as before; the page was never changed
      expect(checked(root)).toBe("ocean");
      expect(savedTheme()).toBe("ocean");
      expect(sites()).toBeUndefined();
      expect(api.setBadge).not.toHaveBeenCalledWith(7, "ON");
      expect(root.textContent).not.toContain(S.popup.keepDenied);
      expect(root.querySelector("fieldset.themes")!.hasAttribute("aria-busy")).toBe(false);
      // clicking again asks again (the refusal is not remembered), and allowing it applies
      api.requestOrigins.mockResolvedValue(true);
      flow.applyTheme.mockImplementation(async (id: string) => ({ ok: true, themeId: id, regions: 0, strategy: "full", steppedDown: false, repairs: 0, samples: 3 }));
      await pick(root, "midnight");
      expect(api.requestOrigins).toHaveBeenCalledTimes(2);
      expect(checked(root)).toBe("midnight");
      expect(sites()![ORIGIN]!.plan.themeId).toBe("midnight");
    });

    it("edge: injection refused although the permission is there says the page can't be started on", async () => {
      flow.applyTheme.mockRejectedValue(new Error("The extensions gallery cannot be scripted."));
      const root = await mount();
      await pick(root, "midnight");
      expect(status(root)).toBe(S.edge.injectFailed);
      noRawText(root.textContent);
      expect(root.querySelector(".popup-head [role=status]")!.className).toContain("banner-error");
      expect(root.querySelector("fieldset.themes")!.getAttribute("aria-describedby")).toBe("popup-status");
      expect(document.getElementById("popup-status")).not.toBeNull();
    });

    it("edge: applier missing (the page never answers) says the page didn't answer", async () => {
      flow.applyTheme.mockResolvedValue(undefined);
      const root = await mount();
      await pick(root, "midnight");
      expect(status(root)).toBe(S.edge.noAnswer);
      noRawText(root.textContent);
    });

    it("edge: tab closed or navigated away during the apply says so and keeps nothing", async () => {
      flow.applyTheme.mockImplementation(async () => {
        api.queryActiveTab.mockResolvedValue({ id: 7, url: "https://other.example/x" });
        throw new Error("No tab with id: 7.");
      });
      const root = await mount();
      await pick(root, "midnight");
      expect(status(root)).toBe(S.edge.tabChanged);
      noRawText(root.textContent);
      expect(savedTheme()).not.toBe("midnight");
      expect(sites()?.[ORIGIN]).toBeUndefined();
      // the tab is gone altogether
      api.queryActiveTab.mockResolvedValue(undefined);
      await pick(root, "ocean");
      expect(status(root)).toBe(S.edge.tabChanged);
    });
  });

  describe("apply rolled back midway", () => {
    it("edge: failed apply leaves no stored themed state and no page change", async () => {
      store.set("settings", { theme: "ocean", blocklist: [] });
      const failed = { ok: false, reason: "invariants" };
      flow.applyTheme.mockResolvedValue(failed);
      const root = await mount();
      await pick(root, "midnight");
      // says the page is back to its original look, with what to do
      expect(status(root)).toBe(themeFailureMessage(failed));
      expect(status(root)).toContain("original look");
      noRawText(root.textContent);
      // nothing themed is stored: the choice, the site record and the pending intent are all taken back
      expect(savedTheme()).toBe("ocean");
      expect(sites()?.[ORIGIN]).toBeUndefined();
      expect(store.get("intent")).toBeUndefined();
      expect(api.setBadge).not.toHaveBeenCalledWith(7, "ON");
      expect(root.querySelector(".banner-success")).toBeNull();
      // the page is original, so no radio claims a theme is on, and nothing offers to keep one
      expect(checked(root)).toBeUndefined();
      expect(find(root, "Keep on this site")).toBeUndefined();
      // and the next pick works
      flow.applyTheme.mockImplementation(async (id: string) => ({ ok: true, themeId: id, regions: 0, strategy: "full", steppedDown: false, repairs: 0, samples: 3 }));
      await pick(root, "field");
      expect(checked(root)).toBe("field");
      expect(sites()![ORIGIN]!.plan.themeId).toBe("field");
    });

    it("edge: a failed apply on a remembered site puts the remembered theme's record back", async () => {
      const rec = { v: 1, plan: planFor("ocean"), fingerprint: { hash: "00000000", seq: "" }, provider: "builtin", model: "builtin", promptVersion: "7", savedAt: "2026-11-01T10:00:00.000Z", mode: "auto", blur: [], blurImages: false };
      store.set("sites", { [ORIGIN]: rec });
      flow.applyTheme.mockResolvedValue({ ok: false, reason: "error" });
      const root = await mount();
      await pick(root, "midnight");
      await flush();
      expect(sites()![ORIGIN]!.plan.themeId).toBe("ocean");
    });
  });

  describe("busy states always end", () => {
    it("edge: busy state always ends (a hung injection gives up with a message and enables the UI)", async () => {
      flow.applyTheme.mockImplementation(() => new Promise(() => undefined));
      const root = await mount();
      vi.useFakeTimers();
      await act(() => radio(root, "midnight").click());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      // while waiting: the clicked control is busy, the header says so, the others stay usable
      expect(radio(root, "midnight").getAttribute("aria-busy")).toBe("true");
      expect(root.querySelector("fieldset.themes")!.getAttribute("aria-busy")).toBe("true");
      expect(status(root)).toBe(S.popup.applying("Midnight"));
      expect(find(root, "Change my page")!.disabled).toBe(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(APPLY_TIMEOUT_MS + 50);
      });
      expect(status(root)).toBe(S.edge.timedOut);
      noRawText(root.textContent);
      expect(root.querySelector("fieldset.themes")!.hasAttribute("aria-busy")).toBe(false);
      expect(radio(root, "midnight").hasAttribute("aria-busy")).toBe(false);
      expect(find(root, "Change my page")!.disabled).toBe(false);
      // whatever the page got was taken off, and nothing themed is stored
      expect(api.runInPage.mock.calls.some((c) => c[1] === "restore")).toBe(true);
      expect(root.querySelectorAll('input[type="radio"]:disabled')).toHaveLength(0);
      vi.useRealTimers();
      await flush();
      expect(sites()?.[ORIGIN]).toBeUndefined();
    });

    it("edge: rapid clicks: the last one wins and the popup is never stuck", async () => {
      const done: Array<(r: unknown) => void> = [];
      flow.applyTheme.mockImplementation((id: string) => new Promise((resolve) => done.push(() => resolve({ ok: true, themeId: id, regions: 0, strategy: "full", steppedDown: false, repairs: 0, samples: 3 }))));
      const root = await mount();
      await act(() => radio(root, "midnight").click());
      await act(() => radio(root, "ocean").click());
      await act(() => radio(root, "field").click());
      for (let i = 0; i < 6; i++) {
        await act(async () => {
          done.splice(0).forEach((d) => d(undefined));
          await tick();
        });
      }
      await flush();
      expect(checked(root)).toBe("field");
      expect(flow.applyTheme.mock.calls.at(-1)![0]).toBe("field");
      expect(root.querySelector("fieldset.themes")!.hasAttribute("aria-busy")).toBe(false);
      expect(find(root, "Change my page")!.disabled).toBe(false);
    });

    it("edge: a Restore that never answers gives up with a message and the button stays on", async () => {
      flow.applyTheme.mockImplementation(async (id: string) => ({ ok: true, themeId: id, regions: 0, strategy: "full", steppedDown: false, repairs: 0, samples: 3 }));
      const root = await mount();
      await pick(root, "midnight");
      api.runInPage.mockImplementation((_t: number, m: string) => (m === "restore" ? new Promise(() => undefined) : Promise.resolve(true)));
      vi.useFakeTimers();
      await act(() => restoreButton(root).click());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      expect(restoreButton(root).textContent).toBe(S.popup.restoring);
      expect(restoreButton(root).getAttribute("aria-busy")).toBe("true");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RESTORE_TIMEOUT_MS + 50);
      });
      expect(status(root)).toBe(S.edge.restoreTimedOut);
      expect(restoreButton(root).textContent).toBe(S.popup.restore);
      expect(restoreButton(root).getAttribute("aria-disabled")).toBeNull();
      noRawText(root.textContent);
    });
  });

  describe("storage and restore failures", () => {
    it("edge: storage write failed says the choice may not stay, and the theme still applies", async () => {
      const set = api.storageSet.getMockImplementation()!;
      api.storageSet.mockImplementation(async (k: string, v: unknown) => {
        if (k === "settings") throw new Error("QUOTA_BYTES quota exceeded");
        return set(k, v);
      });
      const root = await mount();
      await pick(root, "midnight");
      expect(root.textContent).toContain(S.edge.saveFailed);
      noRawText(root.textContent);
      expect(root.querySelector(".banner-success")).not.toBeNull();
      expect(api.setBadge).toHaveBeenCalledWith(7, "ON");
    });

    it("edge: restore failed says so, keeps Restore enabled and does not pause", async () => {
      const root = await mount();
      await pick(root, "midnight");
      const was = api.runInPage.getMockImplementation();
      api.runInPage.mockImplementation(async (t: number, m: string, ...rest: unknown[]) => (m === "restore" ? undefined : was ? was(t, m, ...rest) : false));
      await act(() => restoreButton(root).click());
      await flush();
      expect(status(root)).toBe(S.popup.restoreFailed);
      noRawText(root.textContent);
      expect(restoreButton(root).getAttribute("aria-disabled")).toBeNull();
      expect(sites()![ORIGIN]!.paused).toBeUndefined();
    });
  });

  describe("copy", () => {
    const collect = (o: unknown, out: string[] = []): string[] => {
      if (typeof o === "string") out.push(o);
      else if (o && typeof o === "object") Object.values(o).forEach((v) => collect(v, out));
      return out;
    };
    const newKeys: string[] = [
      ...collect(en.edge),
      en.popup.restoring,
      en.popup.restoredShort,
      en.popup.nothingToRestore,
      en.popup.restoreFailed,
      en.popup.pickToResume,
      en.popup.choiceSaved,
      en.popup.applying("Midnight"),
    ];

    it("edge: strings contain no raw error text", () => {
      expect(newKeys.length).toBeGreaterThan(14);
      for (const text of newKeys) {
        expect(text, text).not.toMatch(/undefined|null|NaN|Error:|\[object|\bat \w+\.\w+\(|0x[0-9a-f]{4}/);
        expect(text, text).not.toMatch(/\b(plus|plans?|premium|paid|pro|account|subscri\w*|upgrade|pricing|trial)\b/i);
        expect(text.trim()).toBe(text);
        expect(text.length).toBeGreaterThan(5);
      }
      expect(S.fail.denied).not.toMatch(/undefined|null/);
    });

    it("edge: every edge line says what to do or what state the page is in, and names the product as the code does", () => {
      for (const text of collect(en.edge)) {
        if (text.startsWith(", so")) continue;
        expect(text).toMatch(/Skinly|This |The |Restore |Open|Reload|Couldn't/);
      }
      expect(en.app.name).toBe("Skinly AI");
    });
  });
});
