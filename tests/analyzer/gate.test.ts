import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyzer/analyze.ts";
import { decideGate, layoutsAllowed } from "../../src/analyzer/gate.ts";
import { dom, fakeDeps, items } from "./helpers.ts";

const OK = "https://example.org/page";
const gateFor = (body: string, url = OK, blocklist: string[] = []) => {
  const a = analyze(dom(body), fakeDeps());
  return decideGate({ url, blocklist, risk: a.risk, tooLarge: a.status === "too-large" });
};

describe("decideGate", () => {
  it("is ok for a plain page", () => {
    expect(gateFor("<main>x</main>")).toEqual({ kind: "ok" });
  });
  it("is no-ai for password, payment and file inputs", () => {
    expect(gateFor("<input type='password'>")).toEqual({ kind: "no-ai", reasons: ["password"] });
    expect(gateFor("<input autocomplete='cc-number'>")).toEqual({ kind: "no-ai", reasons: ["payment"] });
    expect(gateFor("<input type='file'>")).toEqual({ kind: "no-ai", reasons: ["file"] });
  });
  it("is blocked for restricted urls, stores and blocklisted origins", () => {
    expect(gateFor("<main>x</main>", "chrome://settings")).toMatchObject({ kind: "blocked", reason: "internal" });
    expect(gateFor("<main>x</main>", "https://chromewebstore.google.com/x")).toMatchObject({ kind: "blocked", reason: "store" });
    expect(gateFor("<main>x</main>", "https://erp.iitkgp.ac.in/")).toMatchObject({ kind: "blocked", reason: "blocklist" });
    expect(gateFor("<main>x</main>", OK, ["example.org"])).toMatchObject({ kind: "blocked", reason: "blocklist" });
  });
  it("blocked wins over no-ai", () => {
    expect(gateFor("<input type='password'>", "chrome://settings").kind).toBe("blocked");
  });
  it("is no-ai (too-large) for a page over the cap", () => {
    const a = analyze(dom(items(20000, () => "<i></i>")), fakeDeps());
    expect(a.status).toBe("too-large");
    expect(decideGate({ url: OK, blocklist: [], risk: a.risk, tooLarge: true })).toEqual({ kind: "no-ai", reasons: ["too-large"] });
  });
  it("disables layouts on any risk marker", () => {
    expect(layoutsAllowed([])).toBe(true);
    expect(layoutsAllowed(["editable"])).toBe(false);
  });
});
