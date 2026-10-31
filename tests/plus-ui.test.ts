import { h, render } from "preact";
import { act } from "preact/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, unknown>());
const api = vi.hoisted(() => ({
  queryActiveTab: vi.fn(), injectFile: vi.fn(), runInPage: vi.fn(), runTool: vi.fn(), captureVisible: vi.fn(), storageGet: vi.fn(), storageSet: vi.fn(), storageRemove: vi.fn(),
  setBadge: vi.fn(), requestOrigins: vi.fn(), removeOrigins: vi.fn(), registerAutoScript: vi.fn(), unregisterAutoScript: vi.fn(), getCommands: vi.fn(), hasOrigins: vi.fn(),
  runScene: vi.fn(), browserHints: vi.fn(), extensionVersion: vi.fn(), clearAllStorage: vi.fn(), removeAllOrigins: vi.fn(), openOptionsPage: vi.fn(), registeredScripts: vi.fn(),
}));
vi.mock("../src/extension/api.ts", () => api);
const flow = vi.hoisted(() => ({ runTransform: vi.fn(), applyTheme: vi.fn(), applyPlan: vi.fn() }));
vi.mock("../src/extension/flow.ts", () => ({ runTransform: flow.runTransform, createPageClient: () => ({ applyTheme: flow.applyTheme, applyPlan: flow.applyPlan }) }));
const keys = vi.hoisted(() => ({ keyStatus: vi.fn(), saveKey: vi.fn(), deleteKey: vi.fn(), testKey: vi.fn(), MASK: "••••••••" }));
vi.mock("../src/extension/keys.ts", () => keys);

import { parseConfig, type BackendConfig } from "../src/backend/config.ts";
import { PlanAccount, formatPrice } from "../src/extension/options/PlanAccount.tsx";
import { Options } from "../src/extension/options/Options.tsx";
import { Popup } from "../src/extension/popup/Popup.tsx";
import { PlusDialog } from "../src/extension/popup/PlusDialog.tsx";
import { S } from "../src/ui/strings.ts";
import { signEntitlement } from "../backend/supabase/functions/_shared/token.ts";
import { keypair, USER_A } from "./backend/helpers.ts";

const P = S.plus;
const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 20)));
const mount = async (node: unknown) => {
  document.body.innerHTML = "";
  const root = document.createElement("div");
  document.body.appendChild(root);
  await act(() => render(node as never, root));
  await flush();
  return root;
};
const buttons = (root: ParentNode) => Array.from(root.querySelectorAll("button"));
const button = (root: ParentNode, label: string) => buttons(root).find((b) => b.textContent === label);
const click = async (root: ParentNode, label: string) => {
  const b = button(root, label);
  expect(b, `button ${label}`).toBeDefined();
  await act(() => b!.click());
  await flush();
};
const type = async (input: HTMLInputElement, value: string) => {
  await act(() => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
/** The accessibility checks used for the Plus screens: every control has a name, inputs have labels, dialogs are labelled and modal. */
function audit(root: ParentNode): string[] {
  const out: string[] = [];
  for (const el of Array.from(root.querySelectorAll("button, input, dialog"))) {
    const labels = (el as HTMLInputElement).labels;
    const by = el.getAttribute("aria-labelledby");
    const name = el.getAttribute("aria-label") ?? (by ? document.getElementById(by)?.textContent : undefined) ?? (labels && labels.length ? labels[0]!.textContent : el.textContent);
    if (!name || name.trim() === "") out.push(`no name: ${el.tagName}`);
  }
  for (const d of Array.from(root.querySelectorAll("dialog"))) if (d.getAttribute("aria-modal") !== "true") out.push("dialog not modal");
  return out;
}

let k: Awaited<ReturnType<typeof keypair>>;
let cfg: BackendConfig;
const NOW = Date.now();

/** A scripted Supabase: OTP, verify, get-entitlement, plans, checkout, logout, delete. Records what was sent. */
function fakeServer(plan: "free" | "plus") {
  const sent: string[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    const path = url.replace(cfg.url, "");
    sent.push(`${init.method} ${path}`);
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
    if (path === "/auth/v1/otp") return json({});
    if (path === "/auth/v1/verify") return json({ access_token: "access-token-0123456789", refresh_token: "refresh-token-0123456789", expires_in: 3600, user: { id: USER_A, email: "a@example.test" } });
    if (path.startsWith("/rest/v1/plans")) return json([{ id: "plus-month", name: "Plus", interval: "month", price_minor: 300, currency: "EUR" }]);
    if (path === "/functions/v1/get-entitlement") return json({ token: await signEntitlement({ plan, sub: USER_A }, k.priv, k.kid, Math.floor(NOW / 1000)), plan, status: plan === "plus" ? "active" : "none", renewsAt: plan === "plus" ? Math.floor(NOW / 1000) + 30 * 86400 : null });
    if (path === "/functions/v1/create-checkout") return json({ url: "https://pay.example/checkout/1" });
    if (path === "/auth/v1/logout") return new Response(null, { status: 204 });
    if (path === "/functions/v1/delete-account") return json({ ok: true });
    return json({}, 404);
  };
  return { sent, deps: { fetch, online: () => true } };
}

beforeEach(async () => {
  k ??= await keypair();
  cfg = parseConfig({ VITE_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", VITE_SUPABASE_ANON_KEY: "sb_publishable_abcdefghijklmnop", VITE_ENTITLEMENT_PUBKEY: k.spkiB64 })!;
  Object.values(api).forEach((f) => f.mockReset());
  Object.values(flow).forEach((f) => f.mockReset());
  Object.values(keys).forEach((f) => typeof f === "function" && f.mockReset());
  store.clear();
  api.storageGet.mockImplementation(async (key: string) => store.get(key));
  api.storageSet.mockImplementation(async (key: string, v: unknown) => void store.set(key, JSON.parse(JSON.stringify(v))));
  api.storageRemove.mockImplementation(async (key: string) => void store.delete(key));
  for (const f of [api.setBadge, api.registerAutoScript, api.unregisterAutoScript, api.openOptionsPage]) f.mockResolvedValue(undefined);
  api.queryActiveTab.mockResolvedValue({ id: 7, url: "https://example.org/a" });
  api.getCommands.mockResolvedValue([]);
  api.hasOrigins.mockResolvedValue(false);
  api.registeredScripts.mockResolvedValue([]);
  api.browserHints.mockReturnValue({ userAgent: "Chrome/130", brave: false });
  api.extensionVersion.mockReturnValue("0.3.0");
  keys.keyStatus.mockResolvedValue({ gemini: false, groq: false });
});

describe("Settings, Plan and account (B5)", () => {
  it("a build without Plus config says so in one line and offers nothing else", async () => {
    const root = await mount(h(PlanAccount, { cfg: null }));
    expect(root.textContent).toContain(P.unavailable);
    expect(buttons(root)).toHaveLength(0);
  });

  it("sign in by code, see Plus with its renewal date, refresh, manage, sign out; every step has one plain line and passes the audit", async () => {
    const s = fakeServer("plus");
    const root = await mount(h(PlanAccount, { cfg, deps: s.deps }));
    expect(root.textContent).toContain(P.signedOutLine);
    expect(root.textContent).toContain(P.price(formatPrice({ priceMinor: 300, currency: "EUR" }), "month"));
    expect(audit(root)).toEqual([]);
    await type(root.querySelector('input[type="email"]')!, "a@example.test");
    await click(root, P.sendCode);
    expect(root.textContent).toContain(P.codeSent);
    await type(root.querySelector('input[autocomplete="one-time-code"]')!, "123456");
    expect(audit(root)).toEqual([]);
    await click(root, P.verify);
    expect(root.textContent).toContain(P.signedInAs("a@example.test"));
    expect(root.textContent).toContain(P.statusLine.active);
    expect(root.textContent).toMatch(/Renews or ends on/);
    expect(button(root, P.upgrade)).toBeUndefined();
    await click(root, P.manage);
    expect(root.textContent).toContain(P.manageLine);
    await click(root, P.refresh);
    expect(root.textContent).toContain(P.refreshed);
    expect(audit(root)).toEqual([]);
    await click(root, P.signOut);
    expect(root.textContent).toContain(P.signedOut);
    expect(store.has("auth")).toBe(false);
    // nothing page-related ever went to the server
    expect(s.sent.join("\n")).not.toMatch(/example\.org|sites|keys/);
  });

  it("Free account: Upgrade opens the server's checkout link in a new tab; Delete account asks in a modal dialog first", async () => {
    const s = fakeServer("free");
    const opened: string[] = [];
    store.set("auth", { v: 1, access: "access-token-0123456789", refresh: "refresh-token-0123456789", expiresAt: NOW + 3600_000, userId: USER_A, email: "a@example.test" });
    const root = await mount(h(PlanAccount, { cfg, deps: s.deps, openLink: (u: string) => void opened.push(u) }));
    expect(root.textContent).toContain(P.statusLine.none);
    await click(root, P.upgrade);
    expect(opened).toEqual(["https://pay.example/checkout/1"]);
    expect(root.textContent).toContain(P.checkoutOpened);
    await click(root, P.deleteAccount);
    const dialog = root.querySelector("dialog")!;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain(P.deleteBody);
    expect(audit(root)).toEqual([]);
    await click(dialog, P.deleteCancel);
    expect(root.querySelector("dialog")).toBeNull();
    expect(s.sent).not.toContain("POST /functions/v1/delete-account");
    await click(root, P.deleteAccount);
    await click(root.querySelector("dialog")!, P.deleteConfirm);
    expect(s.sent).toContain("POST /functions/v1/delete-account");
    expect(root.textContent).toContain(P.deleted);
    expect(store.has("auth")).toBe(false);
  });

  it("offline, a wrong code and a server error each give their one line", async () => {
    const s = fakeServer("free");
    const offline = await mount(h(PlanAccount, { cfg, deps: { ...s.deps, online: () => false } }));
    await type(offline.querySelector('input[type="email"]')!, "a@example.test");
    await click(offline, P.sendCode);
    expect(offline.textContent).toContain(P.errors.offline);
    const wrong = { ...s.deps, fetch: async (u: string, i: RequestInit) => (u.endsWith("/auth/v1/verify") ? new Response("{}", { status: 400 }) : s.deps.fetch(u, i)) };
    const root = await mount(h(PlanAccount, { cfg, deps: wrong }));
    await type(root.querySelector('input[type="email"]')!, "a@example.test");
    await click(root, P.sendCode);
    await type(root.querySelector('input[autocomplete="one-time-code"]')!, "000000");
    await click(root, P.verify);
    expect(root.textContent).toContain(P.errors.auth);
    const down = { ...s.deps, fetch: async () => new Response("{}", { status: 500 }) };
    const r3 = await mount(h(PlanAccount, { cfg, deps: down }));
    await type(r3.querySelector('input[type="email"]')!, "a@example.test");
    await click(r3, P.sendCode);
    expect(r3.textContent).toContain(P.errors.server);
  });

  it("My assets shows a calm locked state on Free (files stay), and the full tab with Plus", async () => {
    store.set("assets", [{ id: "0a1b2c3d" }]);
    const root = await mount(h(Options, {}));
    const panel = root.querySelector("#panel-assets")!;
    expect(panel.textContent).toContain(P.assetsLocked);
    expect(store.get("assets")).toEqual([{ id: "0a1b2c3d" }]);
    expect(audit(panel)).toEqual([]);
    store.set("plan", { v: 1, plan: "plus", until: NOW + 86400_000 });
    const plus = await mount(h(Options, {}));
    expect(plus.querySelector("#panel-assets")!.textContent).not.toContain(P.assetsLocked);
  });
});

describe("popup: locked themes and the Plus dialog (B5)", () => {
  it("Free: Ocean, Warm paper and Field carry a small Plus mark; choosing one opens the dialog and changes nothing; Stay on Free closes it", async () => {
    const root = await mount(h(Popup, {}));
    const marks = Array.from(root.querySelectorAll(".theme-card.locked .theme-name")).map((n) => n.textContent);
    expect(marks).toEqual(["Ocean", "Warm paper", "Field"]);
    expect(root.querySelectorAll(".plus-mark")).toHaveLength(3);
    const ocean = root.querySelector<HTMLInputElement>('input[value="ocean"]')!;
    // the radio's accessible name says it is part of Plus
    expect(Array.from(ocean.labels!).map((l) => l.textContent).join(" ")).toContain("Plus");
    await act(() => ocean.click());
    await flush();
    const dialog = root.querySelector("dialog")!;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain(P.lockedTheme("Ocean"));
    expect(dialog.textContent).toContain(P.stayFree);
    expect(audit(root)).toEqual([]);
    expect(api.storageSet).not.toHaveBeenCalledWith("settings", expect.objectContaining({ theme: "ocean" }));
    await click(dialog, P.stayFree);
    expect(root.querySelector("dialog")).toBeNull();
  });

  it("Plus: no marks, every theme can be chosen", async () => {
    store.set("plan", { v: 1, plan: "plus", until: NOW + 86400_000 });
    const root = await mount(h(Popup, {}));
    expect(root.querySelectorAll(".plus-mark")).toHaveLength(0);
    await act(() => root.querySelector<HTMLInputElement>('input[value="field"]')!.click());
    await flush();
    expect(api.storageSet).toHaveBeenCalledWith("settings", expect.objectContaining({ theme: "field" }));
  });

  it("an expired plan flag counts as Free", async () => {
    store.set("plan", { v: 1, plan: "plus", until: NOW - 1 });
    const root = await mount(h(Popup, {}));
    expect(root.querySelectorAll(".plus-mark")).toHaveLength(3);
  });

  it("the dialog shows the server price, how to cancel, and a plain Stay on Free; without a build config it says Plus is not available", async () => {
    const s = fakeServer("free");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((u, i) => s.deps.fetch(String(u), i ?? {}));
    const root = await mount(h(PlusDialog, { what: "Ocean", onClose: () => undefined, cfg }));
    expect(root.textContent).toContain(P.price(formatPrice({ priceMinor: 300, currency: "EUR" }), "month"));
    expect(root.textContent).toContain(P.cancel);
    expect(button(root, P.stayFree)).toBeDefined();
    expect(audit(root)).toEqual([]);
    fetchSpy.mockRestore();
    const none = await mount(h(PlusDialog, { what: "Ocean", onClose: () => undefined, cfg: null }));
    expect(none.textContent).toContain(P.unavailable);
    expect(button(none, P.seePlans)).toBeUndefined();
  });
});
