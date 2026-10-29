import { JSDOM } from "jsdom";
import type { SummaryDeps } from "../../src/analyzer/summary.ts";

export const dom = (body: string, head = ""): Document => new JSDOM(`<!doctype html><html><head>${head}</head><body>${body}</body></html>`).window.document;

export const items = (n: number, make: (i: number) => string): string => Array.from({ length: n }, (_, i) => make(i)).join("");

/** Deterministic stand-in for getComputedStyle / getBoundingClientRect (jsdom has no layout). */
export const fakeDeps = (): SummaryDeps => {
  let n = 0;
  const seen = new Map<Element, number>();
  const order = (el: Element) => {
    if (!seen.has(el)) seen.set(el, n++);
    return seen.get(el)!;
  };
  return {
    getStyle: (el) => ({
      color: "rgb(17, 34, 51)",
      backgroundColor: el.localName === "body" ? "rgb(255, 255, 255)" : el.localName === "nav" ? "rgb(10, 20, 30)" : "rgba(0, 0, 0, 0)",
      fontSize: "16px",
      fontWeight: "400",
      borderRadius: "4px",
      fontFamily: '"Fake Sans", Arial, sans-serif',
    }),
    getRect: (el) => ({ x: 3 + order(el), y: 14, w: 123.4, h: 47 }),
    viewport: { w: 1024, h: 768 },
  };
};
