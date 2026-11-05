import { h, render } from "preact";
import { act } from "preact/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FlowHooks } from "../src/extension/flow.ts";

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

import { MSG, applyFailureMessage } from "../src/ai/messages.ts";
import { wireBackground } from "./helpers/popupBackground.ts";
import { planFor } from "./plan/helpers.ts";
import { BLOCKED_MESSAGE, Popup } from "../src/extension/popup/Popup.tsx";

const TAB = { id: 7, url: "https://example.org/a" };
const previewOutcome = (message?: string) => ({
  kind: "preview" as const,
  source: "ai" as const,
  plan: planFor("ocean"),
  baselineThemeId: "calm-light",
  fingerprint: { hash: "0123abcd", seq: "hnm" },
  providerId: "gemini",
  model: "m-1",
  ...(message ? { message } : {}),
});

const mount = async () => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  await act(() => render(h(Popup, {}), root));
  await act(() => new Promise<void>((r) => setTimeout(r, 0)));
  return root;
};
let bg = { settled: (): Promise<unknown> => Promise.resolve() };
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const flush = () =>
  act(async () => {
    await tick();
    await bg.settled();
    await tick();
  });
const find = (root: HTMLElement, label: string) => Array.from(root.querySelectorAll("button")).find((b) => b.textContent === label);
const click = async (root: HTMLElement, label: string) => {
  const btn = find(root, label);
  expect(btn, `button ${label}`).toBeDefined();
  await act(() => btn!.click());
  await flush();
};
const status = (root: HTMLElement) => root.querySelector('[role="status"]')!.textContent;

describe("popup", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    Object.values(api).forEach((f) => f.mockReset());
    Object.values(flow).forEach((f) => f.mockReset());
    store.clear();
    api.storageGet.mockImplementation(async (k: string) => store.get(k));
    api.storageSet.mockImplementation(async (k: string, v: unknown) => void store.set(k, v));
    api.setBadge.mockResolvedValue(undefined);
    api.requestOrigins.mockResolvedValue(true);
    api.removeOrigins.mockResolvedValue(true);
    api.registerAutoScript.mockResolvedValue(undefined);
    api.unregisterAutoScript.mockResolvedValue(undefined);
    api.queryActiveTab.mockResolvedValue(TAB);
    api.getCommands.mockResolvedValue([]);
    api.browserHints.mockReturnValue({ userAgent: "Chrome/130 Edg/130", brave: false });
    bg = wireBackground(api, store);
  });

  it("idle: shows the title, six themes plus Auto and the not-affiliated line, and calls nothing yet", async () => {
    const root = await mount();
    expect(root.textContent).toContain("Skinly AI");
    expect(root.textContent).toContain("Skinly AI is not affiliated with any website.");
    expect(root.querySelectorAll('input[type="radio"]')).toHaveLength(7);
    expect(find(root, "Change my page")).toBeDefined();
    expect(flow.runTransform).not.toHaveBeenCalled();
    expect(api.injectFile).not.toHaveBeenCalled();
  });

  it("saves the picked theme", async () => {
    const root = await mount();
    await act(() => root.querySelector<HTMLInputElement>('input[value="midnight"]')!.click());
    expect(api.storageSet).toHaveBeenCalledWith("settings", expect.objectContaining({ theme: "midnight" }));
  });

  it("T6: all 6 built-in themes are selectable and applicable from the popup logic, with no lock state anywhere", async () => {
    const root = await mount();
    expect(root.querySelectorAll('input[type="radio"]:disabled, [aria-disabled="true"]')).toHaveLength(0);
    for (const id of ["midnight", "ocean", "warm-paper", "high-contrast", "field", "calm-light"]) {
      await act(() => root.querySelector<HTMLInputElement>(`input[value="${id}"]`)!.click());
      expect(api.storageSet).toHaveBeenLastCalledWith("settings", expect.objectContaining({ theme: id }));
      expect(root.querySelector<HTMLInputElement>(`input[value="${id}"]`)!.checked).toBe(true);
    }
    expect(root.querySelectorAll(".theme-card.locked, .plus-mark")).toHaveLength(0);
    expect(root.textContent).not.toMatch(/(plus|premium|upgrade|unlock)/i);
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });

  it("restores the last saved theme from storage", async () => {
    store.set("settings", { theme: "ocean", blocklist: [] });
    const root = await mount();
    await flush();
    expect(root.querySelector<HTMLInputElement>('input[value="ocean"]')!.checked).toBe(true);
  });

  it("blocked: shows the blocked message when the pipeline blocks", async () => {
    flow.runTransform.mockResolvedValue({ kind: "blocked", reason: "internal", message: MSG.blocked });
    const root = await mount();
    await click(root, "Change my page");
    expect(status(root)).toBe(BLOCKED_MESSAGE);
  });

  it("blocked: shows the blocked message when the tab url is unknown, without calling the pipeline", async () => {
    api.queryActiveTab.mockResolvedValue({ id: 1, url: undefined });
    const root = await mount();
    await click(root, "Change my page");
    expect(status(root)).toBe(BLOCKED_MESSAGE);
    expect(flow.runTransform).not.toHaveBeenCalled();
  });

  it("working: shows the step, disables the buttons and can be cancelled", async () => {
    let signal: AbortSignal | undefined;
    let hooks: FlowHooks | undefined;
    flow.runTransform.mockImplementation((_t: number, _u: string, h2: FlowHooks, s: AbortSignal) => {
      hooks = h2;
      signal = s;
      return new Promise((resolve) => s.addEventListener("abort", () => resolve({ kind: "cancelled", themeId: "calm-light" })));
    });
    const root = await mount();
    await click(root, "Change my page");
    await act(() => hooks!.onStep("asking"));
    expect(status(root)).toContain("Asking the AI");
    expect(find(root, "Change my page")!.disabled).toBe(true);
    expect(find(root, "Restore original")!.disabled).toBe(true);
    await click(root, "Cancel");
    expect(signal!.aborted).toBe(true);
    expect(status(root)).toBe("Cancelled.");
  });

  it("layout: status line and the primary action come before the theme cards, and What gets sent is reachable", async () => {
    const root = await mount();
    const html = root.innerHTML;
    expect(html.indexOf('role="status"')).toBeLessThan(html.indexOf("Change my page"));
    expect(html.indexOf("Change my page")).toBeLessThan(html.indexOf('name="theme"'));
    expect(root.querySelector("details.sent summary")!.textContent).toBe("What gets sent");
    expect(root.querySelector("h1")!.textContent).toContain("Skinly AI");
  });

  it("working: shows the provider-busy detail from the pipeline", async () => {
    let hooks: FlowHooks | undefined;
    flow.runTransform.mockImplementation((_t: number, _u: string, h2: FlowHooks) => {
      hooks = h2;
      return new Promise(() => {});
    });
    const root = await mount();
    await click(root, "Change my page");
    await act(() => hooks!.onStep("asking", "Gemini is busy; trying Groq"));
    expect(status(root)).toBe("Gemini is busy; trying Groq");
  });

  describe("consent", () => {
    const req = { providerNames: ["Gemini"], payload: '{"v":1}' };
    const open = async () => {
      let answer: Promise<boolean> | undefined;
      let finish: ((o: unknown) => void) | undefined;
      flow.runTransform.mockImplementation((_t: number, _u: string, hooks: FlowHooks) => {
        const pending = hooks.askConsent(req);
        answer = pending;
        return new Promise((resolve) => {
          finish = resolve;
          void pending.then((ok) => resolve(ok ? previewOutcome() : { kind: "baseline", themeId: "calm-light", why: "consent-declined", message: MSG.declined }));
        });
      });
      const root = await mount();
      await click(root, "Change my page");
      return { root, answer: () => answer!, finish: () => finish };
    };

    it("shows the SPEC text with the provider name and the three buttons", async () => {
      const { root } = await open();
      expect(root.textContent).toContain("will send a small description of this page's layout");
      expect(root.textContent).toContain("to Gemini.");
      for (const b of ["Send", "Cancel", "Show what will be sent"]) expect(find(root, b)).toBeDefined();
    });

    it("shows the exact payload read-only on request", async () => {
      const { root } = await open();
      expect(root.querySelector("textarea")).toBeNull();
      await click(root, "Show what will be sent");
      const box = root.querySelector("textarea")!;
      expect(box.value).toBe(req.payload);
      expect(box.readOnly).toBe(true);
    });

    it("Send resolves true", async () => {
      const { root, answer } = await open();
      await click(root, "Send");
      expect(await answer()).toBe(true);
      expect(root.querySelector('section[aria-label="Preview"]')).not.toBeNull();
    });

    it("Cancel resolves false and keeps the built-in theme", async () => {
      const { root, answer } = await open();
      await click(root, "Cancel");
      expect(await answer()).toBe(false);
      await flush();
      expect(status(root)).toBe(MSG.declined);
    });
  });

  describe("preview", () => {
    it("one click asks for this origin only, first, and keeps the theme for the whole site; Undo and Try another stay", async () => {
      flow.runTransform.mockResolvedValue(previewOutcome());
      const root = await mount();
      await click(root, "Change my page");
      for (const b of ["Undo", "Try another"]) expect(find(root, b)).toBeDefined();
      expect(find(root, "Keep on this site")).toBeUndefined();
      expect(root.querySelectorAll('input[type="radio"]')).toHaveLength(7);
      expect(api.requestOrigins).toHaveBeenCalledWith(["https://example.org/*"]);
      expect(api.registerAutoScript).toHaveBeenCalledTimes(1);
      expect(api.setBadge).toHaveBeenCalledWith(7, "ON");
      expect(root.textContent).toContain("Every page of this site");
    });

    it("the permission request is made before the flow does anything else (inside the click)", async () => {
      const order: string[] = [];
      api.requestOrigins.mockImplementation(async () => {
        order.push("permission");
        return true;
      });
      flow.runTransform.mockImplementation(async () => {
        order.push("flow");
        return previewOutcome();
      });
      api.queryActiveTab.mockImplementation(async () => {
        order.push("tab");
        return TAB;
      });
      const root = await mount();
      order.length = 0;
      await click(root, "Change my page");
      expect(order.slice(0, 2)).toEqual(["permission", "tab"]);
    });

    it("a built-in theme applied without a key is kept too", async () => {
      flow.runTransform.mockResolvedValue({ kind: "baseline", themeId: "calm-light", why: "no-key", message: "Applied.", plan: planFor("calm-light"), fingerprint: { hash: "0123abcd", seq: "hnm" } });
      const root = await mount();
      await click(root, "Change my page");
      expect((store.get("sites") as Record<string, { provider: string; mode: string }>)["https://example.org"]).toMatchObject({ provider: "builtin", mode: "auto" });
    });

    it("stores no repair rules with the site: the page is not asked for any (D13)", async () => {
      flow.runTransform.mockResolvedValue(previewOutcome());
      const root = await mount();
      await click(root, "Change my page");
      const saved = (store.get("sites") as Record<string, Record<string, unknown>>)["https://example.org"]!;
      expect(saved).toBeDefined();
      expect("repairCss" in saved).toBe(false);
      expect(api.runInPage.mock.calls.some((c) => c[1] === "repairRules")).toBe(false);
    });

    it("a refused permission applies for this document only, says so in one line, and keeps a button to ask again", async () => {
      api.requestOrigins.mockResolvedValue(false);
      flow.runTransform.mockResolvedValue(previewOutcome());
      const root = await mount();
      await click(root, "Change my page");
      expect(root.textContent).toContain("Not kept: permission wasn't given. The theme lasts only until this page is reloaded.");
      expect(store.get("sites")).toBeUndefined();
      expect(api.registerAutoScript).not.toHaveBeenCalled();
      expect(find(root, "Keep on this site")).toBeDefined();
      api.requestOrigins.mockResolvedValue(true);
      await click(root, "Keep on this site");
      expect((store.get("sites") as Record<string, { mode: string }>)["https://example.org"]!.mode).toBe("auto");
    });

    it("shows the fallback message when a built-in theme replaced the AI plan", async () => {
      flow.runTransform.mockResolvedValue(previewOutcome(MSG.fallbackTheme));
      const root = await mount();
      await click(root, "Change my page");
      expect(root.textContent).toContain(MSG.fallbackTheme);
    });

    it("Undo restores the previous baseline theme", async () => {
      flow.runTransform.mockResolvedValue(previewOutcome());
      flow.applyTheme.mockResolvedValue({ ok: true });
      const root = await mount();
      await click(root, "Change my page");
      await click(root, "Undo");
      expect(flow.applyTheme).toHaveBeenCalledWith("calm-light");
      expect(status(root)).toBe("Back to the built-in theme.");
    });

    it("Try another runs the pipeline again", async () => {
      flow.runTransform.mockResolvedValue(previewOutcome());
      const root = await mount();
      await click(root, "Change my page");
      await click(root, "Try another");
      expect(flow.runTransform).toHaveBeenCalledTimes(2);
    });
  });

  describe("baseline messages", () => {
    it.each([
      ["no key", MSG.noKey],
      ["no-ai page", MSG.noAi],
      ["all failed", MSG.allFailed],
    ])("%s: shows the message and no preview controls", async (_n, message) => {
      flow.runTransform.mockResolvedValue({ kind: "baseline", themeId: "calm-light", why: "no-key", message });
      const root = await mount();
      await click(root, "Change my page");
      expect(status(root)).toBe(message);
      expect(find(root, "Keep")).toBeUndefined();
    });
  });

  describe("error", () => {
    it("shows the short message", async () => {
      flow.runTransform.mockResolvedValue({ kind: "error", errorKind: "auth", message: "Gemini rejected the key.", themeId: "calm-light" });
      const root = await mount();
      await click(root, "Change my page");
      expect(status(root)).toBe("Gemini rejected the key.");
    });

    it("shows a safe message when the flow throws", async () => {
      flow.runTransform.mockRejectedValue(new Error("secret detail"));
      const root = await mount();
      await click(root, "Change my page");
      expect(status(root)).toBe(applyFailureMessage(undefined));
      expect(status(root)).toContain("the browser didn't allow it");
      expect(root.textContent).not.toContain("secret detail");
    });
  });

  describe("per site", () => {
    const keep = async () => {
      flow.runTransform.mockResolvedValue(previewOutcome());
      const root = await mount();
      await click(root, "Change my page");
      return root;
    };
    const sites = () => store.get("sites") as Record<string, { mode: string; paused?: boolean }> | undefined;

    it("Change my page keeps the site automatically: one permission request, one registered script", async () => {
      const root = await keep();
      expect(api.requestOrigins).toHaveBeenCalledWith(["https://example.org/*"]);
      expect(api.registerAutoScript).toHaveBeenCalledTimes(1);
      expect(sites()!["https://example.org"]!.mode).toBe("auto");
      expect(find(root, "Pause on this site")).toBeDefined();
    });

    it("Restore pauses the site until the user applies again", async () => {
      api.runInPage.mockResolvedValue({ ok: true });
      const root = await keep();
      await click(root, "Restore original");
      expect(sites()!["https://example.org"]!.paused).toBe(true);
      expect(root.textContent).toContain("Paused on this site");
      expect(find(root, "Resume")).toBeDefined();
      expect(api.unregisterAutoScript).toHaveBeenCalled();
      api.registerAutoScript.mockClear();
      flow.runTransform.mockResolvedValue(previewOutcome());
      await click(root, "Change my page");
      expect(sites()!["https://example.org"]!.mode).toBe("auto");
      expect(sites()!["https://example.org"]!.paused).toBeUndefined();
      expect(api.registerAutoScript).toHaveBeenCalledTimes(1);
    });

    it("Pause marks the site paused; Forget removes record, script and permission", async () => {
      const root = await keep();
      await click(root, "Pause on this site");
      expect(sites()!["https://example.org"]!.paused).toBe(true);
      expect(find(root, "Pause on this site")).toBeUndefined();
      await click(root, "Forget this site");
      expect(sites()).toEqual({});
      expect(api.removeOrigins).toHaveBeenCalledWith(["https://example.org/*"]);
      expect(api.unregisterAutoScript).toHaveBeenCalled();
      expect(find(root, "Forget this site")).toBeUndefined();
    });
  });

  describe("calm states", () => {
    it("shows a success line with the theme and the number of readability fixes", async () => {
      flow.runTransform.mockResolvedValue({ kind: "baseline", themeId: "midnight", why: "no-key", message: "Applied.", fixes: 14 });
      const root = await mount();
      await click(root, "Change my page");
      expect(root.querySelector(".banner-success")!.textContent).toBe("Applied Midnight, 14 readability fixes");
      flow.runTransform.mockResolvedValue({ kind: "baseline", themeId: "ocean", why: "no-key", message: "Applied." });
      await click(root, "Change my page");
      expect(root.querySelector(".banner-success")!.textContent).toBe("Applied Ocean, no readability fixes needed");
    });

    it("information is neutral and only real errors are red", async () => {
      flow.runTransform.mockResolvedValue({ kind: "baseline", themeId: "ocean", why: "no-key", message: MSG.noKey });
      const root = await mount();
      await click(root, "Change my page");
      expect(root.querySelector(".popup-head [role=status]")!.className).toContain("banner-info");
      expect(root.querySelector(".banner-error")).toBeNull();
      flow.runTransform.mockResolvedValue({ kind: "error", errorKind: "network", message: "Couldn't reach the AI.", themeId: "ocean" });
      await click(root, "Change my page");
      expect(root.querySelector(".popup-head [role=status]")!.className).toContain("banner-error");
    });

    it("shows three stages while working, with the current one marked", async () => {
      let release: (v: unknown) => void = () => undefined;
      flow.runTransform.mockImplementation(async (_t: number, _u: string, hooks: { onStep(s: string): void }) => {
        hooks.onStep("analysing");
        return new Promise((r) => (release = r));
      });
      const root = await mount();
      await act(() => find(root, "Change my page")!.click());
      await flush();
      const items = Array.from(root.querySelectorAll("ol.stages li"));
      expect(items.map((i) => i.textContent)).toEqual(["Reading the page", "Checking readability", "Applying"]);
      expect(root.querySelector("ol.stages li[aria-current=step]")!.textContent).toBe("Reading the page");
      release({ kind: "cancelled", themeId: "calm-light" });
      await flush();
    });
  });

  it("Restore calls the page restore", async () => {
    api.runInPage.mockResolvedValue({ ok: true });
    const root = await mount();
    await click(root, "Restore original");
    expect(api.runInPage).toHaveBeenCalledWith(7, "restore", undefined, true);
    expect(status(root)).toBe("Original restored.");
  });
});
