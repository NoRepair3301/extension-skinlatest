import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_ITEMS, MAX_LABEL, indexItems, labelOf } from "../../src/features/palette/index-items.ts";
import { rank, score } from "../../src/features/palette/score.ts";
import { createPaletteController } from "../../src/features/palette/index.ts";
import { openPalette, type PaletteDeps } from "../../src/features/palette/ui.ts";
import { handleCommand, type CommandDeps } from "../../src/extension/commands.ts";
import { defaultSettings } from "../../src/extension/settings.ts";

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.querySelectorAll("[data-skinly-ui]").forEach((n) => n.remove());
  vi.restoreAllMocks();
});

const all = { isVisible: () => true };

describe("indexer", () => {
  it("indexes links and controls in document order, skipping hidden ones", () => {
    document.body.innerHTML = `<a href="/a">Alpha</a><button>Beta</button><div role="button" aria-label="Gamma"></div><summary>Delta</summary><span role="tab" title="Eps">x</span><a>no href</a><a href="/h" id="hid">Hidden</a>`;
    const hidden = document.getElementById("hid")!;
    const items = indexItems(document, { isVisible: (el) => el !== hidden });
    expect(items.map((i) => i.label)).toEqual(["Alpha", "Beta", "Gamma", "Delta", "x"]);
  });
  it("caps at 500 items", () => {
    document.body.innerHTML = Array.from({ length: 700 }, (_, i) => `<a href="/${i}">L${i}</a>`).join("");
    expect(indexItems(document, all)).toHaveLength(MAX_ITEMS);
  });
  it("trims long labels and falls back to aria-label then title", () => {
    document.body.innerHTML = `<a href="/x">${"w ".repeat(100)}</a><button aria-label="Aria"></button><button title="Tt"></button><button></button>`;
    const items = indexItems(document, all);
    expect(items[0]!.label.length).toBeLessThanOrEqual(MAX_LABEL);
    expect(items.slice(1).map((i) => i.label)).toEqual(["Aria", "Tt"]);
    expect(labelOf(document.createElement("a"))).toBe("");
  });
  it("lists an element once even when two selectors match, keeps same-label duplicates, ignores our own UI", () => {
    document.body.innerHTML = `<button role="button">Same</button><a href="/1">Same</a><a href="/2">Same</a><div data-skinly-ui="x"><button>Ours</button></div>`;
    expect(indexItems(document, all).map((i) => i.label)).toEqual(["Same", "Same", "Same"]);
  });
});

describe("scorer", () => {
  it("ranks exact, then prefix, then substring, then subsequence", () => {
    const s = (q: string, l: string) => score(q, l)!;
    expect(s("home", "Home")).toBeGreaterThan(s("home", "Home page"));
    expect(s("home", "Home page")).toBeGreaterThan(s("home", "Go home"));
    expect(s("home", "Go home")).toBeGreaterThan(s("hme", "Home"));
    expect(score("xyz", "Home")).toBeUndefined();
  });
  it("keeps the original order for ties and returns everything for an empty query", () => {
    const items = ["b", "a", "c"].map((label) => ({ el: document.createElement("a"), label }));
    expect(rank("", items).map((i) => i.label)).toEqual(["b", "a", "c"]);
    const same = ["aa x", "bb x", "cc x"].map((label) => ({ el: document.createElement("a"), label }));
    expect(rank("x", same).map((i) => i.label)).toEqual(["aa x", "bb x", "cc x"]);
  });
});

function deps() {
  const timers: Array<() => void> = [];
  const unmark = vi.fn();
  const d: PaletteDeps = {
    doc: document,
    highlight: vi.fn(() => unmark),
    setTimeout: (fn) => (timers.push(fn), timers.length),
    clearTimeout: () => undefined,
  };
  return { d, timers, unmark };
}

const key = (target: Element, k: string) => target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

describe("palette UI", () => {
  const setup = () => {
    document.body.innerHTML = `<input id="before"><a href="/a" id="a">Alpha</a><a href="/b" id="b">Beta</a><button id="c">Gamma</button>`;
    (document.getElementById("before") as HTMLElement).focus();
    const click = vi.spyOn(HTMLElement.prototype, "click");
    const { d, timers, unmark } = deps();
    const p = openPalette(d, indexItems(document, all));
    const root = p.host.shadowRoot!;
    const input = root.querySelector("input")!;
    return { p, root, input, click, d, timers, unmark };
  };

  it("has combobox and listbox roles with labels", () => {
    const { root, input } = setup();
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-label")).toBeTruthy();
    expect(root.querySelector('ul[role="listbox"]')?.getAttribute("aria-label")).toBeTruthy();
    expect(root.querySelectorAll('[role="option"]')).toHaveLength(3);
  });

  it("arrow keys move the selection", () => {
    const { root, input } = setup();
    const sel = () => Array.from(root.querySelectorAll("li")).findIndex((li) => li.getAttribute("aria-selected") === "true");
    expect(sel()).toBe(0);
    key(input, "ArrowDown");
    expect(sel()).toBe(1);
    key(input, "ArrowDown");
    key(input, "ArrowDown");
    expect(sel()).toBe(0);
    key(input, "ArrowUp");
    expect(sel()).toBe(2);
    expect(input.getAttribute("aria-activedescendant")).toBe("skinly-opt-2");
  });

  it("typing filters; Enter focuses the target, outlines it and never clicks", () => {
    const { p, input, click, d, timers, unmark } = setup();
    input.value = "beta";
    input.dispatchEvent(new Event("input"));
    key(input, "Enter");
    expect(document.activeElement).toBe(document.getElementById("b"));
    expect(d.highlight).toHaveBeenCalledWith(document.getElementById("b"));
    expect(click).not.toHaveBeenCalled();
    expect(document.contains(p.host)).toBe(false);
    timers[0]!();
    expect(unmark).toHaveBeenCalled();
  });

  it("Escape closes and restores focus", () => {
    const { p, input, click } = setup();
    key(input, "Escape");
    expect(document.contains(p.host)).toBe(false);
    expect(document.activeElement).toBe(document.getElementById("before"));
    expect(click).not.toHaveBeenCalled();
  });

  it("Tab is trapped", () => {
    const { input } = setup();
    const ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    input.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("shows No matches and Enter does nothing then", () => {
    const { root, input, p } = setup();
    input.value = "zzzz";
    input.dispatchEvent(new Event("input"));
    expect(root.textContent).toContain("No matches");
    key(input, "Enter");
    expect(document.contains(p.host)).toBe(true);
  });

  it("controller keeps one palette open", () => {
    document.body.innerHTML = `<a href="/a">Alpha</a>`;
    const c = createPaletteController(deps().d);
    c.open();
    c.open();
    expect(document.querySelectorAll('[data-skinly-ui="palette"]')).toHaveLength(1);
    c.close();
    expect(document.querySelectorAll('[data-skinly-ui="palette"]')).toHaveLength(0);
  });

  it("makes no storage or network calls", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    setup();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("commands", () => {
  const make = () => {
    const calls: string[] = [];
    const d: CommandDeps = {
      loadSettings: async () => ({ ...defaultSettings(), blocklist: ["blocked.test"] }),
      inject: async (_t, f) => void calls.push(`inject:${f}`),
      runApplier: async (_t, m, a) => {
        calls.push(`run:${m}${typeof a === "string" ? `:${a}` : ""}`);
        return m === "applyTheme" ? { ok: true } : undefined;
      },
      openPalette: async () => void calls.push("palette"),
      setBadge: async (_t, text) => void calls.push(`badge:${text}`),
      setTitle: async (_t, text) => void calls.push(`title:${text}`),
    };
    return { d, calls };
  };
  const tab = (url: string) => ({ id: 3, url });

  it("transform-page injects the applier, applies the saved theme and shows the badge", async () => {
    const { d, calls } = make();
    await handleCommand(d, "transform-page", tab("https://ok.test/"));
    expect(calls).toEqual(["title:Skinly AI", "inject:applier.js", "run:applyTheme:calm-light", "badge:ON", "run:syncPet"]);
  });
  it("restore-page restores and clears the badge", async () => {
    const { d, calls } = make();
    await handleCommand(d, "restore-page", tab("https://ok.test/"));
    expect(calls).toEqual(["run:restore", "badge:", "title:Skinly AI"]);
  });
  it("open-palette injects the palette and opens it", async () => {
    const { d, calls } = make();
    await handleCommand(d, "open-palette", tab("https://ok.test/"));
    expect(calls).toEqual(["title:Skinly AI", "inject:palette.js", "palette"]);
  });
  it("blocked pages (internal, store, user blocklist) get the message and nothing is injected", async () => {
    for (const url of ["chrome://extensions", "https://blocked.test/x", "about:blank"]) {
      for (const cmd of ["transform-page", "open-palette"] as const) {
        const { d, calls } = make();
        await handleCommand(d, cmd, tab(url));
        expect(calls).toEqual(["badge:!", "title:Skinly can't change this kind of page"]);
      }
    }
  });
  it("a failure leaves the page alone", async () => {
    const { d, calls } = make();
    d.inject = async () => {
      throw new Error("x");
    };
    await handleCommand(d, "transform-page", tab("https://ok.test/"));
    expect(calls).not.toContain("run:applyTheme:calm-light");
    expect(calls.at(-1)).toBe("badge:!");
  });
  it("ignores a missing tab", async () => {
    const { d, calls } = make();
    await handleCommand(d, "transform-page", undefined);
    expect(calls).toEqual([]);
  });
});
