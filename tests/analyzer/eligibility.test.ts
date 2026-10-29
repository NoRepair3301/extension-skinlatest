import { describe, expect, it } from "vitest";
import { checkUrl } from "../../src/analyzer/eligibility.ts";

const reason = (url: string, list: string[] = []) => {
  const r = checkUrl(url, list);
  return r.allowed ? "allowed" : r.reason;
};

describe("checkUrl", () => {
  it("allows normal http and https pages", () => {
    expect(reason("https://example.org/a?b=1")).toBe("allowed");
    expect(reason("http://example.org:8080/")).toBe("allowed");
  });
  it("blocks browser-internal and extension pages", () => {
    for (const u of ["chrome://settings", "edge://extensions", "about:blank", "chrome-extension://abc/popup.html", "view-source:https://example.org"]) {
      expect(reason(u)).toBe("internal");
    }
  });
  it("blocks other schemes and bad input", () => {
    for (const u of ["file:///c:/a.html", "ftp://example.org/", "data:text/html,hi"]) expect(reason(u)).toBe("scheme");
    expect(reason("not a url")).toBe("invalid");
  });
  it("blocks web stores", () => {
    expect(reason("https://chromewebstore.google.com/detail/x")).toBe("store");
    expect(reason("https://chrome.google.com/webstore/detail/x")).toBe("store");
    expect(reason("https://microsoftedge.microsoft.com/addons/detail/x")).toBe("store");
    expect(reason("https://addons.mozilla.org/en-US/firefox/")).toBe("store");
    expect(reason("https://chrome.google.com/other")).toBe("allowed");
  });
  it("blocks PDFs", () => {
    expect(reason("https://example.org/files/a.PDF")).toBe("pdf");
  });
  it("honours the built-in and user blocklists, including subdomains", () => {
    expect(reason("https://erp.iitkgp.ac.in/Acad/")).toBe("blocklist");
    expect(reason("https://a.erp.iitkgp.ac.in/")).toBe("blocklist");
    expect(reason("https://example.org/", ["example.org"])).toBe("blocklist");
    expect(reason("https://www.example.org/", ["https://example.org"])).toBe("blocklist");
    expect(reason("https://notexample.org/", ["example.org"])).toBe("allowed");
  });
});
