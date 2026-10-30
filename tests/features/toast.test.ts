import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST } from "../../src/ai/messages.ts";
import { browserToasterEnv, createToaster, TOAST_HOST, TOAST_MS } from "../../src/features/toast/toast.ts";

const hostOf = () => document.querySelector<HTMLElement>(`[data-skinly-ui="${TOAST_HOST}"]`);

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "<main><a href='/x'>x</a></main>";
});
afterEach(() => {
  hostOf()?.remove();
  vi.useRealTimers();
});

describe("toast", () => {
  it("shows the text in an extension-owned shadow-root host for two seconds, then removes it", async () => {
    const t = createToaster(browserToasterEnv(window));
    t.show(TOAST.themeApplied);
    const host = hostOf()!;
    expect(host).not.toBeNull();
    expect(t.visible()).toBe(true);
    const box = host.shadowRoot!.querySelector("[role=status]")!;
    expect(box.textContent).toBe("Skinly: theme applied");
    expect(box.getAttribute("aria-live")).toBe("polite");
    expect(TOAST_MS).toBe(2000);
    await vi.advanceTimersByTimeAsync(1999);
    expect(hostOf()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2);
    expect(hostOf()).toBeNull();
    expect(t.visible()).toBe(false);
  });

  it("ignores the pointer and never takes focus", () => {
    createToaster(browserToasterEnv(window)).show(TOAST.restored);
    const host = hostOf()!;
    expect(host.style.getPropertyValue("pointer-events")).toBe("none");
    expect(host.shadowRoot!.querySelectorAll("button, a, input, [tabindex]")).toHaveLength(0);
    expect(document.activeElement).toBe(document.body);
  });

  it("a new toast replaces the one still showing and restarts the two seconds", async () => {
    const t = createToaster(browserToasterEnv(window));
    t.show(TOAST.blurOn);
    await vi.advanceTimersByTimeAsync(1500);
    t.show(TOAST.blurOff);
    expect(document.querySelectorAll(`[data-skinly-ui="${TOAST_HOST}"]`)).toHaveLength(1);
    expect(hostOf()!.shadowRoot!.querySelector("[role=status]")!.textContent).toBe("Skinly: blur off");
    await vi.advanceTimersByTimeAsync(1500);
    expect(hostOf()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(600);
    expect(hostOf()).toBeNull();
  });

  it("leaves the page's own nodes alone, uses no network and no storage", async () => {
    const before = document.body.innerHTML;
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const t = createToaster(browserToasterEnv(window));
    t.show(TOAST.paletteOpen);
    expect(document.body.innerHTML).toBe(before);
    await vi.advanceTimersByTimeAsync(2100);
    expect(f).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("the fixed messages are the ones the commands promise", () => {
    expect(TOAST).toMatchObject({
      themeApplied: "Skinly: theme applied",
      restored: "Skinly: restored",
      blurOn: "Skinly: blur on",
      blocked: "Skinly: blocked page",
    });
  });
});
