import { h, render } from "preact";
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import { Banner, Button, Card, Dialog, EmptyState, Select, Spinner, TabPanel, Tabs, Toast, Toggle, Tooltip } from "../../src/ui/components.tsx";
import { UI_PAIRS, applyUiTheme, pairRatio, uiRoles } from "../../src/ui/theme.ts";
import { BUILTIN_THEME_IDS } from "../../src/themes/index.ts";
import { readFileSync } from "node:fs";

const mount = async (vnode: unknown) => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  await act(() => render(vnode as never, root));
  return root;
};
const key = (el: Element, k: string, extra: KeyboardEventInit = {}) => act(() => { el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...extra })); });

describe("ui components", () => {
  it("Button has a name, a type and three kinds", async () => {
    const onClick = vi.fn();
    const root = await mount(h("div", null, h(Button, { kind: "primary", onClick }, "Go"), h(Button, { kind: "quiet" }, "Later"), h(Button, {}, "Other")));
    const [a, b, c] = Array.from(root.querySelectorAll("button"));
    expect(a!.className).toContain("ui-btn-primary");
    expect(b!.className).toContain("ui-btn-quiet");
    expect(c!.className).toBe("ui-btn");
    expect(a!.getAttribute("type")).toBe("button");
    await act(() => { a!.click(); });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("Toggle is a labelled switch that follows the keyboard-native checkbox", async () => {
    const onChange = vi.fn();
    const root = await mount(h(Toggle, { label: "Pet", checked: false, onChange }));
    const input = root.querySelector("input")!;
    expect(input.getAttribute("role")).toBe("switch");
    expect(root.querySelector("label")!.textContent).toBe("Pet");
    await act(() => { input.click(); });
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("Select is labelled and reports the chosen value", async () => {
    const onChange = vi.fn();
    const root = await mount(h(Select, { label: "Size", value: "a", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }], onChange }));
    const sel = root.querySelector("select")!;
    expect(root.querySelector("label")!.textContent).toContain("Size");
    sel.value = "b";
    await act(() => { sel.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("Card is a named region", async () => {
    const root = await mount(h(Card, { title: "Theme" }, "x"));
    const sec = root.querySelector("section")!;
    expect(root.querySelector("#" + CSS.escape(sec.getAttribute("aria-labelledby")!))!.textContent).toBe("Theme");
  });

  it("Tabs: roles, one tab stop, arrows, Home and End", async () => {
    const tabs = [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }];
    let sel = "a";
    const view = () => h("div", null, h(Tabs, { label: "Sections", tabs, selected: sel, onSelect: (id: string) => { sel = id; } }), h(TabPanel, { id: "a", selected: sel }, "panel a"), h(TabPanel, { id: "b", selected: sel }, "panel b"));
    const root = await mount(view());
    const rerender = () => act(() => render(view() as never, root));
    const list = root.querySelector('[role="tablist"]')!;
    expect(list.getAttribute("aria-label")).toBe("Sections");
    expect(Array.from(root.querySelectorAll('[role="tab"]')).map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    await key(root.querySelectorAll('[role="tab"]')[0]!, "ArrowRight");
    await rerender();
    expect(sel).toBe("b");
    expect(root.querySelector('[role="tabpanel"]')!.textContent).toBe("panel b");
    await key(root.querySelectorAll('[role="tab"]')[1]!, "End");
    expect(sel).toBe("c");
    await key(root.querySelectorAll('[role="tab"]')[2]!, "ArrowRight");
    expect(sel).toBe("a");
    await key(root.querySelectorAll('[role="tab"]')[0]!, "ArrowLeft");
    expect(sel).toBe("c");
  });

  it("Toast is a polite live region and clears itself", async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const root = await mount(h(Toast, { message: "Saved", onDone: done }));
    expect(root.querySelector('[aria-live="polite"]')!.textContent).toBe("Saved");
    await act(() => { vi.advanceTimersByTime(2000); });
    expect(done).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("Banner: errors are alerts, others are status", async () => {
    const root = await mount(h("div", null, h(Banner, { tone: "error" }, "bad"), h(Banner, {}, "fyi")));
    expect(root.querySelector('[role="alert"]')!.textContent).toBe("bad");
    expect(root.querySelector('[role="status"]')!.textContent).toBe("fyi");
  });

  it("EmptyState, Spinner and Tooltip carry accessible text", async () => {
    const root = await mount(h("div", null, h(EmptyState, { title: "No sites" }, "Nothing yet."), h(Spinner, { label: "Working" }), h(Tooltip, { text: "Help text" }, h("button", { type: "button" }, "?"))));
    expect(root.querySelector("h2")!.textContent).toBe("No sites");
    expect(root.querySelector('[role="progressbar"]')!.getAttribute("aria-label")).toBe("Working");
    const tip = root.querySelector('[role="tooltip"]')!;
    expect(root.querySelector(".ui-tip")!.getAttribute("aria-describedby")).toBe(tip.id);
  });

  it("Dialog: named, focuses inside, traps Tab, closes on Escape, returns focus", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    const root = await mount(h(Dialog, { title: "Erase?", onClose }, h("button", { type: "button" }, "Cancel"), h("button", { type: "button" }, "Erase")));
    const dlg = root.querySelector("dialog")!;
    expect(dlg.getAttribute("aria-labelledby")).toBeTruthy();
    const [cancel, erase] = Array.from(dlg.querySelectorAll("button"));
    expect(document.activeElement).toBe(cancel);
    erase!.focus();
    await key(erase!, "Tab");
    expect(document.activeElement).toBe(cancel);
    await key(cancel!, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(erase);
    await key(erase!, "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(() => render(null, root));
    expect(document.activeElement).toBe(opener);
  });
});

describe("ui tokens", () => {
  const css = readFileSync("src/ui/tokens.css", "utf8");
  it("defines the scales, the three durations, forced-colors and reduced motion", () => {
    for (const t of ["--sp-1: 4px", "--r-2", "--fs-3", "--elev-2", "--dur-1: 120ms", "--dur-2: 180ms", "--dur-3: 240ms"]) expect(css).toContain(t);
    expect(css).toContain("forced-colors: active");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("prefers-color-scheme: dark");
  });
  it("component CSS uses tokens only (no raw hex colours)", () => {
    expect(readFileSync("src/ui/ui.css", "utf8")).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
  it("every built-in theme gives our own UI AA contrast on every text pair", () => {
    for (const id of BUILTIN_THEME_IDS) {
      const roles = uiRoles(id)!;
      for (const [fg, bg] of UI_PAIRS) expect(pairRatio(roles, fg, bg), `${id} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("the light and dark defaults also pass", () => {
    const grab = (block: string) => Object.fromEntries([...block.matchAll(/(--ui-[a-z-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1]!, m[2]!]));
    const light = grab(css.slice(0, css.indexOf("@media")));
    const dark = grab(css.slice(css.indexOf("prefers-color-scheme: dark")));
    for (const roles of [light, dark]) for (const [fg, bg] of UI_PAIRS) expect(pairRatio(roles, fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
  it("applyUiTheme sets and clears the roles; auto leaves the defaults", () => {
    applyUiTheme(document, "midnight");
    expect(document.documentElement.hasAttribute("data-ui-themed")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--ui-bg")).toBe(uiRoles("midnight")!["--ui-bg"]);
    applyUiTheme(document, "auto");
    expect(document.documentElement.hasAttribute("data-ui-themed")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--ui-bg")).toBe("");
  });
});
