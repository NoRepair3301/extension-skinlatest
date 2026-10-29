import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BLUR_CSS, createBlurController } from "../../src/features/blur/apply.ts";
import { startPick } from "../../src/features/blur/pick.ts";
import { MAX_SELECTORS, addSelector, buildSelector, resolveSelectors, summary } from "../../src/features/blur/selector.ts";
import { dataUrlToBlob, fileNameFor, safeScreenshot, type ScreenshotDeps } from "../../src/features/blur/screenshot.ts";

const styleHost = () => {
  const added: string[] = [];
  const removed: string[] = [];
  return { added, removed, host: { add: (css: string) => (added.push(css), { remove: () => void removed.push(css) }) } };
};

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute("data-skinly-share");
  document.documentElement.querySelectorAll("[data-skinly-ui]").forEach((n) => n.remove());
  vi.restoreAllMocks();
});

describe("selectors", () => {
  const load = (name: string) => {
    document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/i.exec(readFileSync(`fixtures/web/${name}.html`, "utf8"))?.[1] ?? "";
  };
  it("builds and resolves a selector on fixtures", () => {
    for (const name of ["article-news", "service-cards", "link-portal", "table-heavy"]) {
      load(name);
      const els = Array.from(document.body.querySelectorAll("p, li, a, td, h2")).slice(0, 15);
      expect(els.length).toBeGreaterThan(0);
      for (const el of els) {
        const sel = buildSelector(el);
        const hit = document.querySelector(sel);
        expect(hit, sel).not.toBeNull();
        expect(hit!.localName).toBe(el.localName);
      }
    }
  });
  it("resolves to the same element for a unique path", () => {
    document.body.innerHTML = `<div><p>a</p><p>b</p><section><p id="x" class="note">c</p></section></div>`;
    const target = document.getElementById("x")!;
    expect(document.querySelector(buildSelector(target))).toBe(target);
  });
  it("never contains ids, text or more than 2 classes, and is at most 6 levels deep", () => {
    document.body.innerHTML = `<div id="secret"><div><div><div><div><div><div><p id="pw" class="aa bb cc 123 Bad skinly-x" title="hunter2">hunter2</p></div></div></div></div></div></div></div>`;
    const sel = buildSelector(document.getElementById("pw")!);
    expect(sel).not.toMatch(/secret|pw|hunter2|cc|Bad|123|skinly/);
    expect(sel.split(" > ")).toHaveLength(6);
    expect(sel).toContain(".aa.bb");
  });
  it("counts unresolvable and invalid selectors as not found", () => {
    document.body.innerHTML = `<p>a</p>`;
    const r = resolveSelectors(document, ["body > p:nth-of-type(1)", "body > h9:nth-of-type(1)", "((("]);
    expect(r.found).toHaveLength(1);
    expect(r.missing).toBe(2);
    expect(summary(1, 2)).toBe("1 blurred, 2 not found");
  });
  it("holds the 50 cap", () => {
    const list: string[] = [];
    for (let i = 0; i < 60; i++) addSelector(list, `p:nth-of-type(${i + 1})`);
    expect(list).toHaveLength(MAX_SELECTORS);
    expect(addSelector(list, "x")).toBe(false);
    expect(resolveSelectors(document, Array.from({ length: 80 }, () => "body")).found).toHaveLength(1);
  });
});

describe("pick mode", () => {
  it("blocks clicks from the page, toggles marks and leaves no listeners after Escape", () => {
    document.body.innerHTML = `<a href="/x" id="l">link</a><p id="p">text</p>`;
    const pageClick = vi.fn((e: Event) => e.preventDefault());
    document.body.addEventListener("click", pageClick);
    const { host } = styleHost();
    const blur = createBlurController(document, host);
    const selectors: string[] = [];
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const session = startPick({ doc: document, blur, selectors });
    const link = document.getElementById("l")!;
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(ev);
    expect(pageClick).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(true);
    expect(link.getAttribute("data-skinly-blur")).toBe("1");
    expect(selectors).toHaveLength(1);
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(link.hasAttribute("data-skinly-blur")).toBe(false);
    expect(selectors).toHaveLength(0);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(session.active()).toBe(false);
    const added = add.mock.calls.map((c) => `${c[0]}|${String(c[2])}`).sort();
    const removed = remove.mock.calls.map((c) => `${c[0]}|${String(c[2])}`).sort();
    expect(removed).toEqual(added);
    expect(document.querySelector('[data-skinly-ui="pick"]')).toBeNull();
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(pageClick).toHaveBeenCalledTimes(1);
  });
  it("Done button ends pick mode", () => {
    const blur = createBlurController(document, styleHost().host);
    const s = startPick({ doc: document, blur, selectors: [] });
    document.querySelector('[data-skinly-ui="pick"]')!.shadowRoot!.querySelector<HTMLButtonElement>("button")!.dispatchEvent(new MouseEvent("click"));
    expect(s.active()).toBe(false);
  });
});

describe("blur apply", () => {
  it("uses only the one template", () => {
    expect(BLUR_CSS).toBe('html[data-skinly-share="on"] [data-skinly-blur="1"]{filter:blur(6px)}');
    expect(BLUR_CSS.match(/filter/g)).toHaveLength(1);
    expect(BLUR_CSS).not.toMatch(/url\(|@import|position|z-index/);
  });
  it("Share mode on adds the sheet and attribute, off removes them", () => {
    document.body.innerHTML = `<p>a</p><p>b</p>`;
    const s = styleHost();
    const blur = createBlurController(document, s.host);
    blur.setTargets(["body > p:nth-of-type(2)"], false);
    expect(document.querySelectorAll("[data-skinly-blur]")).toHaveLength(1);
    blur.setShare(true);
    expect(s.added).toEqual([BLUR_CSS]);
    expect(document.documentElement.getAttribute("data-skinly-share")).toBe("on");
    blur.setShare(false);
    expect(s.removed).toEqual([BLUR_CSS]);
    expect(document.documentElement.hasAttribute("data-skinly-share")).toBe(false);
    blur.restore();
    expect(document.querySelectorAll("[data-skinly-blur]")).toHaveLength(0);
  });
  it("blurs all images, video and canvas and reports missing selectors", () => {
    document.body.innerHTML = `<img><video></video><canvas></canvas><svg></svg><p>t</p>`;
    const blur = createBlurController(document, styleHost().host);
    const st = blur.setTargets(["nope > x"], true);
    expect(st).toMatchObject({ count: 3, missing: 1, images: true });
    expect(document.querySelector("p")!.hasAttribute("data-skinly-blur")).toBe(false);
  });
  it("re-applies after DOM changes", async () => {
    document.body.innerHTML = `<img>`;
    const blur = createBlurController(document, styleHost().host);
    blur.setTargets([], true);
    document.body.append(document.createElement("img"));
    await new Promise((r) => setTimeout(r, 450));
    expect(document.querySelectorAll('img[data-skinly-blur="1"]')).toHaveLength(2);
    blur.restore();
  });
});

describe("safe screenshot", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgo=";
  const make = (initial: boolean, over: Partial<ScreenshotDeps> = {}) => {
    let share = initial;
    const log: string[] = [];
    const deps: ScreenshotDeps = {
      getShare: async () => share,
      setShare: async (on) => {
        share = on;
        log.push(`share:${on}`);
        return true;
      },
      capture: async () => (log.push("capture"), PNG),
      now: () => new Date(2026, 9, 30, 7, 5, 9),
      ...over,
    };
    return { deps, log, share: () => share };
  };
  it("forces Share mode on and then restores the previous mode", async () => {
    const t = make(false);
    const r = await safeScreenshot(t.deps);
    expect(r.ok).toBe(true);
    expect(t.log).toEqual(["share:true", "capture", "share:false"]);
    expect(t.share()).toBe(false);
  });
  it("leaves Share mode alone when it was already on", async () => {
    const t = make(true);
    await safeScreenshot(t.deps);
    expect(t.log).toEqual(["capture"]);
  });
  it("names the file and makes a PNG blob", async () => {
    const r = await safeScreenshot(make(true).deps);
    if (!r.ok) throw new Error("fail");
    expect(r.fileName).toBe("skinly-20261030-070509.png");
    expect(r.fileName).toMatch(/^skinly-\d{8}-\d{6}\.png$/);
    expect(r.blob.type).toBe("image/png");
    expect(r.blob.size).toBeGreaterThan(0);
    expect(fileNameFor(new Date(2026, 0, 2, 3, 4, 5))).toBe("skinly-20260102-030405.png");
  });
  it("restores the mode and reports failure when capture throws", async () => {
    const t = make(false, {
      capture: async () => {
        throw new Error("x");
      },
    });
    const r = await safeScreenshot(t.deps);
    expect(r).toEqual({ ok: false, reason: "capture-failed" });
    expect(t.share()).toBe(false);
  });
  it("does not capture when Share mode is not confirmed", async () => {
    const capture = vi.fn();
    const t = make(false, { setShare: async () => false, capture });
    expect(await safeScreenshot(t.deps)).toEqual({ ok: false, reason: "not-confirmed" });
    expect(capture).not.toHaveBeenCalled();
  });
  it("rejects data that is not a PNG data URL and uses no network", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(() => dataUrlToBlob("https://x.test/a.png")).toThrow();
    await safeScreenshot(make(true).deps);
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
