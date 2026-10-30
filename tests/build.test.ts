import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanBuiltJs, validateDist } from "../scripts/validate-dist.ts";

describe("scanBuiltJs", () => {
  it("passes clean code and XML namespace URLs", () => {
    expect(scanBuiltJs('const a = 1; const ns = "http://www.w3.org/2000/svg";', [])).toEqual([]);
  });

  it("flags eval and new Function", () => {
    expect(scanBuiltJs("eval('1')", [])).toEqual(["eval("]);
    expect(scanBuiltJs("new Function('return 1')", [])).toEqual(["new Function"]);
  });

  it("flags remote URLs unless the host is allowlisted", () => {
    expect(scanBuiltJs('fetch("https://cdn.example.org/x.js")', [])).toEqual(["remote URL: cdn.example.org"]);
    expect(scanBuiltJs('const u = "https://api.example.test/v1"', ["api.example.test"])).toEqual([]);
  });

  it("flags key-like strings without echoing them", () => {
    const found = scanBuiltJs('const k = "' + "AIza" + "a".repeat(30) + '"', []);
    expect(found).toEqual(["key-like string (AIza)"]);
  });
});

describe("validateDist", () => {
  const dir = "node_modules/.skinly-test-dist";
  const manifest = {
    manifest_version: 3,
    version: "1.0.0",
    permissions: ["activeTab", "scripting", "storage"],
    optional_host_permissions: ["https://*/*", "http://*/*"],
    background: { service_worker: "background.js", type: "module" },
    action: { default_popup: "popup/index.html" },
    options_page: "options/index.html",
  };
  const ICONS = ["icon-16.png", "icon-32.png", "icon-48.png", "icon-128.png"];
  const write = (m: unknown, js: string, icons: string[] = ICONS, d = dir) => {
    mkdirSync(`${d}/popup`, { recursive: true });
    mkdirSync(`${d}/options`, { recursive: true });
    mkdirSync(`${d}/icons`, { recursive: true });
    for (const n of icons) writeFileSync(`${d}/icons/${n}`, "png");
    writeFileSync(`${d}/manifest.json`, JSON.stringify(m));
    for (const f of ["popup/index.html", "options/index.html", "applier.js", "palette.js"]) writeFileSync(`${d}/${f}`, "x");
    writeFileSync(`${d}/background.js`, js);
  };

  it("accepts a clean build", () => {
    write(manifest, "console.log(1)");
    expect(validateDist(dir)).toEqual([]);
  });

  it("rejects a missing or extra icon file", () => {
    write(manifest, "console.log(1)", [...ICONS, "icon-64.png"]);
    expect(validateDist(dir).join()).toContain("dist/icons must hold exactly");
    write(manifest, "console.log(1)", ICONS.slice(1));
    expect(validateDist(dir).join()).toContain("dist/icons must hold exactly");
  });

  it("rejects an unexpected permission and dangerous built code", () => {
    write({ ...manifest, permissions: [...manifest.permissions, "cookies"] }, "eval('1')");
    const problems = validateDist(dir);
    expect(problems.some((p) => p.includes("permissions"))).toBe(true);
    expect(problems.some((p) => p.endsWith("eval("))).toBe(true);
  });

  it("reports a missing build output", () => {
    expect(validateDist("node_modules/.skinly-no-such-dist")).toEqual(["dist/manifest.json is missing"]);
  });
});
