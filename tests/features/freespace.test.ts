import { afterEach, describe, expect, it, vi } from "vitest";
import { computeGutters, usableGutters, MIN_GUTTER } from "../../src/features/freespace/index.ts";
import { collectContentRects } from "../../src/features/freespace/measure.ts";
import { watchGutters, type WatchEnv } from "../../src/features/freespace/watch.ts";

const getRect = (el: Element) => {
  const [x = 0, y = 0, w = 0, h = 0] = (el.getAttribute("data-r") ?? "0,0,0,0").split(",").map(Number);
  return { x, y, w, h };
};

describe("computeGutters", () => {
  it("a centred column gives two gutters", () => {
    const g = computeGutters([{ x: 300, w: 600 }], 1200, 1200);
    expect(g.state).toBe("ok");
    expect(g.left).toEqual({ x: 0, w: 300 });
    expect(g.right).toEqual({ x: 900, w: 300 });
  });
  it("full-width content gives none", () => {
    expect(computeGutters([{ x: 0, w: 1200 }], 1200, 1200)).toEqual({ state: "none" });
  });
  it("a sidebar of content on the left leaves one gutter (right)", () => {
    const g = computeGutters([{ x: 0, w: 200 }, { x: 200, w: 600 }], 1200, 1200);
    expect(g.left).toBeUndefined();
    expect(g.right).toEqual({ x: 800, w: 400 });
    expect(g.state).toBe("ok");
  });
  it("separates narrow from ok from none", () => {
    expect(computeGutters([{ x: 60, w: 1080 }], 1200, 1200).state).toBe("narrow");
    expect(computeGutters([{ x: 10, w: 1180 }], 1200, 1200).state).toBe("none");
    expect(computeGutters([{ x: MIN_GUTTER, w: 960 }], 1200, 1200).state).toBe("ok");
  });
  it("no content rects or a zero viewport means none; content past the viewport leaves no right gutter", () => {
    expect(computeGutters([], 1200, 1200).state).toBe("none");
    expect(computeGutters([{ x: 300, w: 600 }], 0, 0).state).toBe("none");
    expect(computeGutters([{ x: 300, w: 2000 }], 1200, 2400).right).toBeUndefined();
  });
  it("ignores non-finite rects", () => {
    expect(computeGutters([{ x: NaN, w: 10 }, { x: 300, w: 600 }], 1200, 1200).left?.w).toBe(300);
  });
  it("usableGutters respects the lane choice and the 120 px minimum", () => {
    const g = computeGutters([{ x: 130, w: 940 }], 1200, 1200);
    expect(usableGutters(g, "both")).toHaveLength(2);
    expect(usableGutters(g, "left")).toEqual([{ x: 0, w: 130 }]);
    expect(usableGutters(computeGutters([{ x: 100, w: 1000 }], 1200, 1200), "both")).toEqual([]);
  });
});

describe("collectContentRects", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });
  it("counts text, links and media but not empty wrappers, hidden elements or our own hosts", () => {
    document.body.innerHTML =
      '<div data-r="0,0,1200,900"><p data-r="300,0,600,40">hello</p><a data-r="300,50,80,20" href="#x"></a><img data-r="300,80,200,100"><span data-r="10,0,5,5"></span></div>' +
      '<div data-skinly-ui="pet"><p data-r="0,0,50,50">ours</p></div><p data-r="0,0,9,9" hidden>hid</p>';
    const rects = collectContentRects(document, getRect, (el) => el.hasAttribute("hidden"));
    expect(rects.map((r) => r.x)).toEqual([300, 300, 300]);
  });
});

describe("watchGutters", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });
  it("measures on start, debounces resize; destroy stops everything", () => {
    document.body.innerHTML = '<p data-r="300,0,600,40">x</p>';
    const timers = new Map<number, () => void>();
    let id = 1;
    const env: WatchEnv = {
      doc: document,
      win: window,
      getRect,
      setTimeout: (fn) => (timers.set(id, fn), id++),
      clearTimeout: (i) => void timers.delete(i),
      now: () => 5000,
    };
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1200);
    const seen: string[] = [];
    const w = watchGutters(env, (g) => seen.push(g.state));
    expect(seen).toEqual(["ok"]);
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
    expect(timers.size).toBe(1);
    document.body.innerHTML = '<p data-r="0,0,1200,40">wide</p>';
    for (const fn of [...timers.values()]) fn();
    expect(seen).toEqual(["ok", "none"]);
    w.destroy();
    timers.clear();
    window.dispatchEvent(new Event("resize"));
    expect(timers.size).toBe(0);
  });
});
