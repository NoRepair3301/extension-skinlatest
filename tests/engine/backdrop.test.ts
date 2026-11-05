import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { THEMES, type Theme } from "../../src/themes/index.ts";
import { createColorEngine, ENGINE_MARK } from "../../src/engine/dom.ts";
import { makeTransform } from "../../src/engine/transform.ts";
import { contrastRatio, parseRgb, toHex, type RGBA } from "../../src/engine/color.ts";
import { isDark } from "../../src/plan/contrast.ts";

// Bug B (S3.5): text contrast is measured against what is actually behind the text (own or nearest
// background, see-through layers composited, gradient stops, unseen pictures), not against the theme
// background. The measuring here is written independently of the engine's model.

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

const HEAD = `<style>
  .btn { background-color: rgb(24, 24, 28); color: rgb(250, 250, 250); }
  .cta { background-color: rgb(11, 87, 208); color: rgb(255, 255, 255); }
  .dark { background-color: rgb(18, 18, 18); color: rgb(235, 235, 235); }
  .glass { background-color: rgba(255, 255, 255, 0.12); color: rgb(230, 230, 230); }
  .grad { background-image: linear-gradient(rgb(10, 10, 10), rgb(110, 110, 110)); color: rgb(150, 150, 150); }
  .hero { background-image: url(hero.jpg); background-size: cover; color: rgb(255, 255, 255); }
  .sky { background-image: url(sky.jpg); background-size: cover; color: rgb(34, 34, 34); }
  .pale { background-image: url(pale.jpg); color: rgb(200, 200, 200); }
  .scrim { background-image: linear-gradient(rgba(0, 0, 0, 0.75), rgba(0, 0, 0, 0.75)), url(photo.jpg); background-size: auto, cover; color: rgb(255, 255, 255); }
  .icon { background: url(icon.svg) no-repeat right center; }
  .card { background-color: rgb(250, 250, 250); color: rgb(40, 40, 40); }
  .badge { background-color: rgb(30, 30, 30); color: rgb(245, 245, 245); }
  .chip { background-color: rgb(250, 250, 250); }
  .ink { color: rgb(40, 40, 40); }
  .soft { color: rgb(110, 110, 110); }
  .muted { color: rgb(120, 120, 120); }
  h1, h2 { color: rgb(17, 17, 17); }
  a { color: rgb(0, 102, 204); }
</style>`;
const BODY_STYLE = "background-color: rgb(255, 255, 255); color: rgb(20, 20, 20);";
const page = (body: string) => `<!DOCTYPE html><html><head>${HEAD}</head><body style="${BODY_STYLE}">${body}</body></html>`;

function setup(theme: Theme, body: string) {
  const dom = new JSDOM(page(body));
  const win = dom.window;
  const doc = win.document;
  const clock = fakeClock(win);
  const engine = createColorEngine(doc, theme);
  engine.apply();
  return { win, doc, clock, engine, by: (id: string) => doc.getElementById(id) as HTMLElement };
}

const EACH_THEME = THEMES.map((t) => [t.id, t] as const);
const LIGHT_THEMES = THEMES.filter((t) => !isDark(t.tokens.bg)).map((t) => [t.id, t] as const);
const floor = (theme: Theme): number => (theme.id === "high-contrast" ? 7 : 4.5);
const hostOf = (n: Element): Element | null => n.parentElement ?? ((n.getRootNode() as ShadowRoot).host ?? null);
const hex = (c: RGBA): string => toHex(c.r, c.g, c.b);
const blend = (top: RGBA, below: RGBA): RGBA => ({ r: top.r * top.a + below.r * (1 - top.a), g: top.g * top.a + below.g * (1 - top.a), b: top.b * top.a + below.b * (1 - top.a), a: 1 });

/** Every colour that can show behind el: see-through layers composited down to the first opaque one (the theme background if none). */
function behind(el: Element, theme: Theme): string[] {
  const view = el.ownerDocument.defaultView!;
  const above: RGBA[][] = []; // top first
  let base: RGBA[] = [parseRgb(theme.tokens.bg)!];
  walk: for (let n: Element | null = el; n; n = hostOf(n)) {
    const cs = view.getComputedStyle(n);
    const own: RGBA[][] = []; // top first: the gradient is painted over the colour
    if (cs.backgroundImage.includes("gradient")) own.push((cs.backgroundImage.match(/rgba?\([^)]+\)/g) ?? []).map((s) => parseRgb(s)!));
    const bg = parseRgb(cs.backgroundColor);
    if (bg && bg.a > 0) own.push([bg]);
    for (const layer of own) {
      if (layer.every((c) => c.a >= 0.999)) {
        base = layer;
        break walk;
      }
      above.push(layer);
    }
  }
  let cols = base;
  for (let i = above.length - 1; i >= 0; i--) {
    const below = cols;
    cols = above[i]!.flatMap((c) => below.map((b) => blend(c, b)));
  }
  return cols.map(hex);
}

function fgOf(el: Element): string {
  return hex(parseRgb(el.ownerDocument.defaultView!.getComputedStyle(el).color)!);
}

function worst(el: Element, theme: Theme): { ratio: number; what: string } {
  const fg = fgOf(el);
  const bgs = behind(el, theme);
  return { ratio: Math.min(...bgs.map((b) => contrastRatio(fg, b))), what: `${fg} on ${bgs.join("/")}` };
}

function expectFloor(el: Element, theme: Theme, what: string): void {
  const w = worst(el, theme);
  expect(w.ratio, `${theme.id}: ${what}: ${w.what}`).toBeGreaterThanOrEqual(floor(theme));
}

describe.each(EACH_THEME)("backdrop under %s", (_id, theme) => {
  it("I10: light text on a dark button keeps the floor under every theme", () => {
    const { by } = setup(theme, `<main><button id="b" class="btn">Buy now</button><button id="c" class="cta"><span id="cs">Send</span></button></main>`);
    expectFloor(by("b"), theme, "dark button label");
    expectFloor(by("cs"), theme, "label inside an accent button");
  });

  it("I10: text on a semi-transparent layer over a dark section", () => {
    const { by } = setup(theme, `<section class="dark"><div id="g" class="glass"><p id="p">on glass</p></div></section>`);
    expectFloor(by("g"), theme, "glass panel");
    expectFloor(by("p"), theme, "paragraph on the glass panel");
  });

  it("I10: text over a gradient backdrop uses the worst-case stop", () => {
    const { by } = setup(theme, `<div id="g" class="grad"><p id="p">over the gradient</p></div>`);
    // behind() lists every themed stop, so this is the worst one.
    expect(behind(by("p"), theme).length).toBe(2);
    expectFloor(by("p"), theme, "text over a gradient");
  });

  it("I10: text over a url() background image stays on the side of the original text", () => {
    const { by } = setup(theme, `<header class="hero"><strong id="h">Headline</strong><p id="hp">line</p></header><div class="sky"><p id="s">dark words on a light picture</p></div><div class="pale"><p id="pl">pale words</p></div><div id="sc" class="scrim"><p id="scp">over a scrim</p></div>`);
    const side = (id: string, orig: string) => {
      const fg = fgOf(by(id));
      // The picture sits on the other side of the original: the text may move away from it, never towards it.
      const light = contrastRatio(orig, "#000000") >= contrastRatio(orig, "#ffffff");
      const away = light ? "#000000" : "#ffffff";
      expect(contrastRatio(fg, away) >= contrastRatio(fg, light ? "#ffffff" : "#000000"), `${theme.id} ${id} ${fg} flipped`).toBe(true);
      expect(contrastRatio(fg, away), `${theme.id} ${id} ${fg} moved towards the picture`).toBeGreaterThanOrEqual(contrastRatio(orig, away) * 0.98);
    };
    side("h", "#ffffff");
    side("hp", "#ffffff");
    side("s", "#222222");
    side("pl", "#c8c8c8");
    // Where the theme would take the dark words across to the light side, they keep the page's own colour.
    const mapped = hex(parseRgb(makeTransform(theme, "light")("rgb(34, 34, 34)", "text"))!);
    if (contrastRatio(mapped, "#000000") > contrastRatio(mapped, "#ffffff")) expect(fgOf(by("s")), theme.id).toBe("#222222");
    // With a scrim the darkest/lightest it can be is known: the floor holds whatever the picture is.
    const fg = fgOf(by("scp"));
    expect(contrastRatio(fg, "#404040"), `${theme.id} scrim ${fg}`).toBeGreaterThanOrEqual(floor(theme));
  });

  it("no-regression: today's colour is kept wherever it meets the floor on the real backdrop", () => {
    const tf = makeTransform(theme, "light");
    // Further from the text than the theme background, so today's colour always passes there.
    const far = isDark(theme.tokens.bg) ? "#000000" : "#ffffff";
    const bd = { dark: far, light: far, image: false };
    const inputs = ["rgb(0, 102, 204)", "rgb(117, 117, 117)"];
    for (let g = 60; g <= 180; g += 4) inputs.push(`rgb(${g}, ${g}, ${g})`);
    for (const c of inputs) expect(tf(c, "text", bd), `${theme.id} ${c}`).toBe(tf(c, "text"));
  });

  it("I10: a small untiled url() image (an icon) is not taken as the backdrop", () => {
    const plain = setup(theme, `<p><a id="a" href="#">external link</a></p>`);
    const icon = setup(theme, `<p><a id="a" class="icon" href="#">external link</a></p>`);
    expect(fgOf(icon.by("a"))).toBe(fgOf(plain.by("a")));
  });

  it("I10: nested backgrounds, nearest opaque ancestor wins", () => {
    const { by } = setup(theme, `<section id="sec" class="dark"><p id="sp">section text</p><div class="card"><p id="cp">card text</p><span id="bd" class="badge">badge</span><div><span id="deep">deep in the card</span></div></div></section>`);
    expectFloor(by("sp"), theme, "text on the dark section");
    expectFloor(by("cp"), theme, "text on the card inside it");
    expectFloor(by("bd"), theme, "badge on the card");
    expectFloor(by("deep"), theme, "text two levels inside the card");
  });

  it("I10: hover or class change that alters an ancestor background re-evaluates descendant text", async () => {
    // (a) the page restyles the ancestor inline: only the ancestor is re-queued by the observer.
    const a = setup(theme, `<div id="box" class="card"><p id="i" class="ink">ink</p><p id="s" class="soft">soft</p></div>`);
    a.by("box").style.backgroundColor = "rgb(15, 15, 15)";
    await a.clock.settle();
    expectFloor(a.by("i"), theme, "ink after the ancestor turned dark");
    expectFloor(a.by("s"), theme, "soft text after the ancestor turned dark");

    // (b) a class change on an ancestor with more descendants than the observer re-queues itself.
    const many = Array.from({ length: 320 }, (_, k) => `<span id="k${k}" class="ink">x</span>`).join("");
    const b = setup(theme, `<div id="big" class="card">${many}</div>`);
    b.by("big").className = "dark";
    await b.clock.settle();
    for (const k of [0, 150, 319]) expectFloor(b.by(`k${k}`), theme, `descendant ${k} after a class change`);

    // (c) a pointer-driven background (as a :hover rule would) with no mutation: the hover refresh
    // covers the first descendants only; the rest follow because the background moved.
    const kids = Array.from({ length: 80 }, (_, k) => `<span id="h${k}" class="ink">x</span>`).join("");
    const c = setup(theme, `<div id="hov" class="card">${kids}</div>`);
    const sheet = c.doc.styleSheets[0] as CSSStyleSheet;
    sheet.insertRule("#hov { background-color: rgb(15, 15, 15); }", sheet.cssRules.length);
    c.by("hov").dispatchEvent(new c.win.MouseEvent("mouseover", { bubbles: true }));
    await c.clock.settle();
    for (const k of [0, 70, 79]) expectFloor(c.by(`h${k}`), theme, `descendant ${k} after a hover background`);
    expect(c.clock.pending()).toBe(0);
  });

  it("I10: skipped/inherited child still meets the floor on its own backdrop", async () => {
    // Same batch: the chip inherits the dark parent's light text but paints a light background.
    const a = setup(theme, `<div class="dark"><span id="c" class="chip">chip <b id="cb">bold</b></span></div>`);
    expectFloor(a.by("c"), theme, "inherited colour on its own background");
    expectFloor(a.by("cb"), theme, "inside the chip");

    // Parent settled: only the child is refreshed after it gains its own background.
    const b = setup(theme, `<div class="dark"><span id="c">plain <b id="cb">bold</b></span></div>`);
    b.by("c").className = "chip";
    await b.clock.settle();
    expectFloor(b.by("c"), theme, "inherited colour after the child gained a background");
    expectFloor(b.by("cb"), theme, "inside it");
  });

  it("I10/I8: text over a positioned media layer stays on the side of the original; the media is untouched", () => {
    const dom = new JSDOM(page(`<div id="st"><video id="v" style="position: absolute"></video><h2 id="t" style="color: rgb(255, 255, 255)">On the video</h2></div>`));
    const doc = dom.window.document;
    fakeClock(dom.window);
    const box = { x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, toJSON: () => ({}) };
    for (const id of ["st", "v"]) doc.getElementById(id)!.getBoundingClientRect = () => box as DOMRect;
    const engine = createColorEngine(doc, theme);
    engine.apply();
    const fg = fgOf(doc.getElementById("t")!);
    expect(contrastRatio(fg, "#000000"), `${theme.id} ${fg}`).toBeGreaterThanOrEqual(contrastRatio("#ffffff", "#000000") * 0.98);
    const v = doc.getElementById("v")!;
    expect(v.hasAttribute(ENGINE_MARK)).toBe(false);
    expect(v.getAttribute("style")).toBe("position: absolute");
    engine.restore();
  });

  it("I2/D12: restore is exact after backdrop-driven writes", async () => {
    const body = `<main><button class="btn">Buy</button><button class="cta"><span>Send</span></button>
      <section class="dark"><div class="glass"><p>glass</p></div><div class="card"><p>card</p><span class="badge">b</span></div>
      <div class="chip" style="padding: 2px">chip <b>bold</b></div></section>
      <div class="grad"><p>grad</p></div><header class="hero"><h1>hero</h1></header><div id="box" class="card"><p class="ink">ink</p></div>
      <div class="dark"><span id="c" style="margin:0">later chip</span></div></main>`;
    const themedDom = new JSDOM(page(body));
    const plainDom = new JSDOM(page(body));
    const clock = fakeClock(themedDom.window);
    const engine = createColorEngine(themedDom.window.document, theme);
    engine.apply();
    expect(themedDom.window.document.querySelectorAll(`[${ENGINE_MARK}]`).length).toBeGreaterThan(0);
    // The page changes itself while the theme is on (I5: its values win), identically on both copies.
    for (const d of [themedDom.window.document, plainDom.window.document]) {
      (d.getElementById("box") as HTMLElement).style.backgroundColor = "rgb(15, 15, 15)";
      d.getElementById("c")!.className = "chip";
    }
    await clock.settle();
    engine.restore();
    expect(clock.pending()).toBe(0);
    expect(themedDom.window.document.documentElement.outerHTML).toBe(plainDom.window.document.documentElement.outerHTML);
  });

  it("no-regression: ordinary page keeps its current colours", () => {
    const body = `<header><h1 id="t1">Title</h1><nav><a id="n1" href="#">Home</a> <a id="n2" href="#">About</a></nav></header>
      <main><article><h2 id="t2">Story</h2><p id="p1">Plain paragraph with <a id="l1" href="#">a link</a>.</p><p id="m1" class="muted">muted note</p>
      <div class="card"><p id="p2" class="ink">card text</p><span id="m2" class="muted">card note</span></div></article></main>`;
    const { by, doc } = setup(theme, body);
    // Today's rule: the text colour from the theme mapping, at the floor against the theme background.
    const today = makeTransform(theme, "light");
    const view = doc.defaultView!;
    const plain = new JSDOM(page(body)).window;
    let kept = 0;
    for (const id of ["t1", "n1", "n2", "t2", "p1", "l1", "m1", "p2", "m2"]) {
      const orig = plain.getComputedStyle(plain.document.getElementById(id)!).color;
      const was = today(orig, "text");
      const wasHex = hex(parseRgb(was)!);
      const okThen = Math.min(...behind(by(id), theme).map((b) => contrastRatio(wasHex, b))) >= floor(theme);
      // Only the floor may change a colour; where today's colour is readable it stays.
      if (okThen) {
        expect(view.getComputedStyle(by(id)).color, `${theme.id} ${id}`).toBe(was);
        kept++;
      } else {
        expectFloor(by(id), theme, `${id} lifted to the floor`);
      }
    }
    expect(kept).toBeGreaterThanOrEqual(7);
  });
});

describe.each(LIGHT_THEMES)("backdrop under the light theme %s", (_id, theme) => {
  it("I10: white text over a url() picture stays white (bug B acceptance shape)", () => {
    const { by } = setup(theme, `<header class="hero"><strong id="h">Headline</strong></header>`);
    expect(by("h").ownerDocument.defaultView!.getComputedStyle(by("h")).color).toBe("rgb(255, 255, 255)");
  });
});
