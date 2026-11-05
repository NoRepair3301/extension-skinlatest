import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { THEMES } from "../../src/themes/index.ts";
import { createColorEngine, ENGINE_MARK, ENGINE_PROPS, ENGINE_SHEET_SIGNATURE, MARK_CAP, ROOT_MARK, type StyleHost } from "../../src/engine/dom.ts";
import { createApplier } from "../../src/extension/applier-core.ts";

const midnight = THEMES.find((t) => t.id === "midnight")!;
const BODY_STYLE = "background-color: rgb(255, 255, 255); color: rgb(0, 0, 0);";

type Task = () => void;

// Same idea as refresh.test.ts: the engine schedules through the jsdom window, so nothing waits on real time.
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
    async settle(): Promise<number> {
      let cycles = 0;
      await microtasks();
      while (timers.size > 0) {
        if (++cycles > 20) throw new Error("engine did not settle");
        const due = [...timers.values()];
        timers.clear();
        for (const fn of due) fn();
        await microtasks();
      }
      return cycles;
    },
  };
}

async function microtasks(): Promise<void> {
  for (let i = 0; i < 3; i++) await Promise.resolve();
}

// Adopted sheets as the browser exposes them: each rule keeps its selector, which is how the cleanup finds ours.
class Sheet {
  cssRules: Array<{ selectorText: string }> = [];
  replaceSync(css: string): void {
    this.cssRules = css.split("}").map((r) => r.split("{")[0]!.trim()).filter(Boolean).map((selectorText) => ({ selectorText }));
  }
}

const html = (inner: string, head = "") => `<!DOCTYPE html><html><head>${head}</head><body style="${BODY_STYLE}">${inner}</body></html>`;

function page(markup: string) {
  const dom = new JSDOM(markup);
  const win = dom.window;
  const doc = win.document;
  const clock = fakeClock(win);
  let sheets: Sheet[] = [];
  Object.defineProperty(doc, "adoptedStyleSheets", { configurable: true, get: () => sheets, set: (v: Sheet[]) => void (sheets = v) });
  // Mirrors the extension's adoptedSheetHost.
  const host: StyleHost = {
    add(css) {
      const s = new Sheet();
      s.replaceSync(css);
      sheets = [...sheets, s];
      return { remove: () => void (sheets = sheets.filter((x) => x !== s)), isAttached: () => sheets.includes(s) };
    },
  };
  return {
    win,
    doc,
    clock,
    host,
    sheets: () => sheets,
    // The lost instance: applies, is never restored, and (like an orphaned content script) keeps running.
    lost: () => {
      const e = createColorEngine(doc, midnight, { styleHost: host });
      e.apply();
      return e;
    },
    // What the popup's freshly injected applier does on "Restore original": it has no engine, so it cleans by markers.
    fresh: () => createApplier(doc, { style: host }).restore(),
    el: (id: string) => doc.getElementById(id) as HTMLElement,
    marked: () => doc.querySelectorAll(`[${ENGINE_MARK}]`).length,
  };
}

function decls(el: HTMLElement): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  for (let i = 0; i < el.style.length; i++) {
    const prop = el.style[i]!;
    out[prop] = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];
  }
  return out;
}

describe("fresh-instance restore from the engine marker (D4)", () => {
  it("D4: fresh instance removes the engine sheet", () => {
    const p = page(html(`<div id="t" style="color: rgb(30, 30, 30)">x</div>`));
    // Page-owned sheets, one of them opening with `html` like the engine's theme rule.
    p.host.add("html { color: rgb(1, 2, 3) }");
    p.host.add(".site-own { color: red }");
    p.lost();
    expect(p.sheets()).toHaveLength(3);
    expect(p.sheets()[2]!.cssRules[0]!.selectorText).toBe(ENGINE_SHEET_SIGNATURE);
    p.fresh();
    expect(p.sheets().map((s) => s.cssRules[0]!.selectorText)).toEqual(["html", ".site-own"]);
  });

  it("D4: fresh instance reverts engine inline props and removes element and root markers", () => {
    const p = page(html(`<div id="t">x</div><p id="u" style="color: rgb(30, 30, 30); width: 10px">y</p>`, `<style>#t { background-color: rgb(240, 240, 240); }</style>`));
    const before = p.doc.documentElement.outerHTML;
    p.lost();
    expect(p.marked()).toBeGreaterThan(0);
    expect(p.doc.documentElement.getAttribute(ROOT_MARK)).toBe("on");
    expect(p.el("t").style.getPropertyPriority("background-color")).toBe("important");
    p.fresh();
    expect(p.marked()).toBe(0);
    expect(p.doc.documentElement.hasAttribute(ROOT_MARK)).toBe(false);
    expect(p.el("t").hasAttribute("style")).toBe(false);
    expect(decls(p.el("u"))).toEqual({ color: ["rgb(30, 30, 30)", ""], width: ["10px", ""] });
    expect(p.doc.documentElement.outerHTML).toBe(before);
  });

  it("D4: fresh instance restores page-owned inline originals recorded in the marker (value and priority)", () => {
    const p = page(html(
      `<div id="t" style="color: red !important; width: 10px; --surface-bg: rgb(240, 240, 240)">x</div>` +
      `<span id="u" style="background-color: rgb(250, 250, 250) !important">y</span>`,
    ));
    const t0 = decls(p.el("t"));
    const u0 = decls(p.el("u"));
    p.lost();
    expect(p.el("t").style.getPropertyValue("color")).not.toBe("red");
    expect(p.el("t").style.getPropertyValue("--surface-bg")).not.toBe(t0["--surface-bg"]![0]);
    expect(p.el("u").style.getPropertyValue("background-color")).not.toBe("rgb(250, 250, 250)");
    expect(p.el("t").getAttribute(ENGINE_MARK)).toContain(";color!=red");
    p.fresh();
    expect(decls(p.el("t"))).toEqual(t0);
    expect(decls(p.el("u"))).toEqual(u0);
  });

  it("D4: element with no original style attribute ends with none", () => {
    const p = page(html(`<div id="t"><a id="u" href="#">x</a></div>`, `<style>#t { background-color: rgb(240, 240, 240); color: rgb(20, 20, 20); } #u { color: rgb(0, 0, 238); }</style>`));
    p.lost();
    expect(p.el("t").hasAttribute("style")).toBe(true);
    expect(p.el("u").hasAttribute("style")).toBe(true);
    expect(p.el("t").getAttribute(ENGINE_MARK)).toMatch(/^[0-9a-z]+-$/);
    p.fresh();
    expect(p.el("t").hasAttribute("style")).toBe(false);
    expect(p.el("u").hasAttribute("style")).toBe(false);
  });

  it("D4: page-changed property (no longer important) is left alone", () => {
    const p = page(html(`<div id="t" style="color: rgb(30, 30, 30); background-color: rgb(240, 240, 240); border-top: 1px solid rgb(200, 200, 200)">x</div>`));
    p.lost();
    const el = p.el("t");
    expect(el.style.getPropertyPriority("color")).toBe("important");
    expect(el.style.getPropertyPriority("border-top-color")).toBe("important");
    el.style.setProperty("color", "blue");
    el.style.removeProperty("border-top-color");
    p.fresh();
    expect(el.style.getPropertyValue("color")).toBe("blue");
    expect(el.style.getPropertyPriority("color")).toBe("");
    expect(el.style.getPropertyValue("border-top-color")).toBe("");
    expect(el.style.getPropertyValue("background-color")).toBe("rgb(240, 240, 240)");
    expect(el.style.getPropertyPriority("background-color")).toBe("");
  });

  it("D4: properties the engine never writes are untouched (I3)", () => {
    // #c inherits its colour from #p, so the engine writes only its background: its own
    // `color ... !important` looks like an engine write but must stay. (S3.4: `inherit`, because an
    // own value equal to the parent's no longer counts as inherited; bug A.)
    const p = page(html(`<div id="p" style="color: rgb(200, 0, 0)"><span id="c" style="color: inherit !important; width: 10px !important; background-color: rgb(240, 240, 240)">x</span></div>`));
    p.lost();
    const c = p.el("c");
    expect(c.style.getPropertyPriority("background-color")).toBe("important");
    expect(c.style.getPropertyValue("color")).toBe("inherit");
    c.style.setProperty("margin-top", "3px", "important");
    p.fresh();
    expect(decls(c)).toEqual({
      color: ["inherit", "important"],
      width: ["10px", "important"],
      "background-color": ["rgb(240, 240, 240)", ""],
      "margin-top": ["3px", "important"],
    });
  });

  it("D4: oversized originals degrade safely (no giant attribute, no throw)", () => {
    // 60 inline colour custom properties: the engine rewrites each, so their originals exceed the cap.
    const many = Array.from({ length: 60 }, (_, i) => `--surface-bg-${i}: rgb(240, 240, ${100 + i})`).join("; ");
    // A long non-colour style text: only the text is dropped, the colour original is kept.
    const pad = Array.from({ length: 150 }, (_, i) => `--pad-${i}:1px`).join(";");
    const p = page(html(`<div id="t" style="color: rgb(30, 30, 30); ${many}">x</div><p id="u" style="color:rgb(30, 30, 30);${pad}">y</p>`));
    p.lost();
    const t = p.el("t");
    const u = p.el("u");
    expect(t.style.getPropertyValue("--surface-bg-0")).not.toBe("rgb(240, 240, 100)");
    const tm = t.getAttribute(ENGINE_MARK)!;
    const um = u.getAttribute(ENGINE_MARK)!;
    expect(tm.length).toBeLessThanOrEqual(MARK_CAP);
    expect(tm).toMatch(/^[0-9a-z]+\*$/);
    expect(um.length).toBeLessThanOrEqual(MARK_CAP);
    expect(um).toContain(";color=rgb(30, 30, 30)");
    expect(um).not.toContain(";=");
    expect(() => p.fresh()).not.toThrow();
    expect(p.marked()).toBe(0);
    // Originals lost: the engine's listed writes are removed rather than left themed.
    for (const prop of ENGINE_PROPS) expect(t.style.getPropertyPriority(prop)).toBe("");
    expect(t.style.getPropertyValue("color")).toBe("");
    expect(decls(u)["color"]).toEqual(["rgb(30, 30, 30)", ""]);
    expect(u.style.getPropertyValue("--pad-149")).toBe("1px");
  });

  it("D4: cleanup is idempotent and a no-op on an untouched page", () => {
    const untouched = page(html(`<div id="t" style="color: red !important">x</div>`, `<style>#t { background-color: rgb(240, 240, 240); }</style>`));
    const pristine = untouched.doc.documentElement.outerHTML;
    expect(() => untouched.fresh()).not.toThrow();
    expect(untouched.doc.documentElement.outerHTML).toBe(pristine);

    const p = page(html(`<div id="t" style="color: red; width: 10px">x</div>`));
    const before = p.doc.documentElement.outerHTML;
    p.lost();
    p.fresh();
    const once = p.doc.documentElement.outerHTML;
    expect(once).toBe(before);
    expect(() => p.fresh()).not.toThrow();
    expect(p.doc.documentElement.outerHTML).toBe(once);
    expect(p.sheets()).toHaveLength(0);
  });

  it("D4: shadow root and same-origin iframe contents are cleaned", () => {
    const p = page(html(`<div id="host"></div><iframe id="f"></iframe>`));
    const shadow = p.el("host").attachShadow({ mode: "open" });
    const inner = p.doc.createElement("div");
    inner.setAttribute("style", "background-color: rgb(240, 240, 240); color: rgb(20, 20, 20)");
    shadow.append(inner);
    const idoc = (p.el("f") as HTMLIFrameElement).contentDocument!;
    idoc.body.setAttribute("style", BODY_STYLE);
    idoc.body.innerHTML = `<div id="t" style="color: rgb(30, 30, 30)">x</div><div id="u">y</div>`;
    idoc.head.innerHTML = `<style>#u { background-color: rgb(240, 240, 240); }</style>`;
    const t = idoc.getElementById("t")!;
    const u = idoc.getElementById("u")!;
    p.lost();
    for (const el of [inner, t, u]) expect(el.hasAttribute(ENGINE_MARK)).toBe(true);
    p.fresh();
    for (const el of [inner, t, u]) expect(el.hasAttribute(ENGINE_MARK)).toBe(false);
    expect(decls(inner)).toEqual({ "background-color": ["rgb(240, 240, 240)", ""], color: ["rgb(20, 20, 20)", ""] });
    expect(inner.getAttribute("style")).toBe("background-color: rgb(240, 240, 240); color: rgb(20, 20, 20)");
    expect(decls(t)).toEqual({ color: ["rgb(30, 30, 30)", ""] });
    expect(u.hasAttribute("style")).toBe(false);
  });

  it("D4/I7: marker writes do not trigger another refresh cycle", async () => {
    const p = page(html(`<div id="t" style="color: rgb(30, 30, 30)">x</div>`, `<style>#t { background-color: rgb(240, 240, 240); }</style>`));
    const engine = p.lost();
    expect(p.clock.pending()).toBe(0);
    expect(await p.clock.settle()).toBe(0);
    // A page change re-bases the original, so the refresh rewrites the marker: one cycle, then quiet.
    const el = p.el("t");
    const first = el.getAttribute(ENGINE_MARK);
    el.style.setProperty("color", "rgb(40, 40, 40)");
    expect(await p.clock.settle()).toBeGreaterThan(0);
    expect(el.getAttribute(ENGINE_MARK)).not.toBe(first);
    expect(el.getAttribute(ENGINE_MARK)).toContain(";color=rgb(40, 40, 40)");
    expect(await p.clock.settle()).toBe(0);
    engine.restore();
  });

  it("D4: a lost instance that is still running stands down once cleaned", async () => {
    const p = page(html(`<div id="t" style="color: rgb(30, 30, 30)">x</div>`, `<style>#t { background-color: rgb(240, 240, 240); }</style>`));
    const before = p.doc.documentElement.outerHTML;
    const orphan = p.lost();
    p.fresh();
    await p.clock.settle();
    // Page activity that would make a live engine re-theme.
    p.el("t").className = "open";
    p.el("t").dispatchEvent(new p.win.MouseEvent("mouseover", { bubbles: true }));
    await p.clock.settle();
    expect(orphan.isActive()).toBe(false);
    expect(p.marked()).toBe(0);
    expect(p.doc.documentElement.hasAttribute(ROOT_MARK)).toBe(false);
    expect(p.el("t").style.getPropertyPriority("color")).toBe("");
    p.el("t").removeAttribute("class");
    expect(p.doc.documentElement.outerHTML).toBe(before);
  });

  it("D4: apply -> fresh instance cleanup -> apply again does not stack sheets or markers", async () => {
    const p = page(html(`<div id="t" style="color: rgb(30, 30, 30)"><p id="u">y</p></div>`, `<style>#u { background-color: rgb(240, 240, 240); }</style>`));
    const before = p.doc.documentElement.outerHTML;
    p.lost();
    const count = p.marked();
    const marks = [...p.doc.querySelectorAll(`[${ENGINE_MARK}]`)].map((e) => e.getAttribute(ENGINE_MARK));
    p.fresh();
    const again = createColorEngine(p.doc, midnight, { styleHost: p.host });
    again.apply();
    await p.clock.settle();
    expect(p.sheets().filter((s) => s.cssRules[0]!.selectorText === ENGINE_SHEET_SIGNATURE)).toHaveLength(1);
    expect(p.marked()).toBe(count);
    // The new instance recorded the page's originals, not the lost instance's theme.
    expect([...p.doc.querySelectorAll(`[${ENGINE_MARK}]`)].map((e) => e.getAttribute(ENGINE_MARK))).toEqual(marks);
    again.restore();
    await p.clock.settle();
    expect(p.sheets()).toHaveLength(0);
    expect(p.doc.documentElement.outerHTML).toBe(before);
  });

  it("D4/D12: fresh instance gives back un-normalised legacy style text when nothing changed", () => {
    const p = page(readFileSync("fixtures/web/legacy-portal-fonts.html", "utf8"));
    const before = p.doc.documentElement.outerHTML;
    p.lost();
    expect(p.marked()).toBeGreaterThan(0);
    p.fresh();
    expect(p.doc.documentElement.outerHTML).toBe(before);
  });
});

describe("live restore is unchanged (D12)", () => {
  it("D12: live restore still returns the exact original outerHTML for a legacy-portal style fixture", () => {
    for (const name of ["legacy-portal-fonts", "legacy-portal-tables"]) {
      const p = page(readFileSync(`fixtures/web/${name}.html`, "utf8"));
      const before = p.doc.documentElement.outerHTML;
      const engine = createColorEngine(p.doc, midnight, { styleHost: p.host });
      engine.apply();
      expect(p.marked(), name).toBeGreaterThan(0);
      engine.restore();
      expect(p.doc.documentElement.outerHTML, name).toBe(before);
      expect(p.sheets(), name).toHaveLength(0);
    }
  });
});
