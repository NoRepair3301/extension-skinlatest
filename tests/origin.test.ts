import { describe, expect, it } from "vitest";
import { originOf, siteKey, toOrigin } from "../src/extension/origin.ts";
import { matchFor, scriptId } from "../src/extension/siteActions.ts";

/** A1c: one function for the record key and the match pattern, used for saving, reading and registering. */
describe("siteKey", () => {
  it.each([
    ["https://en.wikipedia.org/wiki/Solar_System", "https://en.wikipedia.org"],
    ["https://EN.Wikipedia.ORG/wiki/Sun?x=1#y", "https://en.wikipedia.org"],
    ["https://en.m.wikipedia.org/wiki/Sun", "https://en.m.wikipedia.org"],
    ["https://example.com:443/x", "https://example.com"],
    ["http://example.com:80/x", "http://example.com"],
    ["http://localhost:3000/app", "http://localhost:3000"],
    ["https://example.com:8443/", "https://example.com:8443"],
    ["http://127.0.0.1:8080/", "http://127.0.0.1:8080"],
    ["http://[::1]:8080/path", "http://[::1]:8080"],
    ["https://[2001:db8::1]/", "https://[2001:db8::1]"],
    ["https://bücher.example/katalog", "https://xn--bcher-kva.example"],
    ["https://xn--bcher-kva.example/", "https://xn--bcher-kva.example"],
    ["https://a.b.c.example.co.uk/deep/path", "https://a.b.c.example.co.uk"],
  ])("%s -> %s", (input, key) => {
    const k = siteKey(input);
    expect(k).toEqual({ key, pattern: `${key}/*` });
    // the three uses agree
    expect(originOf(input)).toBe(key);
    expect(toOrigin(key)).toBe(key);
    expect(matchFor(key)).toEqual([`${key}/*`]);
    expect(scriptId(key)).toMatch(/^skinly-[0-9a-f]{8}$/);
  });

  it.each(["file:///C:/x.html", "chrome://extensions", "edge://settings", "about:blank", "data:text/html,x", "javascript:alert(1)", "ftp://example.com/", "https://user:pw@example.com/", "", "not a url", "https://*", "<all_urls>"])("rejects %s", (input) => {
    expect(siteKey(input)).toBeUndefined();
    expect(originOf(input)).toBeUndefined();
    expect(matchFor(input)).toEqual([]);
  });

  it("toOrigin accepts only an exact origin: no path, no trailing slash, no upper case, no default port", () => {
    for (const bad of ["https://a.example/", "https://a.example/x", "https://A.example", "https://a.example:443", "https://a.example?q", "https://a.example#f"]) expect(toOrigin(bad), bad).toBeUndefined();
    expect(toOrigin("http://[::1]:8080")).toBe("http://[::1]:8080");
  });

  it("different ports, schemes and subdomains are different sites", () => {
    const keys = ["https://a.example", "http://a.example", "https://a.example:8443", "https://www.a.example"].map((u) => siteKey(u)!.key);
    expect(new Set(keys).size).toBe(4);
    expect(new Set(keys.map(scriptId)).size).toBe(4);
  });
});
