import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { buildUserMessage } from "../../src/ai/prompt.ts";
import { analyze } from "../../src/analyzer/analyze.ts";
import { compileCss } from "../../src/plan/compile.ts";
import { validatePlan, type StylePlan } from "../../src/plan/schema.ts";
import { themeToPlan } from "../../src/plan/themeToPlan.ts";
import { fakeDeps } from "../analyzer/helpers.ts";
import { sampleSummary } from "../plan/helpers.ts";
import { goodPlan } from "./harness.ts";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p.split("\\").join("/")] : [];
  });

describe("AI output reaches the compiler only through the validator", () => {
  it("is a type error to compile a plan that has not been validated", () => {
    const raw: StylePlan = themeToPlan("ocean");
    // @ts-expect-error StylePlan is not ValidPlan: only validatePlan produces one
    compileCss(raw, sampleSummary());
    const v = validatePlan(goodPlan(), sampleSummary());
    expect(v.ok).toBe(true);
    if (v.ok) expect(compileCss(v.plan, sampleSummary())).toContain("data-skinly");
  });

  it("compileCss is called only by the applier, after validatePlan", () => {
    const users = files("src").filter((f) => /\bcompileCss\(/.test(readFileSync(f, "utf8")) && f !== "src/plan/compile.ts");
    expect(users).toEqual(["src/extension/applier-core.ts"]);
    const text = readFileSync("src/extension/applier-core.ts", "utf8");
    expect(text.indexOf("validatePlan(")).toBeGreaterThan(-1);
    expect(text.indexOf("validatePlan(")).toBeLessThan(text.indexOf("compileCss("));
  });

  it("provider modules are imported only by the registry layer, keys, the flow wiring and the bake-off", () => {
    const importers = files("src").filter((f) => /from "\.\.\/providers\/(gemini|groq|http)\.ts"/.test(readFileSync(f, "utf8")));
    expect(importers).toEqual([]);
  });
});

describe("payload", () => {
  const dir = "fixtures/web";
  const names = readdirSync(dir).filter((f) => f.endsWith(".html"));

  it.each(names)("%s: the payload contains no marker and is at most 20 KB", (file) => {
    const marker = "zqxleakmarker";
    const doc = new JSDOM(readFileSync(`${dir}/${file}`, "utf8")).window.document;
    const walker = doc.createTreeWalker(doc, 4);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) n.nodeValue = marker + "text";
    let i = 0;
    for (const el of Array.from(doc.querySelectorAll("*"))) {
      for (const a of ["title", "aria-label", "data-leak", "href", "alt", "value", "placeholder", "src", "name", "action"]) el.setAttribute(a, marker + a);
      el.setAttribute("id", `${marker}id${i++}`);
    }
    const a = analyze(doc, fakeDeps());
    if (a.status !== "ok") throw new Error("too large");
    const payload = buildUserMessage(a.summary);
    expect(payload).not.toContain(marker);
    expect(payload.length).toBeLessThanOrEqual(20 * 1024);
    expect(JSON.parse(payload).v).toBe(1);
  });

  it("the payload has exactly the SPEC 4.1 keys", () => {
    expect(Object.keys(JSON.parse(buildUserMessage(sampleSummary()))).sort()).toEqual(["counts", "fonts", "palette", "regions", "risk", "v", "viewport"]);
  });
});
