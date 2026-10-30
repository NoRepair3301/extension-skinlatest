import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUDGETS, budgetProblems, measureDist } from "../scripts/validate-dist.ts";

const ok = { popupGzip: 1000, applierGzip: 1000, autoGzip: 1000, sceneMin: 1000 };
const KB = 1024;

describe("performance budgets", () => {
  it("are the numbers in docs/PERF.md", () => {
    expect(BUDGETS).toEqual({ popupGzip: 60 * KB, applierGzip: 50 * KB, autoGzip: 20 * KB, sceneMin: 150 * KB });
  });

  it("pass at the limit and fail one byte over, each on its own", () => {
    expect(budgetProblems({ popupGzip: 60 * KB, applierGzip: 50 * KB, autoGzip: 20 * KB, sceneMin: 150 * KB })).toEqual([]);
    expect(budgetProblems({ ...ok, popupGzip: 60 * KB + 1 })).toEqual([expect.stringContaining("popup bundle")]);
    expect(budgetProblems({ ...ok, applierGzip: 50 * KB + 1 })).toEqual([expect.stringContaining("applier.js")]);
    expect(budgetProblems({ ...ok, autoGzip: 20 * KB + 1 })).toEqual([expect.stringContaining("applier-auto.js")]);
    expect(budgetProblems({ ...ok, sceneMin: 150 * KB + 1 })).toEqual([expect.stringContaining("scene.js")]);
  });

  it("measureDist counts gzip bytes of the popup and its chunks, and the raw size of the scene script", () => {
    const dir = "private/test-budget-dist"; // private/ is gitignored
    mkdirSync(join(dir, "assets"), { recursive: true });
    let x = 12345;
    const noise = Array.from({ length: 6000 }, () => String.fromCharCode(33 + ((x = (x * 1103515245 + 12345) % 2147483648) % 90))).join("");
    writeFileSync(join(dir, "popup.js"), noise);
    writeFileSync(join(dir, "assets", "shared.js"), noise);
    writeFileSync(join(dir, "scene.js"), "x".repeat(500));
    const s = measureDist(dir);
    expect(s.popupGzip).toBeGreaterThan(8000);
    expect(s.sceneMin).toBe(500);
    expect(s.applierGzip).toBe(0);
  });

  it("the real build, when present, is inside every budget", async () => {
    const { existsSync } = await import("node:fs");
    if (!existsSync("dist/manifest.json")) return;
    expect(budgetProblems(measureDist("dist"))).toEqual([]);
  });
});
