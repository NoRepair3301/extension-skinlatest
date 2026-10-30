import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { transform } from "../../src/ai/pipeline.ts";
import { analyze } from "../../src/analyzer/analyze.ts";
import { decideGate } from "../../src/analyzer/gate.ts";
import type { PageAnalysis } from "../../src/extension/applier-core.ts";
import { fakeDeps } from "../analyzer/helpers.ts";
import { harness } from "./harness.ts";

const ERP = "https://erp.iitkgp.ac.in/IIT_ERP3/welcome.jsp";
const real = (name: string): PageAnalysis => {
  const a = analyze(new JSDOM(readFileSync(`fixtures/web/${name}.html`, "utf8")).window.document, fakeDeps());
  if (a.status !== "ok") throw new Error("too large");
  return { status: "ok", risk: a.risk, summary: a.summary, fingerprint: a.fingerprint };
};
const calls = (h: ReturnType<typeof harness>) => h.mocks.gemini.calls.length + h.mocks.groq.calls.length;

describe("legacy portal on the formerly blocked ERP host", () => {
  it("the site is no longer blocked: the built-in theme is applied", async () => {
    const h = harness({ analysis: real("legacy-portal-tables"), keys: { gemini: false, groq: false } });
    const out = await transform(ERP, h.deps);
    expect(out).toMatchObject({ kind: "baseline", why: "no-key" });
    expect(h.page.calls[0]).toMatch(/^applyTheme:/);
  });

  it("the sign-in portal (password and one-time-code inputs) gets the built-in theme and never a provider call", async () => {
    const analysis = real("legacy-portal-frames");
    expect(analysis.status === "ok" && analysis.risk).toContain("password");
    const h = harness({ analysis });
    const out = await transform(ERP, h.deps);
    expect(out).toMatchObject({ kind: "baseline", why: "no-ai-page" });
    expect(calls(h)).toBe(0);
    expect(h.askConsent).not.toHaveBeenCalled();
    expect(h.page.calls.some((c) => c.startsWith("applyTheme:"))).toBe(true);
    expect(h.page.calls.some((c) => c.startsWith("applyPlan"))).toBe(false);
  });

  it("an OTP-only page is also no-ai", () => {
    const doc = new JSDOM("<form><input type='text' name='otp'></form>").window.document;
    const a = analyze(doc, fakeDeps());
    if (a.status !== "ok") throw new Error("too large");
    expect(decideGate({ url: ERP, blocklist: [], risk: a.risk })).toEqual({ kind: "no-ai", reasons: ["password"] });
  });

  it("a user-blocklisted ERP is still blocked before the page is touched", async () => {
    const h = harness({ settings: { blocklist: ["erp.iitkgp.ac.in"] } });
    const out = await transform(ERP, h.deps);
    expect(out).toMatchObject({ kind: "blocked" });
    expect(h.page.calls).toEqual([]);
    expect(calls(h)).toBe(0);
  });

  it("a legacy page without secret inputs may use AI as usual", async () => {
    const h = harness({ analysis: real("legacy-portal-fonts") });
    const out = await transform(ERP, h.deps);
    expect(out.kind).not.toBe("blocked");
    expect(calls(h)).toBeGreaterThan(0);
  });
});
