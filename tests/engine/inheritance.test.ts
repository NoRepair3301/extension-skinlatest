import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { THEMES, type Theme } from "../../src/themes/index.ts";
import { createColorEngine, ENGINE_MARK } from "../../src/engine/dom.ts";
import { contrastRatio, parseRgb, toHex } from "../../src/engine/color.ts";

// Bug A (S3.4): the engine skipped a colour equal to its parent's computed colour as "inherited". An
// element with its own rule of that same value (`html, body { color: X }`) is not inherited: the parent
// gets repainted and the element keeps X. These tests pin the fix and the part of the optimisation that
// stays (elements that really inherit get no write).

type Task = () => void;

function fakeClock(win: object) {
  let next = 0;
  const timers = new Map<number, Task>();
  const w = win as Record<string, unknown>;
  w["setTimeout"] = (fn: Task) => (timers.set(++next, fn), next);
  w["clearTimeout"] = (id: number) => void timers.delete(id);
  w["requestAnimationFrame"] = (fn: (t: number) => void) => (timers.set(++next, () => fn(0)), next);
  w["cancelAnimationFrame"] = (id: number) => void timers.delete(id);
  return {
    pending: () => timers.size,
    async settle(): Promise<void> {
      let cycles = 0;
      await microtasks();
      while (timers.size > 0) {
        if (++cycles > 20) throw new Error("engine did not settle");
        const due = [...timers.values()];
        timers.clear();
        for (const fn of due) fn();
        await microtasks();
      }
    },
  };
}

// jsdom delivers mutation records in a promise microtask.
async function microtasks(): Promise<void> {
  for (let i = 0; i < 3; i++) await Promise.resolve();
}

const PAGES = {
  dark: { bg: "rgb(31, 30, 29)", fg: "rgb(236, 233, 226)", tint: "rgb(48, 48, 46)" },
  light: { bg: "rgb(255, 255, 255)", fg: "rgb(34, 34, 34)", tint: "rgb(245, 245, 245)" },
};
type Look = keyof typeof PAGES;

const head = (look: Look) => {
  const { bg, fg, tint } = PAGES[look];
  return `<style>
    html, body { background-color: ${bg}; color: ${fg}; }
    .own { color: ${fg}; }
    .tinted { color: ${fg}; background-color: ${tint}; }
  </style>`;
};

// Every way a colour can equal the parent's: parent html (body), parent body, a themed parent, a skipped parent.
const BODY = `<p id="inh">inherits from body</p>
  <p id="b" class="own">own rule, parent body</p>
  <div id="d" class="tinted"><span id="t" class="own">own rule, parent a themed div</span></div>
  <div id="s"><span id="k" class="own">own rule, parent a skipped div</span><span id="ki">inherits, parent a skipped div</span></div>`;

function setup(theme: Theme, look: Look, body = BODY, extraHead = "") {
  const dom = new JSDOM(`<!DOCTYPE html><html><head>${head(look)}${extraHead}</head><body>${body}</body></html>`);
  const win = dom.window;
  const doc = win.document;
  const clock = fakeClock(win);
  const engine = createColorEngine(doc, theme);
  return { win, doc, clock, engine, by: (id: string) => doc.getElementById(id) as HTMLElement };
}

const floor = (theme: Theme): number => (theme.id === "high-contrast" ? 7 : 4.5);
const hex = (css: string): string => {
  const c = parseRgb(css)!;
  return toHex(c.r, c.g, c.b);
};

/** Text colour against the first opaque background painted behind it (the theme background if none is). */
function ratio(el: Element, theme: Theme): { fg: string; bg: string; ratio: number } {
  const view = el.ownerDocument.defaultView!;
  const fg = hex(view.getComputedStyle(el).color);
  let bg = theme.tokens.bg;
  for (let n: Element | null = el; n; n = n.parentElement) {
    const c = parseRgb(view.getComputedStyle(n).backgroundColor);
    if (c && c.a > 0.99) {
      bg = toHex(c.r, c.g, c.b);
      break;
    }
  }
  return { fg, bg, ratio: contrastRatio(fg, bg) };
}

function expectFloor(el: Element, theme: Theme, what: string): void {
  const r = ratio(el, theme);
  expect(r.ratio, `${theme.id}: ${what} ${r.fg} on ${r.bg}`).toBeGreaterThanOrEqual(floor(theme));
}

const EACH = THEMES.flatMap((t) => (["dark", "light"] as const).map((look) => [t.id, look, t] as const));

describe.each(EACH)("I10: element whose colour equals its parent's is themed to the contrast floor, under %s on a %s page", (_id, look, theme) => {
  it("parent html, body, a themed div and a skipped div: every text reaches the floor", () => {
    const { doc, engine, by } = setup(theme, look);
    engine.apply();
    expectFloor(doc.body, theme, "body (parent html, own rule)");
    expectFloor(by("inh"), theme, "p inheriting from body");
    expectFloor(by("b"), theme, "p with own rule (parent body)");
    expectFloor(by("t"), theme, "span with own rule (parent a themed div)");
    expectFloor(by("k"), theme, "span with own rule (parent a skipped div)");
    expectFloor(by("ki"), theme, "span inheriting (parent a skipped div)");
    engine.restore();
  });

  it("the optimisation stays where it is right: elements that really inherit get no colour write", () => {
    const { engine, by } = setup(theme, look);
    engine.apply();
    for (const id of ["inh", "s", "ki"]) expect(by(id).style.getPropertyValue("color"), id).toBe("");
    engine.restore();
  });
});

describe.each(THEMES.map((t) => [t.id, t] as const))("I10: an <svg> whose fill equals its HTML parent's is themed, under %s", (_id, theme) => {
  it("the svg root is written (an HTML parent never gets a fill), its children follow it unwritten", async () => {
    const { win, doc, clock, engine } = setup(theme, "light", `<div id="w"><svg id="g"><path id="pa" d="M0 0"></path></svg></div>`);
    engine.apply();
    // Also one added later, alone: its parent is not in that refresh, so only the SVG-parent rule decides.
    doc.getElementById("w")!.insertAdjacentHTML("beforeend", `<svg id="late"></svg>`);
    const late = doc.getElementById("late")!;
    await clock.settle();
    for (const svg of [doc.getElementById("g")!, late]) {
      const fill = hex(win.getComputedStyle(svg).fill);
      expect(contrastRatio(fill, theme.tokens.bg), `${theme.id}: svg fill ${fill}`).toBeGreaterThanOrEqual(floor(theme));
    }
    const path = doc.getElementById("pa")!;
    expect(win.getComputedStyle(path).fill).toBe(win.getComputedStyle(doc.getElementById("g")!).fill);
    expect((path as unknown as SVGElement).style.getPropertyValue("fill")).toBe("");
    engine.restore();
  });
});

const midnight = THEMES.find((t) => t.id === "midnight")!;

// #c has no colour rule under .a (inherits from #p); under .b it has its own rule equal to #p's.
const SWITCH = `<style>
  .a { color: rgb(90, 90, 90); }
  .b, .b > .c { color: rgb(34, 34, 34); }
</style>`;

describe("I2: refresh keeps skipped and written elements in step with the parent", () => {
  it("I2: skipped child becomes written when the parent's value changes, and back, without stale records", async () => {
    const { win, doc, clock, engine, by } = setup(midnight, "light", `<div id="p" class="a"><span id="c" class="c">x</span></div>`, SWITCH);
    const before = doc.documentElement.outerHTML;
    engine.apply();
    const p = by("p");
    const c = by("c");
    // Inherits: no write of its own, and it shows the parent's themed colour.
    expect(c.hasAttribute("style")).toBe(false);
    expect(win.getComputedStyle(c).color).toBe(win.getComputedStyle(p).color);
    expectFloor(c, midnight, "inheriting child");

    // Now its own rule equals the parent's page colour: equal, but not inherited.
    p.className = "b";
    await clock.settle();
    expect(c.style.getPropertyPriority("color")).toBe("important");
    expect(win.getComputedStyle(c).color).toBe(win.getComputedStyle(p).color);
    expectFloor(c, midnight, "child with its own equal rule");

    // The hover/focus refresh reaches the same result.
    c.dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true, composed: true }));
    await clock.settle();
    expect(c.style.getPropertyPriority("color")).toBe("important");
    expectFloor(c, midnight, "child after a hover refresh");

    // Back to inheriting: the write is reverted and nothing is left on the element.
    p.className = "a";
    await clock.settle();
    expect(c.hasAttribute("style")).toBe(false);
    expect(win.getComputedStyle(c).color).toBe(win.getComputedStyle(p).color);
    expectFloor(c, midnight, "child inheriting again");

    engine.restore();
    expect(doc.documentElement.outerHTML).toBe(before);
  });
});

describe("I4/D12: restore is exact for skipped and written elements", () => {
  it.each(THEMES.map((t) => [t.id, t] as const))("under %s, after apply, a hover refresh and a class round trip", async (_id, theme) => {
    // Own inline colours equal to the parent's (written now), non-canonical style text, elements without a style attribute.
    const body = `${BODY}<div id="x" style="padding:1px;color:${PAGES.dark.fg}"><em id="y" style="color : ${PAGES.dark.fg} ;">y</em><b id="z">z</b></div>`;
    const { win, doc, clock, engine, by } = setup(theme, "dark", body);
    const before = doc.documentElement.outerHTML;
    engine.apply();
    expect(engine.modifiedCount()).toBeGreaterThan(0);
    by("y").dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true, composed: true }));
    await clock.settle();
    by("s").className = "x";
    await clock.settle();
    by("s").className = "";
    by("s").removeAttribute("class");
    await clock.settle();
    engine.restore();
    expect(engine.modifiedCount()).toBe(0);
    expect(doc.querySelectorAll(`[${ENGINE_MARK}]`).length).toBe(0);
    expect(doc.documentElement.outerHTML).toBe(before);
    expect(clock.pending()).toBe(0);
  });
});
