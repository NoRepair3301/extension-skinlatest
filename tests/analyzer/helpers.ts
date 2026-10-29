import { JSDOM } from "jsdom";

export const dom = (body: string, head = ""): Document => new JSDOM(`<!doctype html><html><head>${head}</head><body>${body}</body></html>`).window.document;

export const items = (n: number, make: (i: number) => string): string => Array.from({ length: n }, (_, i) => make(i)).join("");
