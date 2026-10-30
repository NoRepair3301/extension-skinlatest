import { h, render } from "preact";
import { act } from "preact/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FlowHooks } from "../src/extension/flow.ts";

const store = vi.hoisted(() => new Map<string, unknown>());
const api = vi.hoisted(() => ({
  queryActiveTab: vi.fn(), injectFile: vi.fn(), runInPage: vi.fn(), runTool: vi.fn(), captureVisible: vi.fn(), storageGet: vi.fn(), storageSet: vi.fn(),
  setBadge: vi.fn(), requestOrigins: vi.fn(), removeOrigins: vi.fn(), registerAutoScript: vi.fn(), unregisterAutoScript: vi.fn(), getCommands: vi.fn(),
  runScene: vi.fn(), browserHints: vi.fn(), extensionVersion: vi.fn(), clearAllStorage: vi.fn(), removeAllOrigins: vi.fn(),
}));
vi.mock("../src/extension/api.ts", () => api);
const flow = vi.hoisted(() => ({ runTransform: vi.fn(), applyTheme: vi.fn(), applyPlan: vi.fn() }));
vi.mock("../src/extension/flow.ts", () => ({ runTransform: flow.runTransform, createPageClient: () => ({ applyTheme: flow.applyTheme, applyPlan: flow.applyPlan }) }));
const keys = vi.hoisted(() => ({ keyStatus: vi.fn(), saveKey: vi.fn(), deleteKey: vi.fn(), testKey: vi.fn(), MASK: "••••••••" }));
vi.mock("../src/extension/keys.ts", () => keys);

import { Options } from "../src/extension/options/Options.tsx";
import { Popup } from "../src/extension/popup/Popup.tsx";
import { planFor } from "./plan/helpers.ts";

const TAB = { id: 7, url: "https://example.org/a" };
const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 20)));
const mountOf = async (view: unknown) => {
  document.body.innerHTML = "";
  const root = document.createElement("div");
  document.body.appendChild(root);
  await act(() => render(h(view as never, {}), root));
  await flush();
  return root;
};
const find = (root: HTMLElement, label: string) => Array.from(root.querySelectorAll("button")).find((b) => b.textContent === label);
const click = async (root: HTMLElement, label: string) => {
  const b = find(root, label);
  expect(b, `button ${label}`).toBeDefined();
  await act(() => { b!.click(); });
  await flush();
};

/** Accessible name the way a browser computes it for the cases we use: aria-label, aria-labelledby, a wrapping or `for` label, or the text. */
function nameOf(el: Element): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();
  const by = el.getAttribute("aria-labelledby");
  if (by) return by.split(/\s+/).map((id) => el.ownerDocument.getElementById(id)?.textContent ?? "").join(" ").trim();
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length > 0) return Array.from(labels).map((l) => l.textContent ?? "").join(" ").trim();
  return (el.textContent ?? "").trim();
}

/** One audit for every state: roles, names, order and structure. Returns problems. */
function audit(root: HTMLElement): string[] {
  const out: string[] = [];
  const named = root.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="tab"], [role="switch"], [role="progressbar"], dialog');
  for (const el of Array.from(named)) if (nameOf(el) === "") out.push(`no accessible name: <${el.tagName.toLowerCase()} ${el.getAttribute("type") ?? el.getAttribute("role") ?? ""}>`);
  for (const el of Array.from(root.querySelectorAll("[tabindex]"))) if (Number(el.getAttribute("tabindex")) > 0) out.push("positive tabindex breaks the tab order");
  for (const svg of Array.from(root.querySelectorAll("svg"))) if (!svg.getAttribute("aria-label") && svg.getAttribute("aria-hidden") !== "true") out.push("svg without a name or aria-hidden");
  for (const radio of Array.from(root.querySelectorAll('input[type="radio"]'))) if (!radio.closest("fieldset")?.querySelector("legend")) out.push("radio outside a fieldset with a legend");
  const ids = Array.from(root.querySelectorAll("[id]")).map((e) => e.id);
  if (new Set(ids).size !== ids.length) out.push("duplicate ids");
  if (root.querySelectorAll("h1").length !== 1) out.push("expected exactly one h1");
  for (const tablist of Array.from(root.querySelectorAll('[role="tablist"]'))) {
    const stops = Array.from(tablist.querySelectorAll('[role="tab"]')).filter((t) => t.getAttribute("tabindex") === "0");
    if (stops.length !== 1) out.push("a tablist needs exactly one tab stop");
  }
  for (const input of Array.from(root.querySelectorAll('input[type="password"], input[type="text"], input[type="search"]'))) if (nameOf(input) === "") out.push("text field without a label");
  return out;
}

const previewOutcome = () => ({ kind: "preview" as const, source: "ai" as const, plan: planFor("ocean"), baselineThemeId: "calm-light", fingerprint: { hash: "0123abcd", seq: "hnm" }, providerId: "gemini", model: "m-1" });

beforeEach(() => {
  document.body.innerHTML = "";
  Object.values(api).forEach((f) => f.mockReset());
  Object.values(flow).forEach((f) => f.mockReset());
  Object.values(keys).forEach((f) => typeof f === "function" && f.mockReset());
  store.clear();
  api.storageGet.mockImplementation(async (k: string) => store.get(k));
  api.storageSet.mockImplementation(async (k: string, v: unknown) => void store.set(k, v));
  for (const f of [api.setBadge, api.registerAutoScript, api.unregisterAutoScript]) f.mockResolvedValue(undefined);
  api.requestOrigins.mockResolvedValue(true);
  api.removeOrigins.mockResolvedValue(true);
  api.queryActiveTab.mockResolvedValue(TAB);
  api.getCommands.mockResolvedValue([{ name: "toggle-pet", description: "Pet", shortcut: "Alt+Shift+P" }]);
  api.browserHints.mockReturnValue({ userAgent: "Chrome/130 Edg/130", brave: false });
  api.extensionVersion.mockReturnValue("0.2.0");
  api.runScene.mockResolvedValue({ gutters: "ok", scene: "shown", asset: "none" });
  keys.keyStatus.mockResolvedValue({ gemini: false, groq: false });
});

describe("popup: every state renders and passes the accessibility audit", () => {
  it("idle", async () => {
    const root = await mountOf(Popup);
    expect(audit(root)).toEqual([]);
  });

  it("working (live status, a named spinner, Cancel)", async () => {
    let hooks: FlowHooks | undefined;
    flow.runTransform.mockImplementation((_t: number, _u: string, h2: FlowHooks) => { hooks = h2; return new Promise(() => {}); });
    const root = await mountOf(Popup);
    await click(root, "Change my page");
    await act(() => hooks!.onStep("asking"));
    expect(root.querySelector('[role="progressbar"]')).toBeTruthy();
    expect(root.querySelector('[role="status"]')!.textContent).toContain("Asking the AI");
    expect(audit(root)).toEqual([]);
  });

  it("consent", async () => {
    flow.runTransform.mockImplementation((_t: number, _u: string, hooks: FlowHooks) => { void hooks.askConsent({ providerNames: ["Gemini"], payload: "{}" }); return new Promise(() => {}); });
    const root = await mountOf(Popup);
    await click(root, "Change my page");
    expect(root.querySelector('section[aria-label="Consent"]')).toBeTruthy();
    await click(root, "Show what will be sent");
    expect(root.querySelector('textarea[aria-label="Payload"]')).toBeTruthy();
    expect(audit(root)).toEqual([]);
  });

  it("preview and kept", async () => {
    (api as unknown as { requestOrigins?: { mockResolvedValue(v: boolean): void } }).requestOrigins?.mockResolvedValue(true);
    flow.runTransform.mockResolvedValue(previewOutcome());
    const root = await mountOf(Popup);
    await click(root, "Change my page");
    expect(root.querySelector('section[aria-label="Preview"]')).toBeTruthy();
    expect(audit(root)).toEqual([]);
    await click(root, "Keep on this site");
    expect(root.querySelector('section[aria-label="This site"]')).toBeTruthy();
    expect(audit(root)).toEqual([]);
  });

  it("blocked, error and offline each give one line of status text and a way forward", async () => {
    for (const outcome of [
      { kind: "blocked" as const, message: "Skinly can't change this kind of page" },
      { kind: "error" as const, errorKind: "error", message: "Something went wrong. Try again." },
      { kind: "error" as const, errorKind: "network", message: "Couldn't reach the AI. Check your connection and try again." },
    ]) {
      flow.runTransform.mockResolvedValue(outcome);
      const root = await mountOf(Popup);
      await click(root, "Change my page");
      const status = root.querySelector('[role="status"]')!.textContent!;
      expect(status).toBe(outcome.message);
      expect(find(root, "Change my page")!.disabled).toBe(false);
      expect(audit(root)).toEqual([]);
    }
  });
});

describe("options: every tab passes the audit, with one tab stop and a returning focus", () => {
  it("all nine panels", async () => {
    store.set("settings", { welcomeDone: true });
    const root = await mountOf(Options);
    expect(audit(root)).toEqual([]);
    for (const tab of Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]'))) {
      await act(() => { tab.click(); });
      expect(audit(root), tab.textContent ?? "").toEqual([]);
    }
  });

  it("the welcome dialog is named, focuses inside and passes the audit", async () => {
    const root = await mountOf(Options);
    const dlg = root.querySelector("dialog")!;
    expect(nameOf(dlg)).toBe("Welcome to Skinly AI");
    expect(dlg.contains(document.activeElement)).toBe(true);
    expect(audit(root)).toEqual([]);
  });

  it("focus returns to the button that opened the erase dialog", async () => {
    store.set("settings", { welcomeDone: true });
    const root = await mountOf(Options);
    await act(() => { Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]')).find((t) => t.textContent === "Privacy")!.click(); });
    const opener = Array.from(root.querySelectorAll("button")).find((b) => b.textContent === "Erase all Skinly data")!;
    opener.focus();
    await act(() => { opener.click(); });
    expect(root.querySelector("dialog")!.contains(document.activeElement)).toBe(true);
    await act(() => { Array.from(root.querySelectorAll<HTMLElement>("dialog button")).find((b) => b.textContent === "Cancel")!.click(); });
    expect(document.activeElement).toBe(opener);
  });

  it("keyboard: Tab order is the document order (no positive tabindex) and the tab list is one stop", async () => {
    store.set("settings", { welcomeDone: true });
    const root = await mountOf(Options);
    const tabs = Array.from(root.querySelectorAll('[role="tab"]'));
    expect(tabs.filter((t) => t.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(root.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])')).toHaveLength(0);
  });
});
