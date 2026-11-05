import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { THEMES } from "../../src/themes/index.ts";
import { createColorEngine, type EngineOptions, type StyleHost } from "../../src/engine/dom.ts";

const midnight = THEMES.find((t) => t.id === "midnight")!;
const BODY_STYLE = "background-color: rgb(255, 255, 255); color: rgb(0, 0, 0);";

type Task = () => void;

// The engine schedules through win.setTimeout / win.requestAnimationFrame. Replacing them on the
// jsdom window gives explicit control: nothing in these tests waits on real time.
function fakeClock(win: object) {
  let next = 0;
  const timers = new Map<number, Task>();
  const frames = new Map<number, Task>();
  const w = win as Record<string, unknown>;
  w["setTimeout"] = (fn: Task) => (timers.set(++next, fn), next);
  w["clearTimeout"] = (id: number) => void timers.delete(id);
  w["requestAnimationFrame"] = (fn: (t: number) => void) => (frames.set(++next, () => fn(0)), next);
  w["cancelAnimationFrame"] = (id: number) => void frames.delete(id);
  const drain = (q: Map<number, Task>) => {
    const due = [...q.values()];
    q.clear();
    for (const fn of due) fn();
  };
  return {
    pending: () => timers.size + frames.size,
    runTimers: () => drain(timers),
    runFrames: () => drain(frames),
    // Delivers mutation records, then runs whatever is due, until nothing is pending.
    // Returns the number of cycles; a feedback loop would never settle.
    async settle(): Promise<number> {
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
      return cycles;
    },
  };
}

// jsdom delivers mutation records in a promise microtask.
async function microtasks(): Promise<void> {
  for (let i = 0; i < 3; i++) await Promise.resolve();
}

function setup(body: string, head = "", opts: EngineOptions = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head>${head}</head><body style="${BODY_STYLE}">${body}</body></html>`);
  const win = dom.window;
  const doc = win.document;
  const clock = fakeClock(win);
  const engine = createColorEngine(doc, midnight, opts);
  return { win, doc, clock, engine, el: doc.getElementById("t") as HTMLElement };
}

function decls(el: HTMLElement): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  for (let i = 0; i < el.style.length; i++) {
    const prop = el.style[i]!;
    out[prop] = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];
  }
  return out;
}

function hover(win: JSDOM["window"], el: Element, type = "mouseover"): void {
  el.dispatchEvent(new win.MouseEvent(type, { bubbles: true, composed: true }));
}

describe("refresh path: page wins (I5)", () => {
  it("I5: page change to an unrelated property survives a refresh and restore", async () => {
    const { clock, engine, el } = setup(`<div id="t" style="color: rgb(60, 60, 60)">x</div>`);
    engine.apply();
    expect(el.style.getPropertyPriority("color")).toBe("important");
    el.style.width = "50px";
    el.className = "rerender";
    expect(await clock.settle()).toBeGreaterThan(0);
    expect(el.style.getPropertyPriority("color")).toBe("important");
    expect(el.style.getPropertyValue("width")).toBe("50px");
    engine.restore();
    expect(decls(el)).toEqual({ color: ["rgb(60, 60, 60)", ""], width: ["50px", ""] });
  });

  it("I5: page overwrote an engine-written property; refresh re-bases and restore yields the page's latest value", async () => {
    const { clock, engine, el } = setup(`<div id="t" style="color: rgb(30, 30, 30)">x</div>`);
    engine.apply();
    el.style.color = "rgb(60, 60, 60)";
    expect(await clock.settle()).toBeGreaterThan(0);
    // Re-themed from the page's new value.
    expect(el.style.getPropertyPriority("color")).toBe("important");
    expect(el.style.getPropertyValue("color")).not.toBe("rgb(60, 60, 60)");
    engine.restore();
    expect(decls(el)).toEqual({ color: ["rgb(60, 60, 60)", ""] });
  });

  it("I5: page changes the same property twice across two refreshes; restore yields the last page value", async () => {
    const { clock, engine, el } = setup(`<div id="t" style="color: rgb(30, 30, 30)">x</div>`);
    engine.apply();
    el.style.color = "rgb(60, 60, 60)";
    await clock.settle();
    expect(el.style.getPropertyPriority("color")).toBe("important");
    el.style.color = "rgb(90, 90, 90)";
    await clock.settle();
    expect(el.style.getPropertyPriority("color")).toBe("important");
    engine.restore();
    expect(decls(el)).toEqual({ color: ["rgb(90, 90, 90)", ""] });
  });

  it("I5: page removes the style attribute while themed; refresh does not resurrect original declarations", async () => {
    const { clock, engine, el } = setup(
      `<div id="t" style="color: rgb(30, 30, 30); width: 10px">x</div>`,
      `<style>#t { background-color: rgb(240, 240, 240); }</style>`,
    );
    engine.apply();
    expect(el.style.getPropertyPriority("background-color")).toBe("important");
    el.removeAttribute("style");
    expect(await clock.settle()).toBeGreaterThan(0);
    // Still themed (from the stylesheet), but the page's removal of color and width stands.
    expect(el.style.getPropertyPriority("background-color")).toBe("important");
    expect(el.style.getPropertyValue("color")).toBe("");
    expect(el.style.getPropertyValue("width")).toBe("");
    engine.restore();
    expect(el.hasAttribute("style")).toBe(false);
  });
});

describe("refresh path: transition hold goes through the ledger (I2)", () => {
  it("I2: class-change refresh of an element with no style attribute leaves no style attribute after restore", async () => {
    const { clock, engine, el } = setup(`<div id="t">x</div>`, `<style>#t { background-color: rgb(240, 240, 240); }</style>`);
    engine.apply();
    expect(el.hasAttribute("data-skinly-engine")).toBe(true);
    el.className = "open";
    await microtasks();
    clock.runTimers();
    expect(el.style.getPropertyValue("transition")).toBe("none");
    expect(el.style.getPropertyPriority("transition")).toBe("important");
    clock.runFrames();
    expect(el.style.getPropertyValue("transition")).toBe("");
    expect(el.style.getPropertyPriority("background-color")).toBe("important");
    engine.restore();
    expect(el.hasAttribute("style")).toBe(false);
  });

  it("I2: original transition is restored exactly after a refresh", async () => {
    const text = "transition:color 1s;color:#1e1e1e";
    const { clock, engine, el } = setup(`<div id="t" style="${text}">x</div>`);
    engine.apply();
    el.className = "open";
    await microtasks();
    clock.runTimers();
    expect(el.style.getPropertyValue("transition")).toBe("none");
    clock.runFrames();
    expect(el.style.getPropertyValue("transition")).toBe("color 1s");
    expect(el.style.getPropertyPriority("transition")).toBe("");
    expect(el.style.getPropertyPriority("color")).toBe("important");
    engine.restore();
    expect(el.getAttribute("style")).toBe(text);
  });

  it("I2: a transition the page sets during the hold survives the release and restore", async () => {
    const { clock, engine, el } = setup(`<div id="t" style="transition: color 1s; color: rgb(30, 30, 30)">x</div>`);
    engine.apply();
    el.className = "open";
    await microtasks();
    clock.runTimers();
    expect(el.style.getPropertyValue("transition")).toBe("none");
    el.style.transition = "opacity 2s";
    await clock.settle();
    expect(el.style.getPropertyValue("transition")).toBe("opacity 2s");
    engine.restore();
    expect(decls(el)).toEqual({ transition: ["opacity 2s", ""], color: ["rgb(30, 30, 30)", ""] });
  });
});

describe("refresh path: no feedback loops, no leftovers (I7)", () => {
  it("I7: engine's own writes do not schedule another refresh (settles; zero further refresh cycles after apply)", async () => {
    const { doc, clock, engine, el } = setup(
      `<div id="t" style="color: rgb(30, 30, 30); transition: color 1s"><p style="background-color: rgb(240, 240, 240)">y</p></div>`,
    );
    engine.apply();
    await microtasks();
    expect(clock.pending()).toBe(0);
    el.className = "open";
    // One refresh (timer) and one hold release (frame); the engine's writes in both add nothing.
    expect(await clock.settle()).toBe(2);
    expect(await clock.settle()).toBe(0);
    // The body's full rescan also settles.
    doc.body.className = "dark";
    expect(await clock.settle()).toBeGreaterThan(0);
    expect(await clock.settle()).toBe(0);
    engine.restore();
  });

  it("I7: restore leaves no timers, rAF callbacks, observers, listeners, adopted sheets, root markers or transition overrides", async () => {
    const sheets: Array<{ removed: boolean }> = [];
    const styleHost: StyleHost = {
      add() {
        const s = { removed: false };
        sheets.push(s);
        return { remove: () => void (s.removed = true), isAttached: () => !s.removed };
      },
    };
    const { win, doc, clock, engine, el } = setup(
      `<div id="t"><p id="p" style="color: rgb(30, 30, 30)">y</p></div>`,
      `<style>#t { background-color: rgb(240, 240, 240); }</style>`,
      { styleHost },
    );
    const p = doc.getElementById("p")!;
    engine.apply();
    expect(sheets.length).toBe(1);
    // Leave one of each pending: a transition hold frame, a refresh timer, the body rescan timer, a hover frame.
    el.className = "open";
    await microtasks();
    clock.runTimers();
    doc.body.className = "dark";
    await microtasks();
    hover(win, p);
    expect(clock.pending()).toBe(4);
    expect(el.style.getPropertyValue("transition")).toBe("none");

    engine.restore();
    expect(clock.pending()).toBe(0);
    expect(sheets.every((s) => s.removed)).toBe(true);
    expect(doc.documentElement.hasAttribute("data-skinly")).toBe(false);
    expect(doc.querySelectorAll("[data-skinly-engine]").length).toBe(0);
    for (const e of doc.querySelectorAll<HTMLElement>("*")) expect(e.style.getPropertyValue("transition")).toBe("");
    expect(el.hasAttribute("style")).toBe(false);
    expect(decls(p as HTMLElement)).toEqual({ color: ["rgb(30, 30, 30)", ""] });

    // Observer and listeners are gone: page activity schedules nothing.
    el.className = "closed";
    p.style.color = "rgb(60, 60, 60)";
    hover(win, p);
    await microtasks();
    expect(clock.pending()).toBe(0);
  });

  it("I7: hover/focus refresh then restore returns exact original inline styles", async () => {
    const { win, doc, clock, engine, el } = setup(
      `<div id="t"><a id="a" style="color:#1e1e1e;transition:color .2s">link</a><span id="s" style="background:#f0f0f0;padding:4px">x</span></div>`,
      `<style>#t { background-color: rgb(240, 240, 240); }</style>`,
    );
    const before = doc.documentElement.outerHTML;
    const a = doc.getElementById("a")!;
    const aTransition = a.style.getPropertyValue("transition");
    expect(aTransition).not.toBe("");
    engine.apply();
    expect(a.hasAttribute("data-skinly-engine")).toBe(true);
    hover(win, a);
    clock.runFrames();
    // The hover refresh holds transitions on the elements it re-themes.
    expect(a.style.getPropertyValue("transition")).toBe("none");
    expect(el.style.getPropertyValue("transition")).toBe("none");
    await clock.settle();
    expect(a.style.getPropertyValue("transition")).toBe(aTransition);
    a.dispatchEvent(new win.FocusEvent("focusin", { bubbles: true, composed: true }));
    await clock.settle();
    hover(win, a, "mouseout");
    await clock.settle();
    engine.restore();
    expect(doc.documentElement.outerHTML).toBe(before);
  });
});

describe("refresh path: realm, text and retention", () => {
  it("realm: element inside a same-origin iframe is restored", async () => {
    const { doc, clock, engine } = setup(`<iframe id="f"></iframe>`);
    const idoc = (doc.getElementById("f") as HTMLIFrameElement).contentDocument!;
    idoc.head.innerHTML = `<style>#u { background-color: rgb(240, 240, 240); }</style>`;
    idoc.body.setAttribute("style", BODY_STYLE);
    idoc.body.innerHTML = `<div id="t" style="background:#f0f0f0;color:#1e1e1e">x</div><p id="u">y</p>`;
    const before = idoc.documentElement.outerHTML;
    const t = idoc.getElementById("t")!;
    const u = idoc.getElementById("u")!;
    engine.apply();
    expect(t.hasAttribute("data-skinly-engine")).toBe(true);
    expect(u.hasAttribute("data-skinly-engine")).toBe(true);
    // A refresh inside the iframe goes through the same ledger.
    u.className = "open";
    expect(await clock.settle()).toBeGreaterThan(0);
    expect(u.style.getPropertyPriority("background-color")).toBe("important");
    u.removeAttribute("class");
    await clock.settle();
    engine.restore();
    expect(idoc.querySelectorAll("[data-skinly-engine]").length).toBe(0);
    expect(idoc.documentElement.outerHTML).toBe(before);
  });

  it("D12/I11: a refresh never writes the style attribute text", async () => {
    const text = "background-color:#336699;color:#1e1e1e;transition:color 1s";
    const { win, clock, engine, el } = setup(`<div id="t" style="${text}">x</div>`);
    engine.apply();
    expect(el.getAttribute("style")).not.toBe(text);
    const olds: Array<string | null> = [];
    const mo = new win.MutationObserver((rs) => {
      for (const r of rs) olds.push(r.oldValue);
    });
    mo.observe(el, { attributes: true, attributeFilter: ["style"], attributeOldValue: true });
    el.className = "open";
    expect(await clock.settle()).toBeGreaterThan(0);
    for (const r of mo.takeRecords()) olds.push(r.oldValue);
    mo.disconnect();
    // Every value the refresh wrote: each record's old value is the previous write's result.
    const written = [...olds.slice(1), el.getAttribute("style")];
    expect(written.length).toBeGreaterThan(1);
    expect(written).not.toContain(text);
    engine.restore();
    expect(el.getAttribute("style")).toBe(text);
  });

  it("retention: restore() releases all tracked elements", async () => {
    const text = "padding:4px;margin:0";
    const { clock, engine, el } = setup(
      `<div id="t" class="card" style="${text}">x</div><p style="color: rgb(30, 30, 30)">y</p>`,
      `<style>.card { background-color: rgb(240, 240, 240); }</style>`,
    );
    engine.apply();
    expect(el.hasAttribute("data-skinly-engine")).toBe(true);
    // The element stops needing a theme, but its original text is still owed to the final restore.
    el.className = "";
    await clock.settle();
    expect(el.style.getPropertyValue("background-color")).toBe("");
    expect(el.getAttribute("style")).not.toBe(text);
    expect(engine.modifiedCount()).toBeGreaterThan(0);
    engine.restore();
    expect(el.getAttribute("style")).toBe(text);
    expect(engine.modifiedCount()).toBe(0);
    // Nothing is held: a second restore does not touch the element even when the text would fit.
    el.setAttribute("style", "padding: 4px; margin: 0px;");
    engine.restore();
    expect(el.getAttribute("style")).toBe("padding: 4px; margin: 0px;");
    expect(engine.modifiedCount()).toBe(0);
    expect(clock.pending()).toBe(0);
  });
});
