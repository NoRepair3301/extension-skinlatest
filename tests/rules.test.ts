import { describe, expect, it } from "vitest";
import { scanSource, scanTree } from "../scripts/rules.ts";

const hits = (path: string, text: string, hosts: string[] = []) => scanSource(path, text, hosts).map((v) => v.rule);
const SRC = "src/features/x.ts";
const COOKIE_RULE = "chrome.cookies/history/webRequest/downloads";

describe("forbidden patterns in src/", () => {
  const planted: Array<[string, string]> = [
    ["eval(", "eval('1')"],
    ["new Function", "new Function('return 1')"],
    ["string setTimeout/setInterval", "setTimeout('go()', 5)"],
    ["string setTimeout/setInterval", "setInterval(`go()`, 5)"],
    ["innerHTML", "el.innerHTML = x"],
    ["outerHTML assignment", "el.outerHTML = x"],
    ["insertAdjacentHTML", "el.insertAdjacentHTML('beforeend', x)"],
    ["document.write", "document.write(x)"],
    ["localStorage", "localStorage.getItem('a')"],
    ["sessionStorage", "sessionStorage.setItem('a','b')"],
    ["XMLHttpRequest", "new XMLHttpRequest()"],
    ["sendBeacon", "navigator.sendBeacon(u)"],
    ["WebSocket", "new WebSocket(u)"],
    ["EventSource", "new EventSource(u)"],
    [".click(", "btn.click()"],
    [".submit(", "form.submit()"],
    ["requestSubmit", "form.requestSubmit()"],
    ["navigator.credentials", "navigator.credentials.get()"],
    ["<all_urls>", "const m = '<all_urls>'"],
    ["javascript:", "const h = 'javascript:void(0)'"],
    [COOKIE_RULE, "chrome.cookies.getAll()"],
    [COOKIE_RULE, "chrome.history.search()"],
    [COOKIE_RULE, "chrome.webRequest.x"],
    [COOKIE_RULE, "chrome.downloads.download()"],
    ["tabs.executeScript", "chrome.tabs.executeScript(1, {})"],
  ];
  it.each(planted)("flags %s", (rule, code) => {
    expect(hits(SRC, code)).toContain(rule);
  });

  it.each([
    ["<style> element (CSP)", 'const s = doc.createElement("style");'],
    ["<style> element (CSP)", "const s = document.createElement('style')"],
    ["<style> element (CSP)", 'doc.createElementNS(ns, "style")'],
    ["style attribute (CSP)", 'host.setAttribute("style", "position:fixed")'],
    ["style attribute (CSP)", "el.setAttribute('style', css)"],
  ])("flags the CSP-unsafe styling %s: %s", (rule, code) => {
    expect(hits(SRC, code)).toContain(rule);
  });

  it("allows CSSOM and adopted stylesheets (what strict sites permit)", () => {
    expect(hits(SRC, 'el.style.setProperty("position", "fixed", "important"); el.style.cssText = ""; root.adoptedStyleSheets = [s]; el.setAttribute("data-style", "x");')).toEqual([]);
  });

  it("the page-side code in src/features and the auto script never use <style>, style attributes or innerHTML", () => {
    const csp = scanTree(".", ["src/features", "src/extension"]).filter((v) => /CSP|innerHTML/.test(v.rule));
    expect(csp).toEqual([]);
  });

  it("does not flag reading outerHTML or comparing it", () => {
    expect(hits(SRC, "const s = el.outerHTML; if (a.outerHTML == b) {}")).toEqual([]);
  });

  it("only applies the API rules to src/", () => {
    expect(hits("scripts/x.ts", "eval('1'); el.innerHTML = x; chrome.cookies")).toEqual([]);
  });

  it("reports path and line", () => {
    expect(scanSource("src/a.ts", "ok\neval(1)", [])).toEqual([{ path: "src/a.ts", line: 2, rule: "eval(" }]);
  });
});

describe("allowlists", () => {
  it("chrome. and browser. are allowed only in src/extension/api.ts", () => {
    expect(hits("src/extension/api.ts", "chrome.storage.local.get('a')")).toEqual([]);
    expect(hits("src/extension/background.ts", "chrome.storage.local.get('a')")).toHaveLength(1);
    expect(hits(SRC, "browser.storage.local.get('a')")).toHaveLength(1);
  });

  it("api.ts may not use the always-forbidden chrome APIs", () => {
    expect(hits("src/extension/api.ts", "chrome.cookies.getAll()")).toContain(COOKIE_RULE);
  });

  it("fetch( is allowed only in src/providers/", () => {
    expect(hits("src/providers/gemini.ts", "await fetch(u)")).toEqual([]);
    expect(hits("src/ai/pipeline.ts", "await fetch(u)")).toEqual(["fetch( outside src/providers/"]);
  });

  it("CSS blur (backdrop-filter or blur(<n>)) is allowed only under src/features/blur/", () => {
    expect(hits("src/features/blur/page.ts", ".veil{backdrop-filter:blur(12px)}")).toEqual([]);
    expect(hits("src/features/blur/apply.ts", "filter:blur(6px)")).toEqual([]);
    expect(hits("src/features/pet/overlay.ts", ".x{backdrop-filter:blur(2px)}")).toEqual(["CSS blur outside src/features/blur/"]);
    expect(hits("src/plan/compile.ts", "decl('filter', 'blur(4px)')")).toEqual(["CSS blur outside src/features/blur/"]);
    expect(hits("src/extension/popup/Popup.tsx", "el.blur()")).toEqual([]);
  });

  it("URL literals must be on the allowlist, and may live in config.ts", () => {
    expect(hits(SRC, "const u = 'https://example.org/x'")).toEqual(["URL not on allowlist: example.org"]);
    expect(hits(SRC, "const u = 'https://api.example.test/x?a=1'", ["api.example.test"])).toEqual([]);
    expect(hits(SRC, "const u = 'http://evil.test'", ["api.example.test"])).toHaveLength(1);
    expect(hits("src/config.ts", "export const U = 'https://api.example.test/v1'")).toEqual([]);
  });
});

describe("key-like strings", () => {
  const keys: Array<[string, string]> = [
    ["AIza", "AIza" + "a".repeat(30)],
    ["gsk_", "gsk_" + "A".repeat(24)],
    ["xai-", "xai-" + "b".repeat(24)],
    ["sk-", "sk-" + "c".repeat(24)],
  ];
  it.each(keys)("flags %s in src, scripts, tests and docs", (_name, key) => {
    for (const path of ["src/a.ts", "scripts/a.ts", "tests/a.test.ts", "docs/a.md"]) {
      expect(hits(path, `const k = "${key}"`).some((r) => r.startsWith("key-like"))).toBe(true);
    }
  });
  it("ignores short look-alikes", () => {
    expect(hits("docs/a.md", "sk-short and AIza123")).toEqual([]);
  });
});

describe("real tree", () => {
  it("has no violations in src/ and no key-like strings in src, scripts, tests, docs", () => {
    expect(scanTree(".", ["src", "scripts", "tests", "docs"])).toEqual([]);
  });
});

describe("sentence-ending words", () => {
  it("does not flag the word browser. at the end of user-facing copy, but still flags API use", () => {
    expect(scanSource("src/ai/messages.ts", 'const t = "Nothing else leaves your browser.";', [])).toEqual([]);
    expect(scanSource("src/ai/messages.ts", "browser.storage.local.get()", [])).toHaveLength(1);
    expect(scanSource("src/ai/messages.ts", "chrome . tabs.query()", [])).toHaveLength(1);
  });
});
