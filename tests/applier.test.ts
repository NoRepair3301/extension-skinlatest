import { readdirSync, readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApplier, type StyleHandle, type StyleHost } from "../src/extension/applier-core.ts";
import { createBoundedObserver } from "../src/extension/observer.ts";
import { themeToPlan } from "../src/plan/themeToPlan.ts";
import { BUILTIN_THEME_IDS } from "../src/themes/index.ts";
import { dom, fakeDeps, items } from "./analyzer/helpers.ts";

/** Records stylesheets instead of adopting them, because jsdom has no constructable stylesheets. */
const fakeStyle = () => {
  const sheets: string[] = [];
  const host: StyleHost = {
    add(css) {
      sheets.push(css);
      let attached = true;
      const h: StyleHandle = {
        remove: () => {
          attached = false;
          const i = sheets.indexOf(css);
          if (i >= 0) sheets.splice(i, 1);
        },
        isAttached: () => attached,
      };
      return h;
    },
  };
  return { host, sheets };
};

const names = readdirSync("fixtures/web")
  .filter((f) => f.endsWith(".html"))
  .map((f) => f.replace(/\.html$/, ""));
const load = (n: string) => new JSDOM(readFileSync(`fixtures/web/${n}.html`, "utf8")).window.document;

describe("applier on every fixture", () => {
  describe.each(names)("%s", (name) => {
    it("apply then restore leaves outerHTML identical", () => {
      const doc = load(name);
      const before = doc.documentElement.outerHTML;
      const { host, sheets } = fakeStyle();
      const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
      for (const id of BUILTIN_THEME_IDS) {
        expect(a.applyTheme(id).ok).toBe(true);
        expect(doc.documentElement.getAttribute("data-skinly")).toBe("on");
        expect(sheets).toHaveLength(1);
      }
      a.restore();
      expect(doc.documentElement.outerHTML).toBe(before);
      expect(sheets).toHaveLength(0);
      expect(a.isActive()).toBe(false);
    });

    it("applying twice is idempotent and restoring twice is harmless", () => {
      const doc = load(name);
      const before = doc.documentElement.outerHTML;
      const { host, sheets } = fakeStyle();
      const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
      a.applyTheme("ocean");
      const once = doc.documentElement.outerHTML;
      const css = sheets[0];
      a.applyTheme("ocean");
      expect(doc.documentElement.outerHTML).toBe(once);
      expect(sheets).toEqual([css]);
      a.restore();
      a.restore();
      expect(doc.documentElement.outerHTML).toBe(before);
    });
  });
});

describe("applier safety", () => {
  it("rolls back when an invariant is violated (a link removed by a test hook)", () => {
    const doc = load("article-news");
    const { host, sheets } = fakeStyle();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps(), beforeInvariants: () => doc.querySelector("a[href]")!.remove() });
    expect(a.applyTheme("midnight")).toMatchObject({ ok: false, reason: "invariants" });
    expect(sheets).toHaveLength(0);
    expect(doc.documentElement.hasAttribute("data-skinly")).toBe(false);
    expect(doc.querySelector("[data-skinly-r]")).toBeNull();
    expect(a.isActive()).toBe(false);
  });

  it("rejects an invalid plan without touching the page", () => {
    const doc = load("article-news");
    const before = doc.documentElement.outerHTML;
    const { host } = fakeStyle();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    const plan = themeToPlan("ocean");
    plan.regionRules.push({ region: "r999", layout: "none", surface: "card", spacing: 0 });
    expect(a.apply(plan)).toMatchObject({ ok: false, reason: "invalid-plan" });
    expect(a.applyTheme("neon")).toMatchObject({ ok: false, reason: "bad-theme" });
    expect(doc.documentElement.outerHTML).toBe(before);
  });

  it("applies a colours-only theme to a page over the node cap", () => {
    const doc = dom(items(16000, () => "<i></i>"));
    const before = doc.documentElement.outerHTML;
    const { host, sheets } = fakeStyle();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    expect(a.applyTheme("calm-light")).toMatchObject({ ok: true, regions: 0 });
    expect(sheets).toHaveLength(1);
    a.restore();
    expect(doc.documentElement.outerHTML).toBe(before);
  });

  it("restores a pre-existing data-skinly-r value", () => {
    const doc = dom('<nav data-skinly-r="old">n</nav><main>m</main>');
    const { host } = fakeStyle();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    expect(a.applyTheme("ocean").ok).toBe(true);
    a.restore();
    expect(doc.querySelector("nav")!.getAttribute("data-skinly-r")).toBe("old");
  });

  it("fails safe when the style host throws", () => {
    const doc = load("article-news");
    const before = doc.documentElement.outerHTML;
    const style: StyleHost = {
      add: () => {
        throw new Error("boom");
      },
    };
    const a = createApplier(doc, { style, summaryDeps: fakeDeps() });
    expect(a.applyTheme("ocean")).toEqual({ ok: false, reason: "error" });
    expect(doc.documentElement.outerHTML).toBe(before);
  });

  it("tags regions with data-skinly-r only", () => {
    const doc = load("service-cards");
    const { host } = fakeStyle();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    a.applyTheme("ocean");
    const tagged = Array.from(doc.querySelectorAll("[data-skinly-r]"));
    expect(tagged.length).toBeGreaterThan(0);
    for (const el of tagged) expect(el.getAttribute("data-skinly-r")).toMatch(/^r\d+$/);
    a.restore();
  });
});

describe("bounded observer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const doc = dom("<main></main>");
    const onCheck = vi.fn();
    const obs = createBoundedObserver(doc, doc.body, onCheck);
    const poke = async () => {
      doc.body.appendChild(doc.createElement("p"));
      await Promise.resolve();
    };
    return { doc, onCheck, obs, poke };
  };

  it("gives one re-check after 300 ms for a burst of mutations", async () => {
    const { onCheck, poke } = setup();
    for (let i = 0; i < 20; i++) await poke();
    vi.advanceTimersByTime(299);
    expect(onCheck).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it("allows at most 5 re-checks per minute", async () => {
    const { onCheck, poke } = setup();
    for (let i = 0; i < 8; i++) {
      await poke();
      vi.advanceTimersByTime(400);
    }
    expect(onCheck).toHaveBeenCalledTimes(5);
    vi.advanceTimersByTime(60_000);
    await poke();
    vi.advanceTimersByTime(400);
    expect(onCheck).toHaveBeenCalledTimes(6);
  });

  it("ignores attribute and text changes", async () => {
    const { doc, onCheck } = setup();
    doc.body.setAttribute("class", "x");
    doc.querySelector("main")!.textContent = "";
    await Promise.resolve();
    vi.advanceTimersByTime(1000);
    expect(onCheck).not.toHaveBeenCalled();
  });

  it("disconnects, cancelling a pending check", async () => {
    const { onCheck, obs, poke } = setup();
    await poke();
    obs.disconnect();
    vi.advanceTimersByTime(1000);
    await poke();
    vi.advanceTimersByTime(1000);
    expect(onCheck).not.toHaveBeenCalled();
  });

  it("the applier's observer repairs the page and stops after restore", async () => {
    const doc = dom("<nav>n</nav><main>m</main>");
    const { host, sheets } = fakeStyle();
    const a = createApplier(doc, { style: host, summaryDeps: fakeDeps() });
    a.applyTheme("ocean");
    doc.documentElement.removeAttribute("data-skinly");
    doc.body.appendChild(doc.createElement("p"));
    await Promise.resolve();
    vi.advanceTimersByTime(400);
    expect(doc.documentElement.getAttribute("data-skinly")).toBe("on");
    a.restore();
    doc.body.appendChild(doc.createElement("p"));
    await Promise.resolve();
    vi.advanceTimersByTime(400);
    expect(doc.documentElement.hasAttribute("data-skinly")).toBe(false);
    expect(sheets).toHaveLength(0);
  });
});
