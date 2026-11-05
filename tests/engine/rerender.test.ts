import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { THEMES, type Theme } from "../../src/themes/index.ts";
import { createColorEngine, ENGINE_MARK } from "../../src/engine/dom.ts";
import { contrastRatio, parseRgb, toHex } from "../../src/engine/color.ts";
import { isDark } from "../../src/plan/contrast.ts";

// Promise carried over from the old guard test "a page that re-renders gets repaired again": content a
// page swaps in after the theme is on is themed again, and its text keeps the I10 contrast floor.

type Task = () => void;

// The engine schedules through win.setTimeout; a fake clock keeps these tests off real time.
function fakeClock(win: object) {
  let next = 0;
  const timers = new Map<number, Task>();
  const frames = new Map<number, Task>();
  const w = win as Record<string, unknown>;
  w["setTimeout"] = (fn: Task) => (timers.set(++next, fn), next);
  w["clearTimeout"] = (id: number) => void timers.delete(id);
  w["requestAnimationFrame"] = (fn: (t: number) => void) => (frames.set(++next, () => fn(0)), next);
  w["cancelAnimationFrame"] = (id: number) => void frames.delete(id);
  return {
    async settle(): Promise<void> {
      let cycles = 0;
      await microtasks();
      while (timers.size + frames.size > 0) {
        if (++cycles > 20) throw new Error("engine did not settle");
        const due = [...timers.entries(), ...frames.entries()].sort((a, b) => a[0] - b[0]);
        timers.clear();
        frames.clear();
        for (const [, fn] of due) fn();
        await microtasks();
      }
    },
  };
}

// jsdom delivers mutation records in a promise microtask.
async function microtasks(): Promise<void> {
  for (let i = 0; i < 3; i++) await Promise.resolve();
}

const HEAD = `<style>
  .note { color: rgb(51, 51, 51); }
  .faint { color: rgb(200, 200, 200); }
  .loud { color: rgb(250, 250, 250); background-color: rgb(20, 20, 20); }
  .calm { color: rgb(40, 40, 40); background-color: rgb(255, 255, 255); }
</style>`;
const BODY_STYLE = "background-color: rgb(255, 255, 255); color: rgb(0, 0, 0);";

function setup(theme: Theme, body: string) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head>${HEAD}</head><body style="${BODY_STYLE}">${body}</body></html>`);
  const win = dom.window;
  const doc = win.document;
  const clock = fakeClock(win);
  const engine = createColorEngine(doc, theme);
  engine.apply();
  return { win, doc, clock, engine, by: (id: string) => doc.getElementById(id) as HTMLElement };
}

const hostOf = (n: Element): Element | null => n.parentElement ?? ((n.getRootNode() as ShadowRoot).host ?? null);

/** Text colour against the first opaque background painted behind it (the theme background if none is). */
function readability(el: Element, theme: Theme): { fg: string; bg: string; ratio: number } {
  const view = el.ownerDocument.defaultView!;
  const fgc = parseRgb(view.getComputedStyle(el).color)!;
  let bgHex = theme.tokens.bg;
  for (let n: Element | null = el; n; n = hostOf(n)) {
    const c = parseRgb(view.getComputedStyle(n).backgroundColor);
    if (c && c.a > 0.99) {
      bgHex = toHex(c.r, c.g, c.b);
      break;
    }
  }
  const fg = toHex(fgc.r, fgc.g, fgc.b);
  return { fg, bg: bgHex, ratio: contrastRatio(fg, bgHex) };
}

const floor = (theme: Theme): number => (theme.id === "high-contrast" ? 7 : 4.5);
const themed = (el: Element): boolean => el.hasAttribute(ENGINE_MARK);

function expectReadable(el: Element, theme: Theme, what: string): void {
  const r = readability(el, theme);
  expect(r.ratio, `${theme.id}: ${what} ${r.fg} on ${r.bg}`).toBeGreaterThanOrEqual(floor(theme));
}

const EACH_THEME = THEMES.map((t) => [t.id, t] as const);

describe.each(EACH_THEME)("page re-render under %s (I10)", (_id, theme) => {
  it("a replaced node is themed again and keeps the contrast floor", async () => {
    const { clock, by, doc } = setup(theme, `<main id="m"><p id="old" class="note">before</p></main>`);
    const fresh = doc.createElement("p");
    fresh.className = "faint"; // unreadable as the site draws it: the engine has to lift it
    fresh.textContent = "after";
    by("old").replaceWith(fresh);
    await clock.settle();
    expect(themed(fresh)).toBe(true);
    expectReadable(fresh, theme, "replaced node");
  });

  it("a removed and re-inserted node is themed again after the page changes its colour meanwhile", async () => {
    const { clock, by, doc } = setup(theme, `<main id="m"><p id="t" class="note">text</p></main>`);
    const p = by("t");
    await clock.settle();
    p.remove();
    await clock.settle();
    // The page rewrites it while it is detached, to a colour that is unreadable on this theme.
    p.style.setProperty("color", isDark(theme.tokens.bg) ? "rgb(10, 10, 10)" : "rgb(200, 200, 200)");
    by("m").append(p);
    await clock.settle();
    expect(doc.contains(p)).toBe(true);
    expect(themed(p)).toBe(true);
    expectReadable(p, theme, "re-inserted node");
  });

  it("a class change that swaps the colours is themed again and keeps the floor", async () => {
    const { clock, by } = setup(theme, `<main><div id="t" class="calm"><span id="s">text</span></div></main>`);
    by("t").className = "faint";
    await clock.settle();
    expect(themed(by("t"))).toBe(true);
    // The calm card's white background is gone with its class; the old themed one must not linger.
    expect(by("t").style.getPropertyValue("background-color")).toBe("");
    expectReadable(by("t"), theme, "element after class change");
    expectReadable(by("s"), theme, "child after class change");
  });

  it("nodes added inside an open shadow root are themed and keep the floor", async () => {
    const { clock, doc } = setup(theme, `<div id="h"></div>`);
    // A host added after apply() with its root and content already in place.
    const host = doc.createElement("div");
    const sr = host.attachShadow({ mode: "open" });
    const inner = doc.createElement("p");
    inner.className = "faint";
    inner.textContent = "in shadow";
    sr.append(inner);
    doc.body.append(host);
    await clock.settle();
    expect(themed(inner)).toBe(true);
    expectReadable(inner, theme, "node in a shadow root added with its host");

    // Then a node added to that now-watched root.
    const later = doc.createElement("p");
    later.className = "faint";
    later.textContent = "later";
    sr.append(later);
    await clock.settle();
    expect(themed(later)).toBe(true);
    expectReadable(later, theme, "node added to a watched shadow root");
  });
});

describe.each(EACH_THEME)("a shadow root that exists when the theme goes on, under %s", (_id, theme) => {
  it("nodes added later inside it are themed and keep the floor", async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><head>${HEAD}</head><body style="${BODY_STYLE}"><div id="h"></div></body></html>`);
    const doc = dom.window.document;
    const sr = doc.getElementById("h")!.attachShadow({ mode: "open" });
    const first = doc.createElement("p");
    first.className = "note";
    first.textContent = "first";
    sr.append(first);
    const clock = fakeClock(dom.window);
    const engine = createColorEngine(doc, theme);
    engine.apply();
    expect(themed(first)).toBe(true);
    const late = doc.createElement("p");
    late.className = "faint";
    late.textContent = "late";
    sr.append(late);
    await clock.settle();
    expect(themed(late)).toBe(true);
    expectReadable(late, theme, "node added to an open shadow root");
    engine.restore();
  });
});

// BUG (reported in S3.2, not fixed there): a shadow root attached to a host that is already in the page
// is never watched, so its content stays as the site draws it until something else triggers a full
// re-scan. Hosts added together with their root (above) are fine.
describe("BUG: a shadow root attached after the theme is on", () => {
  const theme = THEMES.find((t) => t.id === "midnight")!;
  it("content rendered into it is themed", async () => {
    const { clock, by, doc } = setup(theme, `<div id="h"></div>`);
    const sr = by("h").attachShadow({ mode: "open" });
    const p = doc.createElement("p");
    p.className = "faint";
    p.textContent = "late root";
    sr.append(p);
    await clock.settle();
    expect(themed(p)).toBe(true);
    expectReadable(p, theme, "node in a shadow root attached after apply");
  });
});

// BUG (reported in S3.2, not fixed there): makeTransform lifts a text colour to the floor against the
// THEME background (tokens.bg) only. Under a light theme, light text on a dark element of a light page
// (a dark banner, button or footer) is nudged darker to suit the light theme background and ends below
// the floor against the element's own background. The same happens at first apply; a re-render shows
// it because the element is restyled after the theme is on.
describe.each(EACH_THEME)("BUG: text on a dark element keeps the floor, under %s", (_id, theme) => {
  it("class change to a dark element with light text", async () => {
    const { clock, by } = setup(theme, `<main><div id="t" class="calm"><span id="s">text</span></div></main>`);
    by("t").className = "loud";
    await clock.settle();
    expect(themed(by("t"))).toBe(true);
    expectReadable(by("t"), theme, "light text on a dark element");
    expectReadable(by("s"), theme, "child of a dark element");
  });
});
