import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { THEMES } from "../../src/themes/index.ts";
import { createColorEngine } from "../../src/engine/dom.ts";

const midnight = THEMES.find((t) => t.id === "midnight")!;

// jsdom has no requestAnimationFrame unless asked; a manual one lets a test stop between the
// hover refresh and the frame that lifts the transition override.
function setup(target: string, head = "", manualFrames = false) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head>${head}</head>
    <body style="background-color: rgb(255, 255, 255); color: rgb(0, 0, 0);">${target}</body></html>`);
  const win = dom.window;
  const frames = new Map<number, () => void>();
  if (manualFrames) {
    let next = 0;
    Object.assign(win, {
      requestAnimationFrame: (cb: () => void) => {
        frames.set(++next, cb);
        return next;
      },
      cancelAnimationFrame: (id: number) => {
        frames.delete(id);
      },
    });
  }
  const runFrame = () => {
    const list = [...frames.values()];
    frames.clear();
    for (const cb of list) cb();
  };
  const doc = win.document;
  const engine = createColorEngine(doc, midnight);
  const el = doc.getElementById("t")!;
  const settle = (ms = 20) => new Promise<void>((r) => win.setTimeout(r, ms));
  const hover = (target: Element = el) => target.dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
  return { dom, win, doc, engine, el, frames, runFrame, settle, hover };
}

function decls(el: HTMLElement): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  for (let i = 0; i < el.style.length; i++) {
    const prop = el.style[i]!;
    out[prop] = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];
  }
  return out;
}

describe("engine refresh keeps the ledger (I5)", () => {
  it("I5: a page change to an engine-written prop survives a refresh, and restore yields the page's latest value", async () => {
    const { engine, el, settle } = setup(`<div id="t" style="color: red; width: 10px">x</div>`);
    engine.apply();
    expect(el.style.getPropertyPriority("color")).toBe("important");
    el.style.color = "blue";
    await settle();
    // The refresh re-themed from the page's value: the engine owns the prop again.
    expect(el.style.getPropertyPriority("color")).toBe("important");
    expect(el.style.getPropertyValue("color")).not.toBe("blue");
    expect(el.hasAttribute("data-skinly-engine")).toBe(true);
    engine.restore();
    expect(decls(el)).toEqual({ color: ["blue", ""], width: ["10px", ""] });
  });

  it("I5: a page change survives two refreshes in a row", async () => {
    const { engine, el, settle, hover } = setup(`<div id="t" style="color: red">x</div>`);
    engine.apply();
    el.style.color = "blue";
    await settle();
    hover();
    await settle();
    el.className = "again";
    await settle();
    engine.restore();
    expect(decls(el)).toEqual({ color: ["blue", ""] });
  });

  it("I5: a prop the page removed is not resurrected by a refresh or by restore", async () => {
    const { engine, el, settle } = setup(`<div id="t" style="color: red; width: 10px">x</div>`);
    engine.apply();
    el.style.removeProperty("color");
    await settle();
    // Inherited colour again: the engine no longer writes it and leaves the slot empty.
    expect(el.style.getPropertyValue("color")).toBe("");
    engine.restore();
    expect(decls(el)).toEqual({ width: ["10px", ""] });
  });

  it("I5: the page replacing the whole style attribute survives a refresh and restore", async () => {
    const { engine, el, settle } = setup(`<div id="t" style="color: red; width: 10px">x</div>`);
    engine.apply();
    el.setAttribute("style", "background-color: rgb(240, 240, 240); height: 5px");
    await settle();
    expect(el.style.getPropertyPriority("background-color")).toBe("important");
    expect(el.style.getPropertyValue("height")).toBe("5px");
    expect(el.style.getPropertyValue("width")).toBe("");
    engine.restore();
    expect(decls(el)).toEqual({ "background-color": ["rgb(240, 240, 240)", ""], height: ["5px", ""] });
  });

  it("I3: an unrelated prop the page set survives a refresh and restore", async () => {
    const { engine, el, settle } = setup(`<div id="t" style="color: red">x</div>`);
    engine.apply();
    el.style.width = "50px";
    el.className = "again";
    await settle();
    expect(el.style.getPropertyValue("width")).toBe("50px");
    expect(el.style.getPropertyPriority("color")).toBe("important");
    engine.restore();
    expect(decls(el)).toEqual({ color: ["red", ""], width: ["50px", ""] });
  });

  it("I5: a stylesheet change that drops the colour is followed: the engine stops writing it", async () => {
    const { doc, engine, el, settle } = setup(`<div id="t">x</div>`, `<style>.tint { background-color: rgb(240, 240, 240); }</style>`);
    el.className = "tint";
    engine.apply();
    expect(el.style.getPropertyPriority("background-color")).toBe("important");
    el.className = "";
    await settle();
    expect(el.style.getPropertyValue("background-color")).toBe("");
    expect(el.hasAttribute("data-skinly-engine")).toBe(false);
    expect(el.hasAttribute("style")).toBe(false);
    engine.restore();
    expect(el.hasAttribute("style")).toBe(false);
    expect(doc.querySelectorAll("[data-skinly-engine]").length).toBe(0);
  });

  it("a refresh with no page change writes the same values, and restore stays byte-exact", async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body style="background-color:#ffffff;color:#000000">
      <div id="t" style="background:#336699;padding:4px"><span id="s" style="color:#222222">x</span></div></body></html>`);
    const win = dom.window;
    const doc = win.document;
    const before = doc.documentElement.outerHTML;
    const engine = createColorEngine(doc, midnight);
    engine.apply();
    const el = doc.getElementById("t")!;
    const span = doc.getElementById("s")!;
    const themed = [decls(el), decls(span)];
    span.dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
    await new Promise<void>((r) => win.setTimeout(r, 20));
    expect([decls(el), decls(span)]).toEqual(themed);
    engine.restore();
    expect(doc.documentElement.outerHTML).toBe(before);
  });
});

describe("transition suppression goes through the ledger (I2, I6)", () => {
  it("I6: a stylesheet-themed element refreshed by a class change ends with no style attribute", async () => {
    const { engine, el, settle } = setup(`<div id="t">x</div>`, `<style>#t { background-color: rgb(240, 240, 240); }</style>`);
    engine.apply();
    el.className = "again";
    await settle();
    expect(el.style.getPropertyValue("transition")).toBe("");
    expect(el.style.getPropertyPriority("background-color")).toBe("important");
    engine.restore();
    expect(el.hasAttribute("style")).toBe(false);
  });

  it("I6/I7: restore during a pending transition override leaves no attribute, override, or frame", () => {
    const { engine, el, frames, runFrame, hover } = setup(`<div id="t">x</div>`, `<style>#t { background-color: rgb(240, 240, 240); }</style>`, true);
    engine.apply();
    hover();
    runFrame(); // hover refresh
    expect(el.style.getPropertyValue("transition")).toBe("none");
    expect(el.style.getPropertyPriority("transition")).toBe("important");
    expect(frames.size).toBe(1); // the frame that lifts the override
    engine.restore();
    expect(frames.size).toBe(0);
    expect(el.hasAttribute("style")).toBe(false);
    expect(el.hasAttribute("data-skinly-engine")).toBe(false);
  });

  it("I6: an element the engine only touched for the override is released after the frame", () => {
    // Inherited colours only: the refresh writes nothing but `transition`.
    const { engine, el, runFrame, hover } = setup(`<div id="t">x</div>`, "", true);
    engine.apply();
    expect(el.hasAttribute("style")).toBe(false);
    hover();
    runFrame();
    expect(el.style.getPropertyValue("transition")).toBe("none");
    expect(el.hasAttribute("data-skinly-engine")).toBe(true);
    runFrame();
    expect(el.hasAttribute("style")).toBe(false);
    expect(el.hasAttribute("data-skinly-engine")).toBe(false);
    engine.restore();
    expect(el.hasAttribute("style")).toBe(false);
  });

  it("I2: an original inline transition comes back after the frame and on restore", () => {
    const { engine, el, runFrame, hover } = setup(`<div id="t" style="transition: color 1s; color: red">x</div>`, "", true);
    const before = decls(el);
    engine.apply();
    hover();
    runFrame();
    expect(el.style.getPropertyValue("transition")).toBe("none");
    runFrame();
    expect(el.style.getPropertyValue("transition")).toBe("color 1s");
    expect(el.style.getPropertyPriority("transition")).toBe("");
    hover();
    runFrame();
    engine.restore(); // with the override pending again
    expect(decls(el)).toEqual(before);
  });

  it("I5: a page change to transition during the override wins", () => {
    const { engine, el, runFrame, hover } = setup(`<div id="t" style="transition: color 1s; color: red">x</div>`, "", true);
    engine.apply();
    hover();
    runFrame();
    el.style.transition = "opacity 2s";
    runFrame();
    expect(el.style.getPropertyValue("transition")).toBe("opacity 2s");
    hover();
    runFrame();
    el.style.transition = "opacity 3s";
    engine.restore();
    expect(decls(el)).toEqual({ transition: ["opacity 3s", ""], color: ["red", ""] });
  });
});

describe("no feedback loops (I7)", () => {
  it("I7: a refresh settles: engine writes do not re-trigger the engine", async () => {
    const { win, doc, engine, el, settle } = setup(`<div id="t" style="color: red"><p style="color: rgb(30, 30, 30)">y</p></div>`);
    engine.apply();
    let writes = 0;
    const mo = new win.MutationObserver((rs) => {
      writes += rs.length;
    });
    mo.observe(doc, { subtree: true, attributes: true, attributeFilter: ["style"] });
    el.style.color = "blue"; // one page write
    await settle(40);
    writes += mo.takeRecords().length;
    const afterRefresh = writes;
    expect(afterRefresh).toBeGreaterThan(1); // the page write plus the engine's re-theme
    await settle(60);
    writes += mo.takeRecords().length;
    expect(writes).toBe(afterRefresh);
    mo.disconnect();
    engine.restore();
    expect(el.style.getPropertyValue("color")).toBe("blue");
  });

  it("I7: after restore, page style changes cause no engine writes", async () => {
    const { win, doc, engine, el, settle } = setup(`<div id="t" style="color: red">x</div>`);
    engine.apply();
    engine.restore();
    const seen: string[] = [];
    const mo = new win.MutationObserver((rs) => {
      for (const r of rs) seen.push(String((r.target as Element).getAttribute("style")));
    });
    mo.observe(doc, { subtree: true, attributes: true, attributeFilter: ["style"] });
    el.style.color = "green";
    el.className = "again";
    el.dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
    await settle(40);
    seen.push(...mo.takeRecords().map((r) => String((r.target as Element).getAttribute("style"))));
    mo.disconnect();
    expect(seen).toEqual(["color: green;"]);
    expect(decls(el)).toEqual({ color: ["green", ""] });
  });
});
