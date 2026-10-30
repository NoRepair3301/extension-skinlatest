import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageBlur, PAGE_BLUR_HOST, PAGE_BLUR_Z } from "../../src/features/blur/page.ts";
import { safeScreenshot } from "../../src/features/blur/screenshot.ts";
import { createPageTools } from "../../src/extension/pageTools.ts";
import { adoptedCss, installSheets } from "../helpers/sheets.ts";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const hostOf = () => document.querySelector<HTMLElement>(`[data-skinly-ui="${PAGE_BLUR_HOST}"]`);

let uninstall: () => void = () => undefined;
beforeEach(() => {
  uninstall = installSheets();
  document.body.innerHTML = '<main><a href="/x">x</a><button>b</button></main>';
});
afterEach(() => {
  uninstall();
  hostOf()?.remove();
  vi.useRealTimers();
});

describe("whole-page blur overlay", () => {
  it("is one fixed full-viewport host in a shadow root with the maximum z-index and no pointer events", () => {
    const b = createPageBlur(document);
    expect(hostOf()).toBeNull();
    b.on();
    const host = hostOf()!;
    expect(host).not.toBeNull();
    expect(host.parentElement).toBe(document.documentElement);
    expect(host.style.getPropertyValue("position")).toBe("fixed");
    for (const side of ["top", "left", "right", "bottom"]) expect(host.style.getPropertyValue(side)).toBe("0px");
    expect(host.style.getPropertyValue("z-index")).toBe(String(PAGE_BLUR_Z));
    expect(PAGE_BLUR_Z).toBe(2147483647);
    expect(host.style.getPropertyValue("pointer-events")).toBe("none");
    const css = adoptedCss(host.shadowRoot);
    expect(css).toContain("backdrop-filter:blur(12px)");
    expect(css).toMatch(/\.veil\{[^}]*pointer-events:none/);
    b.off();
  });

  it("has exactly one small keyboard-reachable Unblur button, the only part that takes the pointer", () => {
    const onUnblur = vi.fn();
    const b = createPageBlur(document, { onUnblur });
    b.on();
    const root = hostOf()!.shadowRoot!;
    const buttons = root.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    const button = buttons[0]!;
    expect(button.textContent).toBe("Unblur");
    expect(button.getAttribute("aria-label")).toBeTruthy();
    expect(button.disabled).toBe(false);
    expect(button.tabIndex).toBeGreaterThanOrEqual(0);
    expect(adoptedCss(root)).toMatch(/button\{[^}]*pointer-events:auto/);
    button.dispatchEvent(new MouseEvent("click"));
    expect(hostOf()).toBeNull();
    expect(b.isOn()).toBe(false);
    expect(onUnblur).toHaveBeenCalledTimes(1);
  });

  it("on, off and toggle are idempotent and leave no host behind", () => {
    const b = createPageBlur(document);
    b.on();
    b.on();
    expect(document.querySelectorAll(`[data-skinly-ui="${PAGE_BLUR_HOST}"]`)).toHaveLength(1);
    b.off();
    b.off();
    expect(hostOf()).toBeNull();
    expect(b.toggle()).toBe(true);
    expect(b.toggle()).toBe(false);
    expect(hostOf()).toBeNull();
  });

  it("does not touch the page's own nodes", () => {
    const before = document.body.innerHTML;
    const b = createPageBlur(document);
    b.on();
    expect(document.body.innerHTML).toBe(before);
    b.off();
    expect(document.body.innerHTML).toBe(before);
  });

  it("is re-attached when the page removes it, within the bounded observer's limits", async () => {
    vi.useFakeTimers();
    const b = createPageBlur(document);
    b.on();
    for (let i = 0; i < 5; i++) {
      hostOf()!.remove();
      await vi.advanceTimersByTimeAsync(400);
      expect(hostOf(), `removal ${i + 1}`).not.toBeNull();
    }
    // Sixth removal inside the same minute: the observer is bounded (SPEC 5), so it waits for the window to pass.
    hostOf()!.remove();
    await vi.advanceTimersByTimeAsync(400);
    expect(hostOf()).toBeNull();
    await vi.advanceTimersByTimeAsync(61_000);
    document.body.appendChild(document.createElement("i")); // any later mutation wakes the observer
    await vi.advanceTimersByTimeAsync(400);
    expect(hostOf()).not.toBeNull();
    b.off();
    expect(hostOf()).toBeNull();
  });

  it("off stops the observer: a removed host is not put back", async () => {
    vi.useFakeTimers();
    const b = createPageBlur(document);
    b.on();
    b.off();
    document.body.appendChild(document.createElement("i"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(hostOf()).toBeNull();
  });
});

describe("page tools", () => {
  const tools = () => createPageTools(document, { add: () => ({ remove: () => undefined }) });

  it("blurPage turns the veil on, off and toggles; the state says so; restore removes it", () => {
    const t = tools();
    expect(t.blurState().page).toBe(false);
    expect(t.blurPage(true).page).toBe(true);
    expect(hostOf()).not.toBeNull();
    expect(t.blurPage(false).page).toBe(false);
    expect(hostOf()).toBeNull();
    expect(t.blurPage().page).toBe(true);
    expect(t.blurPage().page).toBe(false);
    t.blurPage(true);
    t.restore();
    expect(hostOf()).toBeNull();
    expect(t.blurState().page).toBe(false);
  });
});

describe("safe screenshot with the whole page blurred", () => {
  it("still captures, restores the previous Share mode, and leaves the veil on", async () => {
    const t = createPageTools(document, { add: () => ({ remove: () => undefined }) });
    t.blurPage(true);
    let share = false;
    const capture = vi.fn(async () => PNG);
    const r = await safeScreenshot({
      getShare: async () => share,
      setShare: async (on) => ((share = on), true),
      capture,
      now: () => new Date(2026, 9, 30, 12, 0, 0),
    });
    expect(r.ok).toBe(true);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(share).toBe(false);
    expect(t.blurState().page).toBe(true);
    expect(hostOf()).not.toBeNull();
    t.restore();
  });

  it("makes no network call", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const t = createPageTools(document, { add: () => ({ remove: () => undefined }) });
    t.blurPage(true);
    await safeScreenshot({ getShare: async () => true, setShare: async () => true, capture: async () => PNG, now: () => new Date() });
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    t.restore();
  });
});
