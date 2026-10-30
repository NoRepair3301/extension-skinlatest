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
  browserHints: vi.fn(),
}));
vi.mock("../src/extension/api.ts", () => api);

const flow = vi.hoisted(() => ({ runTransform: vi.fn(), applyTheme: vi.fn() }));
vi.mock("../src/extension/flow.ts", () => ({
  runTransform: flow.runTransform,
  createPageClient: () => ({ applyTheme: flow.applyTheme }),
}));

import { MSG, applyFailureMessage } from "../src/ai/messages.ts";
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
  return root;
};
const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
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
  });

  it("idle: shows the title, five themes and the not-affiliated line, and calls nothing yet", async () => {
    const root = await mount();
    expect(root.textContent).toContain("Skinly AI");
    expect(root.textContent).toContain("Skinly AI is not affiliated with any website.");
    expect(root.querySelectorAll('input[type="radio"]')).toHaveLength(5);
    expect(find(root, "Change my page")).toBeDefined();
    expect(flow.runTransform).not.toHaveBeenCalled();
    expect(api.injectFile).not.toHaveBeenCalled();
  });

  it("saves the picked theme", async () => {
    const root = await mount();
    await act(() => root.querySelector<HTMLInputElement>('input[value="midnight"]')!.click());
    expect(api.storageSet).toHaveBeenCalledWith("settings", expect.objectContaining({ theme: "midnight" }));
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
    it("shows Keep, Undo and Try another; Keep clears the controls", async () => {
      flow.runTransform.mockResolvedValue(previewOutcome());
      const root = await mount();
      await click(root, "Change my page");
      for (const b of ["Keep", "Undo", "Try another"]) expect(find(root, b)).toBeDefined();
      expect(root.querySelectorAll('input[type="radio"]')).toHaveLength(5);
      await click(root, "Keep");
      expect(find(root, "Undo")).toBeUndefined();
      expect(api.setBadge).toHaveBeenCalledWith(7, "ON");
      await click(root, "Done");
      expect(status(root)).toBe("Kept.");
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
      await click(root, "Keep");
      return root;
    };
    const sites = () => store.get("sites") as Record<string, { mode: string }> | undefined;

    it("after Keep offers Remember and Always, and does nothing until clicked", async () => {
      const root = await keep();
      expect(find(root, "Remember this site")).toBeDefined();
      expect(find(root, "Always on this site")).toBeDefined();
      expect(sites()).toBeUndefined();
      expect(api.requestOrigins).not.toHaveBeenCalled();
    });

    it("Remember this site saves the origin only, with mode ask", async () => {
      const root = await keep();
      await click(root, "Remember this site");
      expect(Object.keys(sites()!)).toEqual(["https://example.org"]);
      expect(sites()!["https://example.org"]!.mode).toBe("ask");
      expect(api.requestOrigins).not.toHaveBeenCalled();
      expect(find(root, "Forget this site")).toBeDefined();
    });

    it("Always on this site requests only the active origin and registers the script", async () => {
      const root = await keep();
      await click(root, "Always on this site");
      expect(api.requestOrigins).toHaveBeenCalledWith(["https://example.org/*"]);
      expect(api.registerAutoScript).toHaveBeenCalledTimes(1);
      expect(sites()!["https://example.org"]!.mode).toBe("auto");
      expect(find(root, "Pause on this site")).toBeDefined();
    });

    it("a refused permission leaves nothing saved and says so", async () => {
      api.requestOrigins.mockResolvedValue(false);
      const root = await keep();
      await click(root, "Always on this site");
      expect(sites()).toBeUndefined();
      expect(status(root)).toContain("permission");
    });

    it("Pause switches to ask; Forget removes record, script and permission", async () => {
      const root = await keep();
      await click(root, "Always on this site");
      await click(root, "Pause on this site");
      expect(sites()!["https://example.org"]!.mode).toBe("ask");
      expect(find(root, "Pause on this site")).toBeUndefined();
      await click(root, "Forget this site");
      expect(sites()).toEqual({});
      expect(api.removeOrigins).toHaveBeenCalledWith(["https://example.org/*"]);
      expect(api.unregisterAutoScript).toHaveBeenCalled();
      expect(find(root, "Forget this site")).toBeUndefined();
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
