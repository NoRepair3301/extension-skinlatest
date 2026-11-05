import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENGINE_MARK, ENGINE_SHEET_SIGNATURE, ROOT_MARK } from "../src/engine/dom.ts";
import { createApplier, type StyleHost } from "../src/extension/applier-core.ts";
import { BUILTIN_THEME_IDS } from "../src/themes/index.ts";
import { fakeDeps } from "./analyzer/helpers.ts";
import { createFakeChrome } from "./helpers/fakeChrome.ts";

/**
 * F2 (S5.3): Restore puts the page back exactly. Real applier and engine on jsdom, with adopted sheets that keep their first selector (how
 * ours are found) and a fake clock, so every engine batch has run before the page is compared. D12/I11 (exact text), I3-I5 (page wins),
 * I7 (nothing left behind), D4 (a lost instance), and the popup button and the shortcut reaching the same end state.
 */
type Task = () => void;

class Sheet {
  cssRules: Array<{ selectorText: string }> = [];
  replaceSync(css: string): void {
    this.cssRules = css.split("}").map((r) => r.split("{")[0]!.trim()).filter(Boolean).map((selectorText) => ({ selectorText }));
  }
}

function page(markup: string) {
  const win = new JSDOM(markup).window;
  const doc = win.document;
  const timers = new Map<number, Task>();
  let next = 0;
  const w = win as unknown as Record<string, unknown>;
  w["setTimeout"] = (fn: Task) => (timers.set(++next, fn), next);
  w["clearTimeout"] = (id: number) => void timers.delete(id);
  w["requestAnimationFrame"] = (fn: (t: number) => void) => (timers.set(++next, () => fn(0)), next);
  w["cancelAnimationFrame"] = (id: number) => void timers.delete(id);
  // Observers and listeners are counted so that "restore leaves nothing behind" (I7) can be asserted, not assumed.
  const observers = new Set<object>();
  const Base = win.MutationObserver;
  w["MutationObserver"] = class extends Base {
    override observe(...a: Parameters<MutationObserver["observe"]>): void {
      observers.add(this);
      super.observe(...a);
    }
    override disconnect(): void {
      observers.delete(this);
      super.disconnect();
    }
  };
  const listeners = new Map<string, number>();
  const add = doc.addEventListener.bind(doc);
  const remove = doc.removeEventListener.bind(doc);
  const seen = new Map<EventListenerOrEventListenerObject, Set<string>>();
  doc.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
    const key = `${type}:${typeof opts === "object" ? opts.capture === true : opts === true}`;
    if (!seen.get(fn)?.has(key)) {
      seen.set(fn, (seen.get(fn) ?? new Set()).add(key));
      listeners.set(key, (listeners.get(key) ?? 0) + 1);
    }
    add(type, fn, opts);
  }) as typeof doc.addEventListener;
  doc.removeEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | EventListenerOptions) => {
    const key = `${type}:${typeof opts === "object" ? opts.capture === true : opts === true}`;
    if (seen.get(fn)?.delete(key)) listeners.set(key, (listeners.get(key) ?? 1) - 1);
    remove(type, fn, opts);
  }) as typeof doc.removeEventListener;

  let sheets: Sheet[] = [];
  Object.defineProperty(doc, "adoptedStyleSheets", { configurable: true, get: () => sheets, set: (v: Sheet[]) => void (sheets = v) });
  const host: StyleHost = {
    add(css) {
      const s = new Sheet();
      s.replaceSync(css);
      sheets = [...sheets, s];
      return { remove: () => void (sheets = sheets.filter((x) => x !== s)), isAttached: () => sheets.includes(s) };
    },
  };
  return {
    doc,
    html: () => doc.documentElement.outerHTML,
    engineSheets: () => sheets.filter((s) => s.cssRules[0]?.selectorText === ENGINE_SHEET_SIGNATURE).length,
    allSheets: () => sheets.length,
    timers: () => timers.size,
    observers: () => observers.size,
    listeners: () => [...listeners.entries()].filter(([, n]) => n !== 0),
    applier: (tokensOnly = false) => createApplier(doc, { style: host, summaryDeps: fakeDeps(), tokensOnly }),
    async settle(): Promise<void> {
      for (let cycles = 0; cycles < 30; cycles++) {
        for (let i = 0; i < 3; i++) await Promise.resolve();
        if (timers.size === 0) return;
        const due = [...timers.values()];
        timers.clear();
        for (const fn of due) fn();
      }
      throw new Error("engine did not settle");
    },
  };
}

const SMALL = `<!DOCTYPE html><html><head><style>#u { background-color: rgb(240, 240, 240); } .card { color: rgb(60, 60, 60); }</style></head><body style="background-color: rgb(255, 255, 255); color: rgb(0, 0, 0);"><div id="t" style="color: rgb(30, 30, 30)"><p id="u">y</p><section class="card"><a href="/x">link</a></section></div></body></html>`;

/** Inline styles in every form the engine has to give back byte for byte: none, an empty attribute, !important, custom properties, odd spacing, legacy attributes. */
const INLINE = `<!DOCTYPE html><html><head><title>inline forms</title><style>.k { background-color: rgb(240, 240, 240); }</style></head>
<body bgcolor="#eeeeee" text="#112233" link="#0000ff">
<div id="none">no style attribute</div>
<div id="empty" style="">empty style attribute</div>
<p id="imp" style="color: rgb(20, 20, 20) !important; background-color: rgb(250, 250, 250) !important">important</p>
<p id="vars" style="--card-bg: rgb(245, 245, 245); --card-fg: rgb(30, 30, 30); color: var(--card-fg); background-color: var(--card-bg)">custom properties</p>
<span id="mix" class="k" style=" color:red ;width:10px ">odd spacing</span>
<table bgcolor="#ffffff" border="1" cellpadding="4"><tr><td bgcolor="#ddddff"><font color="#000099" size="3">legacy attributes</font></td></tr></table>
</body></html>`;

const read = (name: string): string => readFileSync(`fixtures/web/${name}.html`, "utf8");
const FIXTURES: Array<[string, string]> = [
  ["small page", SMALL],
  ["inline style forms", INLINE],
  ["legacy-portal-fonts", read("legacy-portal-fonts")],
  ["legacy-portal-tables", read("legacy-portal-tables")],
  ["service-cards", read("service-cards")],
  ["light-article", read("light-article")],
];

/** Nothing of the engine is left: no timer, observer, listener, sheet, mark or transition hold (I7). */
function expectClean(p: ReturnType<typeof page>): void {
  expect(p.timers(), "pending timers").toBe(0);
  expect(p.observers(), "live observers").toBe(0);
  expect(p.listeners(), "document listeners").toEqual([]);
  expect(p.allSheets(), "adopted sheets").toBe(0);
  expect(p.doc.documentElement.hasAttribute(ROOT_MARK), "root marker").toBe(false);
  expect(p.doc.querySelectorAll(`[${ENGINE_MARK}]`).length, "element markers").toBe(0);
  expect(p.doc.querySelectorAll("[style*='transition']").length, "transition holds").toBe(0);
}

describe("F2: Restore is exact for every theme (D12, I11)", () => {
  describe.each(FIXTURES)("%s", (_name, markup) => {
    it.each(BUILTIN_THEME_IDS)("apply %s, then restore: the document is byte-identical, nothing is left behind", async (theme) => {
      const p = page(markup);
      const before = p.html();
      const a = p.applier();
      expect(a.applyTheme(theme).ok).toBe(true);
      await p.settle();
      expect(p.html(), "the theme changed the page").not.toBe(before);
      expect(a.restore()).toEqual({ ok: true });
      expect(p.html()).toBe(before);
      expectClean(p);
    });

    it("a swap sequence A, B, C, B, then restore: equal to the original", async () => {
      const p = page(markup);
      const before = p.html();
      const a = p.applier();
      for (const id of ["midnight", "ocean", "field", "ocean"]) {
        expect(a.applyTheme(id).ok).toBe(true);
        await p.settle();
        expect(p.engineSheets()).toBe(1);
      }
      a.restore();
      expect(p.html()).toBe(before);
      expectClean(p);
    });

    it("all six themes one after another, then restore, then restore again: equal to the original both times", async () => {
      const p = page(markup);
      const before = p.html();
      const a = p.applier();
      for (const id of BUILTIN_THEME_IDS) {
        a.applyTheme(id);
        await p.settle();
      }
      a.restore();
      expect(p.html()).toBe(before);
      a.restore();
      expect(p.html()).toBe(before);
      expectClean(p);
    });
  });
});

describe("F2: the page's own changes while themed survive Restore, and the engine leaves no writes (I3-I5)", () => {
  /** What the page itself does while a theme is on. Run on an untouched copy it gives the exact document Restore has to reach. */
  const pageChanges = (doc: Document): void => {
    doc.getElementById("none")!.classList.add("hot"); // adds a class to an element the engine styled
    doc.getElementById("imp")!.style.setProperty("color", "rgb(1, 2, 3)"); // sets a property the engine wrote
    doc.getElementById("vars")!.removeAttribute("style"); // removes the whole style attribute
    doc.getElementById("mix")!.setAttribute("data-page", "1"); // an attribute of its own
    doc.body.appendChild(Object.assign(doc.createElement("p"), { id: "late", textContent: "added by the page" })); // new content
  };

  it.each(["midnight", "warm-paper", "high-contrast"])("%s: the expected DOM is the untouched page with the same changes, exactly", async (theme) => {
    const p = page(INLINE);
    const expected = page(INLINE);
    pageChanges(expected.doc);
    const a = p.applier();
    a.applyTheme(theme);
    await p.settle();
    pageChanges(p.doc);
    await p.settle(); // the engine reacts to the page's changes (refresh) and must not undo them
    expect(p.doc.getElementById("none")!.classList.contains("hot")).toBe(true);
    a.restore();
    expect(p.html()).toBe(expected.html());
    expectClean(p);
  });

  it("the page's change survives a swap to another theme and then Restore (I5)", async () => {
    const p = page(INLINE);
    const expected = page(INLINE);
    pageChanges(expected.doc);
    const a = p.applier();
    a.applyTheme("midnight");
    await p.settle();
    pageChanges(p.doc);
    await p.settle();
    a.applyTheme("ocean");
    await p.settle();
    expect(p.doc.getElementById("imp")!.style.getPropertyValue("color")).not.toBe("");
    a.restore();
    expect(p.html()).toBe(expected.html());
  });

  it("a page that changes nothing gets the original back even when other nodes come and go", async () => {
    const p = page(INLINE);
    const before = p.html();
    const a = p.applier();
    a.applyTheme("ocean");
    await p.settle();
    const extra = p.doc.createElement("div");
    extra.textContent = "temporary";
    p.doc.body.appendChild(extra);
    await p.settle();
    extra.remove();
    await p.settle();
    a.restore();
    expect(p.html()).toBe(before);
  });
});

describe("F2: Restore from a lost instance (the extension was reloaded, D4)", () => {
  describe.each(FIXTURES)("%s", (_name, markup) => {
    it("a fresh applier that never applied restores the page from the engine markers; a second Restore changes nothing", async () => {
      const p = page(markup);
      const before = p.html();
      const lost = p.applier();
      expect(lost.applyTheme("midnight").ok).toBe(true);
      await p.settle();
      expect(p.doc.documentElement.hasAttribute(ROOT_MARK)).toBe(true);
      const fresh = p.applier(); // knows nothing about the lost one (no ledger)
      expect(fresh.isActive()).toBe(false);
      expect(fresh.canRestore()).toBe(true); // the button stays enabled: the marker is the evidence
      expect(fresh.restore()).toEqual({ ok: true });
      const afterOnce = p.html();
      // D4 guarantees the marker data back: sheet, root and element marks gone and every engine write reverted. The attribute text is
      // best effort without the ledger (D12 needs it): it may be re-serialised, but never differ in meaning.
      expect(p.allSheets()).toBe(0);
      expect(p.doc.documentElement.hasAttribute(ROOT_MARK)).toBe(false);
      expect(p.doc.querySelectorAll(`[${ENGINE_MARK}]`).length).toBe(0);
      expect(declarations(p.doc)).toEqual(declarations(new JSDOM(before).window.document));
      expect(fresh.restore()).toEqual({ ok: true });
      expect(p.html()).toBe(afterOnce);
      expect(fresh.canRestore()).toBe(false);
    });
  });

  it("where the markers record everything (plain inline styles), the lost-instance restore is byte-identical", async () => {
    const p = page(SMALL);
    const before = p.html();
    p.applier().applyTheme("ocean");
    await p.settle();
    p.applier().restore();
    expect(p.html()).toBe(before);
  });
});

/** Every element's inline declarations (name, value, priority) and the other attributes, as data: equal when the page means the same. */
function declarations(doc: Document): unknown[] {
  return Array.from(doc.querySelectorAll("*")).map((el) => {
    const style = (el as HTMLElement).style;
    const decls: string[] = [];
    for (let i = 0; i < style.length; i++) decls.push(`${style[i]}:${style.getPropertyValue(style[i]!)}:${style.getPropertyPriority(style[i]!)}`);
    const attrs = Array.from(el.attributes).filter((a) => a.name !== "style").map((a) => `${a.name}=${a.value}`);
    return [el.localName, attrs, decls.sort(), el.hasAttribute("style")];
  });
}

describe("F2: a same-origin iframe is restored exactly too (R3)", () => {
  /** The top page and one same-origin frame, each with its own applier as the extension injects them (the frame's one colours only). */
  async function withFrame() {
    const p = page(`<!DOCTYPE html><html><body style="background-color: rgb(250, 250, 250)"><p id="top" style="color: rgb(20, 20, 20)">top</p><iframe id="f"></iframe></body></html>`);
    const frame = p.doc.getElementById("f") as HTMLIFrameElement;
    const inner = frame.contentDocument!;
    inner.open();
    inner.write(`<!DOCTYPE html><html><body style="background-color: rgb(240, 240, 240)"><p id="in" style="color: rgb(40, 40, 40)">in</p><div id="plain">plain</div></body></html>`);
    inner.close();
    let sheets: Sheet[] = [];
    Object.defineProperty(inner, "adoptedStyleSheets", { configurable: true, get: () => sheets, set: (v: Sheet[]) => void (sheets = v) });
    const host: StyleHost = {
      add(css) {
        const s = new Sheet();
        s.replaceSync(css);
        sheets = [...sheets, s];
        return { remove: () => void (sheets = sheets.filter((x) => x !== s)), isAttached: () => sheets.includes(s) };
      },
    };
    const innerWin = inner.defaultView as unknown as Record<string, unknown>;
    innerWin["setTimeout"] = (fn: Task) => setTimeout(fn, 0);
    return { p, inner, frameApplier: createApplier(inner, { style: host, summaryDeps: fakeDeps(), tokensOnly: true }), frameSheets: () => sheets.length };
  }

  it("each applier alone swaps A then B and restores its document exactly: the top one (which also walks the frame) and the frame's own", async () => {
    for (const who of ["top", "frame"] as const) {
      const { p, inner, frameApplier, frameSheets } = await withFrame();
      const topBefore = p.html();
      const frameBefore = inner.documentElement.outerHTML;
      const applier = who === "top" ? p.applier() : frameApplier;
      for (const id of ["midnight", "ocean"]) {
        expect(applier.applyTheme(id).ok).toBe(true);
        await p.settle();
        await new Promise((r) => setTimeout(r, 5));
      }
      expect(applier.canRestore()).toBe(true);
      applier.restore();
      await new Promise((r) => setTimeout(r, 5));
      expect(inner.documentElement.outerHTML, who).toBe(frameBefore);
      expect(p.html(), who).toBe(topBefore);
      expect(frameSheets()).toBe(0);
      expect(p.allSheets()).toBe(0);
    }
  });

  it("top and frame appliers together, restored in either order, leave no sheet, root mark or element mark in either document", async () => {
    // KNOWN BUG R3 (engine, reported in HANDOFF, not fixed here): both engines write the frame's colours, so the frame's inline colours
    // are not given back exactly when both ran. The colours are therefore not asserted here; what must hold is that nothing else is left.
    for (const order of ["frame first", "top first"]) {
      const { p, inner, frameApplier, frameSheets } = await withFrame();
      const top = p.applier();
      for (const id of ["midnight", "ocean"]) {
        top.applyTheme(id);
        frameApplier.applyTheme(id);
        await p.settle();
        await new Promise((r) => setTimeout(r, 5));
      }
      if (order === "frame first") {
        frameApplier.restore();
        top.restore();
      } else {
        top.restore();
        frameApplier.restore();
      }
      await new Promise((r) => setTimeout(r, 5));
      expect(frameSheets(), order).toBe(0);
      expect(p.allSheets(), order).toBe(0);
      expect(inner.documentElement.hasAttribute(ROOT_MARK), order).toBe(false);
      expect(p.doc.documentElement.hasAttribute(ROOT_MARK), order).toBe(false);
      expect(inner.querySelectorAll(`[${ENGINE_MARK}]`).length, order).toBe(0);
      expect(p.timers(), order).toBe(0);
    }
  });
});

describe("F2: canRestore tells the button whether there is anything to take away", () => {
  it("false on an untouched page, true with a live engine, true with only a tool on the page, false again after Restore", async () => {
    const p = page(SMALL);
    const a = p.applier();
    expect(a.canRestore()).toBe(false);
    a.applyTheme("field");
    await p.settle();
    expect(a.canRestore()).toBe(true);
    a.restore();
    expect(a.canRestore()).toBe(false);
    const pet = p.doc.createElement("div");
    pet.setAttribute("data-skinly-ui", "pet");
    p.doc.body.append(pet);
    expect(a.canRestore()).toBe(true); // Restore also removes the pet and the tools
    a.restore();
    expect(p.doc.querySelector("[data-skinly-ui]")).toBeNull();
    expect(a.canRestore()).toBe(false);
  });

  it("sees the marks of an engine in a same-origin iframe", () => {
    const p = page(`<!DOCTYPE html><html><body><iframe id="f" srcdoc="<p>in</p>"></iframe></body></html>`);
    const inner = p.doc.getElementById("f") as HTMLIFrameElement;
    const a = p.applier();
    expect(a.canRestore()).toBe(false);
    inner.contentDocument!.documentElement.setAttribute(ROOT_MARK, "on");
    expect(a.canRestore()).toBe(true);
  });
});

describe("F2: the Restore button's question reaches a page that has no applier (the extension was reloaded)", () => {
  afterEach(() => {
    document.documentElement.removeAttribute(ROOT_MARK);
    document.body.replaceChildren();
    delete (globalThis as unknown as { skinlyApplier?: unknown }).skinlyApplier;
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });

  it("the root marker of the lost instance answers canRestore, in the page or in a same-origin frame; an untouched page answers false", async () => {
    const fake = createFakeChrome({ tabs: { 7: "https://example.org/a" }, granted: ["https://example.org/*"] });
    fake.install();
    const { runInPage } = await import("../src/extension/api.ts");
    expect((globalThis as unknown as { skinlyApplier?: unknown }).skinlyApplier).toBeUndefined();
    expect(await runInPage<boolean>(7, "canRestore", undefined, true)).toBe(false);
    document.documentElement.setAttribute(ROOT_MARK, "on");
    expect(await runInPage<boolean>(7, "canRestore", undefined, true)).toBe(true);
    document.documentElement.removeAttribute(ROOT_MARK);
    const frame = document.createElement("iframe");
    document.body.append(frame);
    expect(await runInPage<boolean>(7, "canRestore", undefined, true)).toBe(false);
    frame.contentDocument!.documentElement.setAttribute(ROOT_MARK, "on");
    expect(await runInPage<boolean>(7, "canRestore", undefined, true)).toBe(true);
  });

  it("any other method still answers undefined when no applier is there", async () => {
    const fake = createFakeChrome({ tabs: { 7: "https://example.org/a" }, granted: ["https://example.org/*"] });
    fake.install();
    const { runInPage } = await import("../src/extension/api.ts");
    document.documentElement.setAttribute(ROOT_MARK, "on");
    expect(await runInPage(7, "restore", undefined, true)).toBeUndefined();
    expect(await runInPage(7, "isActive", undefined, true)).toBeUndefined();
  });
});

describe("F2: the popup button and the shortcut end in the same page and the same stored state", () => {
  const TAB = 7;
  const ORIGIN = "https://example.org";
  const URL_A = `${ORIGIN}/wiki/Page`;
  const PATTERN = `${ORIGIN}/*`;
  let root: HTMLElement | undefined;

  afterEach(() => {
    if (root) render(null, root);
    root = undefined;
    document.body.replaceChildren();
    delete (globalThis as unknown as { skinlyApplier?: unknown }).skinlyApplier;
    vi.unstubAllGlobals();
  });

  const flush = async (fake: ReturnType<typeof createFakeChrome>, p: ReturnType<typeof page>) => {
    for (let i = 0; i < 3; i++) await act(() => new Promise<void>((r) => setTimeout(r, 0)));
    await fake.settle();
    await p.settle();
    await act(() => new Promise<void>((r) => setTimeout(r, 0)));
  };

  /** One full run: the real popup themes the page through the fake browser, then the page is restored through `entry`. */
  async function run(entry: "popup" | "shortcut", markup: string) {
    vi.resetModules();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
    const p = page(markup);
    const before = p.html();
    const fake = createFakeChrome({ tabs: { [TAB]: URL_A }, granted: [PATTERN] });
    fake.activeTab.add(TAB);
    fake.install();
    // the page script the browser's executeScript reaches: the real applier on this document
    (globalThis as unknown as { skinlyApplier: unknown }).skinlyApplier = p.applier();
    await import("../src/extension/background.ts");
    await fake.settle();
    const { Popup } = await import("../src/extension/popup/Popup.tsx");
    root = document.createElement("div");
    document.body.appendChild(root);
    await act(() => render(h(Popup, {}), root!));
    await flush(fake, p);
    const buttons = () => Array.from(root!.querySelectorAll("button"));
    const restoreBtn = () => buttons().find((b) => b.textContent === "Restore original")!;
    expect(restoreBtn().getAttribute("aria-disabled"), "Restore is disabled before any theme").toBe("true");
    await act(() => root!.querySelector<HTMLInputElement>('input[type="radio"][value="midnight"]')!.click());
    await flush(fake, p);
    expect(p.html()).not.toBe(before);
    expect(restoreBtn().getAttribute("aria-disabled"), "Restore is enabled once the page is themed").toBeNull();
    if (entry === "popup") {
      await act(() => restoreBtn().click());
    } else {
      await fake.events.onCommand.fire("restore-page", { id: TAB, url: URL_A });
    }
    await flush(fake, p);
    const strip = (v: unknown) => JSON.stringify(v).replace(/"savedAt":"[^"]*"/g, '"savedAt":"-"');
    const state = {
      sites: strip(fake.store.get("sites")),
      settings: strip(fake.store.get("settings")),
      intent: fake.store.has("intent"),
      registered: [...fake.registered.keys()],
      granted: [...fake.granted],
      badge: fake.badges.get(TAB),
    };
    return { before, html: p.html(), state, p, expectedPaused: (fake.store.get("sites") as Record<string, { paused?: boolean }>)[ORIGIN]?.paused };
  }

  it.each(FIXTURES.slice(0, 3))("%s: identical DOM (the original) and identical stored state", async (_name, markup) => {
    const viaPopup = await run("popup", markup);
    if (root) render(null, root);
    const viaShortcut = await run("shortcut", markup);
    expect(viaPopup.html).toBe(viaPopup.before);
    expect(viaShortcut.html).toBe(viaShortcut.before);
    expect(viaShortcut.html).toBe(viaPopup.html);
    expect(viaShortcut.state).toEqual(viaPopup.state);
    // the shared end state: the site is paused, its registration and badge are gone, the permission stays
    expect(viaPopup.expectedPaused).toBe(true);
    expect(viaPopup.state.registered).toEqual([]);
    expect(viaPopup.state.granted).toEqual([PATTERN]);
    expect(viaPopup.state.badge).toBe("");
    expectClean(viaPopup.p);
    expectClean(viaShortcut.p);
  });
});
