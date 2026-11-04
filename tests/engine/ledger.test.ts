import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { THEMES } from "../../src/themes/index.ts";
import { createColorEngine } from "../../src/engine/dom.ts";

const midnight = THEMES.find((t) => t.id === "midnight")!;

// The body carries its own colours so that a child with a different inline colour is themed.
function setup(target: string, head = "") {
  const dom = new JSDOM(`<!DOCTYPE html><html><head>${head}</head>
    <body style="background-color: rgb(255, 255, 255); color: rgb(0, 0, 0);">${target}</body></html>`);
  const doc = dom.window.document;
  const engine = createColorEngine(doc, midnight);
  return { doc, engine, el: doc.getElementById("t")! };
}

function decls(el: HTMLElement): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  for (let i = 0; i < el.style.length; i++) {
    const prop = el.style[i]!;
    out[prop] = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];
  }
  return out;
}

describe("engine ledger and guarded restore", () => {
  it("I6: an element with no style attribute ends with none", () => {
    const { engine, el } = setup(`<div id="t">x</div>`, `<style>#t { background-color: rgb(240, 240, 240); }</style>`);
    engine.apply();
    expect(el.hasAttribute("data-skinly-engine")).toBe(true);
    expect(el.hasAttribute("style")).toBe(true);
    engine.restore();
    expect(el.hasAttribute("style")).toBe(false);
  });

  it("I2/I4: original inline declarations come back with the same values and priorities", () => {
    const { engine, el } = setup(`<div id="t" style="color: red; width: 10px">x</div>`);
    const before = decls(el);
    engine.apply();
    expect(el.style.getPropertyPriority("color")).toBe("important");
    expect(el.style.getPropertyValue("color")).not.toBe("red");
    engine.restore();
    expect(decls(el)).toEqual(before);
    expect(el.style.length).toBe(2);
  });

  it("I2/I4: an original !important declaration keeps its priority", () => {
    const { engine, el } = setup(`<div id="t" style="color: red !important">x</div>`);
    engine.apply();
    expect(el.style.getPropertyValue("color")).not.toBe("red");
    engine.restore();
    expect(el.style.getPropertyValue("color")).toBe("red");
    expect(el.style.getPropertyPriority("color")).toBe("important");
    expect(el.style.length).toBe(1);
  });

  it("I6: an originally empty style attribute is kept", () => {
    const { engine, el } = setup(`<div id="t" style="">x</div>`, `<style>#t { background-color: rgb(240, 240, 240); }</style>`);
    engine.apply();
    expect(el.hasAttribute("data-skinly-engine")).toBe(true);
    engine.restore();
    expect(el.hasAttribute("style")).toBe(true);
    expect(el.style.length).toBe(0);
  });

  it("I3: a property the page set while themed survives restore, engine props are reverted", () => {
    const { engine, el } = setup(`<div id="t" style="color: red">x</div>`);
    engine.apply();
    el.style.width = "50px";
    engine.restore();
    expect(el.style.getPropertyValue("width")).toBe("50px");
    expect(el.style.getPropertyValue("color")).toBe("red");
    expect(el.style.getPropertyPriority("color")).toBe("");
    expect(el.style.length).toBe(2);
  });

  it("I4: page-changed property is not overwritten on restore", () => {
    const { engine, el } = setup(`<div id="t" style="color: red; background-color: rgb(240, 240, 240)">x</div>`);
    engine.apply();
    const themedBg = el.style.getPropertyValue("background-color");
    expect(themedBg).not.toBe("rgb(240, 240, 240)");
    el.style.color = "blue";
    engine.restore();
    expect(el.style.getPropertyValue("color")).toBe("blue");
    expect(el.style.getPropertyPriority("color")).toBe("");
    expect(el.style.getPropertyValue("background-color")).toBe("rgb(240, 240, 240)");
  });

  it("I4: a page-removed style attribute is not resurrected", () => {
    const { engine, el } = setup(`<div id="t" style="color: red; width: 10px">x</div>`);
    engine.apply();
    el.removeAttribute("style");
    engine.restore();
    expect(el.hasAttribute("style")).toBe(false);
    expect(el.style.length).toBe(0);
  });

  it("I6: the attribute stays when the page added its own declaration", () => {
    const { engine, el } = setup(`<div id="t">x</div>`, `<style>#t { background-color: rgb(240, 240, 240); }</style>`);
    engine.apply();
    expect(el.hasAttribute("data-skinly-engine")).toBe(true);
    el.style.width = "20px";
    engine.restore();
    expect(el.hasAttribute("style")).toBe(true);
    expect(decls(el)).toEqual({ width: ["20px", ""] });
  });

  it("I2: an inline custom property is restored exactly", () => {
    const { engine, el } = setup(`<div id="t" style="--surface-bg: rgb(240, 240, 240)">x</div>`);
    const original = el.style.getPropertyValue("--surface-bg");
    expect(original).not.toBe("");
    engine.apply();
    expect(el.style.getPropertyValue("--surface-bg")).not.toBe(original);
    expect(el.style.getPropertyPriority("--surface-bg")).toBe("important");
    engine.restore();
    expect(el.style.getPropertyValue("--surface-bg")).toBe(original);
    expect(el.style.getPropertyPriority("--surface-bg")).toBe("");
    expect(el.style.length).toBe(1);
  });

  it("I4: the guard compares the read-back (normalised) value, so normalised writes are reverted", () => {
    const { doc, engine, el } = setup(`<div id="t" style="color: red">x</div>`);
    // jsdom echoes the engine's rgb() strings verbatim, so emulate a browser that serialises
    // colours differently: inline `color` reads back as hex. A guard comparing against the
    // string the engine passed would then never match and never restore.
    const proto = doc.defaultView!.CSSStyleDeclaration.prototype;
    const read = proto.getPropertyValue;
    proto.getPropertyValue = function (this: CSSStyleDeclaration, prop: string) {
      const v = read.call(this, prop);
      const m = prop === "color" ? /^rgb\((\d+), (\d+), (\d+)\)$/.exec(v) : null;
      return m ? "#" + m.slice(1).map((n) => Number(n).toString(16).padStart(2, "0")).join("") : v;
    };
    engine.apply();
    expect(el.style.getPropertyValue("color")).toMatch(/^#[0-9a-f]{6}$/);
    expect(el.style.getPropertyPriority("color")).toBe("important");
    engine.restore();
    proto.getPropertyValue = read;
    expect(el.style.getPropertyValue("color")).toBe("red");
    expect(el.style.getPropertyPriority("color")).toBe("");
  });

  it("I7: restore is idempotent", () => {
    const { doc, engine, el } = setup(`<div id="t" style="color: red; width: 10px">x</div>`);
    engine.apply();
    engine.restore();
    const html = doc.documentElement.outerHTML;
    expect(() => engine.restore()).not.toThrow();
    expect(doc.documentElement.outerHTML).toBe(html);
    expect(decls(el)).toEqual({ color: ["red", ""], width: ["10px", ""] });
  });

  it("I7: restore leaves no engine markers and no modified elements", () => {
    const { doc, engine } = setup(`<div id="t" style="color: red"><p style="color: rgb(30, 30, 30)">y</p></div>`);
    engine.apply();
    expect(engine.modifiedCount()).toBeGreaterThan(0);
    engine.restore();
    expect(doc.querySelectorAll("[data-skinly-engine]").length).toBe(0);
    expect(doc.documentElement.hasAttribute("data-skinly")).toBe(false);
    expect(engine.modifiedCount()).toBe(0);
  });

  it("restore after a re-theme still returns the originals", () => {
    const { engine, el } = setup(`<div id="t" style="color: red !important; width: 10px">x</div>`);
    engine.apply();
    engine.apply();
    engine.restore();
    expect(decls(el)).toEqual({ color: ["red", "important"], width: ["10px", ""] });
  });
});
