import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diagErrors, diagFlags, guarded, resetDiag } from "../../src/core/diag.ts";
import { attachHost, FIXED_HOST, HOST_Z, htmlEffect, mountParent, REATTACH_GAP_MS, REATTACH_MAX, styleHost } from "../../src/features/mount.ts";
import { createSceneEngine } from "../../src/features/scenes/engine.ts";
import { getScene } from "../../src/features/scenes/index.ts";
import { installSheets } from "../helpers/sheets.ts";

/** Fake clock for the bounded re-attach. */
function clock() {
  let now = 0;
  const due: Array<{ at: number; fn: () => void; id: number }> = [];
  let next = 1;
  return {
    timers: {
      now: () => now,
      setTimeout: (fn: () => void, ms: number) => {
        due.push({ at: now + ms, fn, id: next });
        return next++;
      },
      clearTimeout: (id: number) => {
        const i = due.findIndex((d) => d.id === id);
        if (i >= 0) due.splice(i, 1);
      },
    },
    advance(ms: number) {
      now += ms;
      for (;;) {
        const d = due.filter((x) => x.at <= now).sort((a, b) => a.at - b.at)[0];
        if (!d) break;
        due.splice(due.indexOf(d), 1);
        d.fn();
      }
    },
  };
}
const flushObservers = () => new Promise<void>((r) => setTimeout(r, 0));

let undoSheets: () => void;
beforeEach(() => {
  resetDiag();
  undoSheets = installSheets();
  document.body.replaceChildren();
});
afterEach(() => {
  undoSheets();
  document.querySelectorAll("[data-skinly-ui]").forEach((n) => n.remove());
  document.querySelectorAll("[data-test]").forEach((n) => n.remove());
  vi.restoreAllMocks();
});

const newHost = (name = "scene") => {
  const h = document.createElement("div");
  h.setAttribute("data-skinly-ui", name);
  styleHost(h, FIXED_HOST);
  return h;
};

describe("art host: stacking (stage 1c)", () => {
  it("is fixed, covers the window, never takes the pointer, sits at 2147483646 and contains itself, all !important", () => {
    const h = newHost();
    const s = h.style;
    expect(HOST_Z).toBe("2147483646");
    for (const [k, v] of [["position", "fixed"], ["top", "0px"], ["right", "0px"], ["bottom", "0px"], ["left", "0px"], ["pointer-events", "none"], ["z-index", "2147483646"], ["contain", "strict"]] as const) {
      expect(s.getPropertyValue(k), k).toBe(v);
      expect(s.getPropertyPriority(k), k).toBe("important");
    }
  });

  it("is mounted as the last child of the html element", () => {
    const h = newHost();
    const stop = attachHost(document, window, h, "scene-reattach", clock().timers);
    expect(h.parentElement).toBe(document.documentElement);
    expect(document.documentElement.lastElementChild).toBe(h);
    expect(diagFlags().mount).toBe("html");
    stop();
  });

  it("the scene engine's host is styled the same way", () => {
    const engine = createSceneEngine({ doc: document, win: window });
    expect(engine.show({ scene: getScene("ocean")!, density: "normal", lane: "both", gutters: { state: "ok", left: { x: 0, w: 200 } }, accent: "#0a7ea4" })).toBe("shown");
    const h = engine.host()!;
    expect(h.style.getPropertyValue("position")).toBe("fixed");
    expect(h.style.getPropertyValue("z-index")).toBe(HOST_Z);
    expect(h.style.getPropertyValue("contain")).toBe("strict");
    expect(document.documentElement.lastElementChild).toBe(h);
    engine.destroy();
  });
});

describe("art host: survival (stage 1c)", () => {
  it("is put back when the page removes it, at most once per second", async () => {
    const c = clock();
    const h = newHost();
    const stop = attachHost(document, window, h, "scene-reattach", c.timers);
    h.remove();
    await flushObservers();
    c.advance(0);
    expect(h.isConnected).toBe(true);
    expect(diagFlags().reattached).toBe(1);
    // removed again right away: not before a second has passed
    h.remove();
    await flushObservers();
    c.advance(REATTACH_GAP_MS - 10);
    expect(h.isConnected).toBe(false);
    c.advance(10);
    expect(h.isConnected).toBe(true);
    expect(diagFlags().reattached).toBe(2);
    stop();
  });

  it("moves back to the end when the page appends after it, and gives up after REATTACH_MAX", async () => {
    const c = clock();
    const h = newHost();
    const stop = attachHost(document, window, h, "scene-reattach", c.timers);
    for (let i = 0; i < REATTACH_MAX + 5; i++) {
      const junk = document.createElement("div");
      junk.setAttribute("data-test", "");
      document.documentElement.append(junk);
      await flushObservers();
      c.advance(REATTACH_GAP_MS);
    }
    const tail = document.documentElement.lastElementChild!;
    expect(tail.hasAttribute("data-test")).toBe(true);
    stop();
  });

  it("two of our own hosts never trade places (no re-append ping-pong)", async () => {
    const c = clock();
    const scene = newHost("scene");
    const pet = newHost("pet");
    const stopA = attachHost(document, window, scene, "scene-reattach", c.timers);
    const stopB = attachHost(document, window, pet, "pet-reattach", c.timers);
    const appends = vi.spyOn(Element.prototype, "append");
    for (let i = 0; i < 5; i++) {
      await flushObservers();
      c.advance(REATTACH_GAP_MS);
    }
    expect(appends).not.toHaveBeenCalled();
    expect(scene.isConnected && pet.isConnected).toBe(true);
    stopA();
    stopB();
  });

  it("stop() ends the watching: a removed host stays removed", async () => {
    const c = clock();
    const h = newHost();
    attachHost(document, window, h, "scene-reattach", c.timers)();
    h.remove();
    await flushObservers();
    c.advance(REATTACH_GAP_MS * 2);
    expect(h.isConnected).toBe(false);
  });
});

describe("html effects that break position fixed (stage 1c)", () => {
  it("htmlEffect names the first of transform, filter, perspective, contain", () => {
    const none = { transform: "none", filter: "none", perspective: "none", contain: "none" };
    expect(htmlEffect(none)).toBeUndefined();
    expect(htmlEffect({ ...none, contain: "" })).toBeUndefined();
    expect(htmlEffect({ ...none, transform: "matrix(1, 0, 0, 1, 0, 0)" })).toBe("transform");
    expect(htmlEffect({ ...none, filter: "grayscale(1)" })).toBe("filter");
    expect(htmlEffect({ ...none, perspective: "500px" })).toBe("perspective");
    expect(htmlEffect({ ...none, contain: "paint" })).toBe("contain");
  });

  it("with a transform on html the host goes on the body, and the diagnostics say why", () => {
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
      const cs = real(el);
      if (el !== document.documentElement) return cs;
      return { transform: "matrix(1, 0, 0, 1, 0, 0)", filter: "none", perspective: "none", contain: "none" } as CSSStyleDeclaration;
    });
    expect(mountParent(document, window)).toBe(document.body);
    const h = newHost();
    const stop = attachHost(document, window, h, "scene-reattach", clock().timers);
    expect(h.parentElement).toBe(document.body);
    expect(diagFlags()).toMatchObject({ mount: "body", htmlEffect: "transform" });
    stop();
  });
});

describe("every mount step is caught (stage 1f)", () => {
  it("guarded records the kind and returns the fallback instead of throwing", () => {
    expect(
      guarded(
        "scene-mount",
        () => {
          throw new Error("boom");
        },
        "fallback",
      ),
    ).toBe("fallback");
    expect(diagErrors()).toEqual(["scene-mount"]);
  });

  it("a scene whose actor throws is recorded and the rest still draws; a broken mount leaves no host", () => {
    const engine = createSceneEngine({ doc: document, win: window });
    const def = getScene("ocean")!;
    const bad = { ...def, actors: [{ ...def.actors[0]!, build: () => { throw new Error("art"); } }, ...def.actors.slice(1)] };
    expect(() => engine.show({ scene: bad, density: "high", lane: "both", gutters: { state: "ok", left: { x: 0, w: 220 } }, accent: "#0a7ea4" })).not.toThrow();
    expect(diagErrors()).toContain("scene-render");
    engine.destroy();
    resetDiag();
    vi.spyOn(Element.prototype, "attachShadow").mockImplementation(() => {
      throw new Error("no shadow");
    });
    expect(engine.show({ scene: def, density: "high", lane: "both", gutters: { state: "ok", left: { x: 0, w: 220 } }, accent: "#0a7ea4" })).toBe("no-gutter");
    expect(diagErrors()).toContain("scene-mount");
    expect(document.querySelector("[data-skinly-scene]")).toBeNull();
  });
});
