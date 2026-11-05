import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { THEMES, type Theme } from "../../src/themes/index.ts";
import { createColorEngine, ENGINE_MARK, type StyleHost } from "../../src/engine/dom.ts";
import { createApplier } from "../../src/extension/applier-core.ts";
import { contrastRatio, parseRgb, toHex } from "../../src/engine/color.ts";

// Bug C (S3.4): a shadow root attached to a host already in the page fires nothing the engine sees, and
// the isolated world cannot hook the page's attachShadow. The engine adopts such a root the first time
// one of the signals it already reacts to touches the host: a mutation on the host or in its light
// subtree, or an event from inside the root. A root with no such activity at all stays unthemed (the
// BUG test in rerender.test.ts; owner decision S3.4). Closed roots are a documented limitation.

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

const BODY_STYLE = "background-color: rgb(255, 255, 255); color: rgb(0, 0, 0);";
const HEAD = `<style>.faint { color: rgb(200, 200, 200); }</style>`;

// Adopted sheets as the browser exposes them (same as marker.test.ts): the fresh cleanup finds ours by selector.
class Sheet {
  cssRules: Array<{ selectorText: string }> = [];
  replaceSync(css: string): void {
    this.cssRules = css.split("}").map((r) => r.split("{")[0]!.trim()).filter(Boolean).map((selectorText) => ({ selectorText }));
  }
}

function setup(theme: Theme) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head>${HEAD}</head><body style="${BODY_STYLE}"><div id="h"><b id="light">light child</b></div></body></html>`);
  const win = dom.window;
  const doc = win.document;
  const clock = fakeClock(win);
  let sheets: Sheet[] = [];
  Object.defineProperty(doc, "adoptedStyleSheets", { configurable: true, get: () => sheets, set: (v: Sheet[]) => void (sheets = v) });
  const styleHost: StyleHost = {
    add(css) {
      const s = new Sheet();
      s.replaceSync(css);
      sheets = [...sheets, s];
      return { remove: () => void (sheets = sheets.filter((x) => x !== s)), isAttached: () => sheets.includes(s) };
    },
  };
  const engine = createColorEngine(doc, theme, { styleHost });
  const host = doc.getElementById("h")!;
  // What a lazy component does once the theme is on: attach a root and render into it.
  const attach = () => {
    const sr = host.attachShadow({ mode: "open" });
    const p = doc.createElement("p");
    p.className = "faint";
    p.textContent = "late root";
    const q = doc.createElement("span");
    q.setAttribute("style", "padding: 1px; color: rgb(220, 220, 220)");
    q.textContent = "inline";
    sr.append(p, q);
    return { sr, p, q, before: sr.innerHTML };
  };
  return { win, doc, clock, engine, host, attach, fresh: () => createApplier(doc, { style: styleHost }).restore() };
}

const midnight = THEMES.find((t) => t.id === "midnight")!;
const floor = (theme: Theme): number => (theme.id === "high-contrast" ? 7 : 4.5);
const themed = (el: Element): boolean => el.hasAttribute(ENGINE_MARK);

function expectReadable(el: Element, theme: Theme, what: string): void {
  const view = el.ownerDocument.defaultView!;
  const c = parseRgb(view.getComputedStyle(el).color)!;
  const fg = toHex(c.r, c.g, c.b);
  expect(contrastRatio(fg, theme.tokens.bg), `${theme.id}: ${what} ${fg}`).toBeGreaterThanOrEqual(floor(theme));
}

type Signal = (s: ReturnType<typeof setup>, p: Element) => void;
const SIGNALS: Array<[string, Signal]> = [
  ["a class change on the host", (s) => void (s.host.className = "ready")],
  ["light children rendered into the host", (s) => void s.host.append(s.doc.createElement("i"))],
  ["a pointer event from inside the root", (s, p) => void p.dispatchEvent(new s.win.MouseEvent("mouseover", { bubbles: true, composed: true }))],
  ["a focus event from inside the root", (s, p) => void p.dispatchEvent(new s.win.FocusEvent("focusin", { bubbles: true, composed: true }))],
];

describe.each(SIGNALS)("late shadow root picked up by %s", (_what, signal) => {
  it.each(THEMES.map((t) => [t.id, t] as const))("I7: late shadow root is themed, observed once, and fully restored, under %s", async (_id, theme) => {
    const s = setup(theme);
    s.engine.apply();
    const { sr, p, q, before } = s.attach();
    signal(s, p);
    await s.clock.settle();
    expect(themed(p)).toBe(true);
    expectReadable(p, theme, "text in a late root");
    expectReadable(q, theme, "inline-styled text in a late root");

    // Observed: what the component renders next is themed too.
    const later = s.doc.createElement("p");
    later.className = "faint";
    later.textContent = "later";
    sr.append(later);
    await s.clock.settle();
    expect(themed(later)).toBe(true);
    expectReadable(later, theme, "node added to an adopted root");

    // Once: another signal on the host does not collect the root again (no writes inside it).
    const writes: MutationRecord[] = [];
    const spy = new s.win.MutationObserver((r) => void writes.push(...r));
    spy.observe(sr, { subtree: true, attributes: true, attributeFilter: ["style", ENGINE_MARK] });
    s.host.className = "again";
    await s.clock.settle();
    expect(writes.filter((r) => r.target !== s.host)).toEqual([]);
    spy.disconnect();

    s.engine.restore();
    const restored = sr.innerHTML.replace(/<p class="faint">later<\/p>$/, "");
    expect(restored).toBe(before);
    expect(sr.querySelectorAll(`[${ENGINE_MARK}]`).length).toBe(0);
  });
});

describe("I7: a late root leaves nothing behind", () => {
  it("I7: no timers or observers remain after restore with a late root", async () => {
    const s = setup(midnight);
    // Track the engine's observers: one still observing after restore is a leak even if nothing reacts to it.
    const live = new Set<MutationObserver>();
    const w = s.win as unknown as { MutationObserver: typeof MutationObserver };
    const Base = w.MutationObserver;
    w.MutationObserver = class extends Base {
      override observe(target: Node, options?: MutationObserverInit): void {
        live.add(this);
        super.observe(target, options);
      }
      override disconnect(): void {
        live.delete(this);
        super.disconnect();
      }
    };
    s.engine.apply();
    const { sr, p } = s.attach();
    s.host.className = "ready";
    await s.clock.settle();
    expect(themed(p)).toBe(true);
    expect(live.size).toBe(1);
    s.engine.restore();
    expect(s.clock.pending()).toBe(0);
    expect(live.size).toBe(0);

    // Activity inside and around the root schedules nothing and themes nothing.
    const after = s.doc.createElement("p");
    after.className = "faint";
    sr.append(after);
    p.className = "other";
    s.host.className = "later";
    p.dispatchEvent(new s.win.MouseEvent("mouseover", { bubbles: true, composed: true }));
    await microtasks();
    expect(s.clock.pending()).toBe(0);
    expect(themed(after)).toBe(false);
    expect(after.hasAttribute("style")).toBe(false);
  });

  it("I7: a root attached after restore is not picked up by the stopped engine", async () => {
    const s = setup(midnight);
    s.engine.apply();
    s.engine.restore();
    const { p } = s.attach();
    s.host.className = "ready";
    p.dispatchEvent(new s.win.MouseEvent("mouseover", { bubbles: true, composed: true }));
    await microtasks();
    expect(s.clock.pending()).toBe(0);
    expect(themed(p)).toBe(false);
  });

  it("closed roots stay a documented limitation: not reachable, left alone", async () => {
    const s = setup(midnight);
    s.engine.apply();
    const sr = s.host.attachShadow({ mode: "closed" });
    const p = s.doc.createElement("p");
    p.className = "faint";
    sr.append(p);
    s.host.className = "ready";
    await s.clock.settle();
    expect(themed(p)).toBe(false);
    expect(p.hasAttribute("style")).toBe(false);
    s.engine.restore();
  });
});

describe("D4: fresh-instance cleanup and late roots", () => {
  it("D4: fresh-instance cleanup removes engine writes inside a late shadow root", async () => {
    const s = setup(midnight);
    // The lost instance: applies, is never restored (extension reload), and keeps running.
    s.engine.apply();
    const { sr, p, q, before } = s.attach();
    s.host.className = "ready";
    await s.clock.settle();
    expect(themed(p)).toBe(true);
    expect(themed(q)).toBe(true);
    s.fresh();
    expect(sr.querySelectorAll(`[${ENGINE_MARK}]`).length).toBe(0);
    expect(sr.innerHTML).toBe(before);
    // The lost instance stood down: later changes in the root are not re-themed.
    p.className = "faint again";
    await s.clock.settle();
    expect(themed(p)).toBe(false);
  });
});
