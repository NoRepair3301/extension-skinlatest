import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { buildUserMessage } from "../../src/ai/prompt.ts";
import { analyze } from "../../src/analyzer/analyze.ts";
import { createApplier, type StyleHost } from "../../src/extension/applier-core.ts";
import { validatePlan, type StylePlan } from "../../src/plan/schema.ts";
import { fakeDeps } from "../analyzer/helpers.ts";
import { planFor, sampleSummary } from "../plan/helpers.ts";
import { badPlan, goodPlan } from "./harness.ts";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p.split("\\").join("/")] : [];
  });

describe("AI output reaches the engine only through the validator", () => {
  const bare = () => {
    const doc = new JSDOM('<!DOCTYPE html><html><body style="background-color: rgb(255, 255, 255)"><p style="color: rgb(0, 0, 0)">x</p></body></html>').window.document;
    const sheets: string[] = [];
    const style: StyleHost = {
      add(css) {
        sheets.push(css);
        return { remove: () => void sheets.splice(sheets.indexOf(css), 1), isAttached: () => sheets.includes(css) };
      },
    };
    return { doc, sheets, applier: createApplier(doc, { style, summaryDeps: fakeDeps() }) };
  };

  it("a plan the validator refuses never reaches the page", () => {
    const { doc, sheets, applier } = bare();
    const before = doc.documentElement.outerHTML;
    expect(validatePlan(badPlan(), sampleSummary()).ok).toBe(false);
    expect(applier.apply(badPlan() as unknown as StylePlan)).toMatchObject({ ok: false, reason: "invalid-plan" });
    expect(sheets).toHaveLength(0);
    expect(applier.isActive()).toBe(false);
    expect(doc.documentElement.outerHTML).toBe(before);
    // The counterpart: a plan the validator accepts is applied.
    expect(validatePlan(goodPlan(), sampleSummary()).ok).toBe(true);
    expect(applier.apply(planFor("ocean")).ok).toBe(true);
    expect(applier.isActive()).toBe(true);
  });

  it("the engine is created only by the applier, after validatePlan", () => {
    const users = files("src").filter((f) => !f.startsWith("src/engine/") && /\bcreateColorEngine\(/.test(readFileSync(f, "utf8")));
    expect(users).toEqual(["src/extension/applier-core.ts"]);
    const text = readFileSync("src/extension/applier-core.ts", "utf8");
    expect(text.indexOf("validatePlan(")).toBeGreaterThan(-1);
    expect(text.indexOf("validatePlan(")).toBeLessThan(text.indexOf("createColorEngine("));
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
    expect(Object.keys(JSON.parse(buildUserMessage(sampleSummary()))).sort()).toEqual(["counts", "fonts", "page", "palette", "regions", "risk", "v", "viewport"]);
  });
});
