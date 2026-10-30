import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyzer/analyze.ts";
import { parseColor, sanitizeClasses, SUMMARY_MAX_BYTES } from "../../src/analyzer/summary.ts";
import { dom, fakeDeps, items } from "./helpers.ts";

const summaryOf = (body: string) => {
  const a = analyze(dom(body), fakeDeps());
  if (a.status !== "ok") throw new Error("too large");
  return a.summary;
};

describe("parseColor", () => {
  it("parses rgb, rgba, hex and transparent", () => {
    expect(parseColor("rgb(255, 0, 16)")).toEqual({ hex: "#ff0010", alpha: 1 });
    expect(parseColor("rgba(0, 0, 0, 0)")).toEqual({ hex: "#000000", alpha: 0 });
    expect(parseColor("rgb(1 2 3 / 50%)")).toEqual({ hex: "#010203", alpha: 0.5 });
    expect(parseColor("#abc")).toEqual({ hex: "#aabbcc", alpha: 1 });
    expect(parseColor("transparent")?.alpha).toBe(0);
    expect(parseColor("hotpink")).toBeNull();
  });
});

describe("sanitizeClasses", () => {
  it("keeps at most 3 valid lowercase tokens", () => {
    const d = dom('<div id="x" class="Card a ok-one two_x 123 three four"></div>');
    expect(sanitizeClasses(d.getElementById("x")!)).toEqual(["ok-one", "two_x", "three"]);
  });
});

describe("buildSummary", () => {
  const s = summaryOf('<nav class="top-bar"><a href="/p">x</a></nav><main><h1 id="t">Title</h1></main>');

  it("has the SPEC 4.1 shape", () => {
    expect(Object.keys(s).sort()).toEqual(["counts", "fonts", "page", "palette", "regions", "risk", "v", "viewport"]);
    expect(s.v).toBe(1);
    expect(s.viewport).toEqual({ w: 1024, h: 768 });
    expect(Object.keys(s.regions[0]!).sort()).toEqual(["childCount", "classes", "depth", "id", "linkCount", "rect", "role", "style", "tag"]);
  });
  it("reports page facts as tone and counts only, never an image address", () => {
    const d = dom('<div id="hero"></div><img src="https://example.com/secret.png"><p>x</p>');
    const base = fakeDeps();
    const deps = {
      ...base,
      getStyle: (el: Element) => ({ ...base.getStyle(el), backgroundColor: el.localName === "body" ? "rgb(10, 10, 10)" : "rgba(0, 0, 0, 0)", backgroundImage: el.id === "hero" ? 'url("https://example.com/secret.png")' : "none" }),
      getRect: (el: Element) => (el.id === "hero" || el.localName === "img" ? { x: 0, y: 0, w: 1000, h: 500 } : { x: 0, y: 0, w: 50, h: 20 }),
    };
    const a = analyze(d, deps);
    if (a.status !== "ok") throw new Error("too large");
    expect(a.summary.page).toEqual({ tone: "dark", bgImages: 1, largeMedia: 1, hasHeroMedia: true });
    expect(JSON.stringify(a.summary)).not.toContain("secret");
  });
  it("rounds rects to multiples of 10", () => {
    for (const r of s.regions) for (const v of Object.values(r.rect)) expect(v % 10).toBe(0);
    expect(s.regions[0]!.rect).toEqual({ x: 0, y: 10, w: 120, h: 50 });
  });
  it("reads colours, font and background through ancestors", () => {
    const main = s.regions.find((r) => r.role === "main")!;
    expect(main.style).toEqual({ color: "#112233", bg: "#ffffff", fontSize: 16, fontWeight: 400, radius: 4 });
    expect(s.regions.find((r) => r.role === "nav")!.style.bg).toBe("#0a141e");
    expect(s.palette).toEqual(expect.arrayContaining(["#112233", "#ffffff", "#0a141e"]));
    expect(s.fonts).toEqual(["Fake Sans"]);
  });
  it("never includes ids, text or hrefs", () => {
    const json = JSON.stringify(s);
    for (const bad of ["Title", "/p", "href", '"t"']) expect(json).not.toContain(bad);
  });
  it("stays under 20 KB by dropping lowest-priority regions first", () => {
    const cls = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb ccccccccccccccccccccccccccccccc";
    const body = "<main>m</main>" + items(60, () => `<h3 class="${cls}">x</h3>`);
    const big = summaryOf(body);
    expect(JSON.stringify(big).length).toBeLessThanOrEqual(SUMMARY_MAX_BYTES);
    expect(big.regions.some((r) => r.role === "main")).toBe(true);
  });
});
