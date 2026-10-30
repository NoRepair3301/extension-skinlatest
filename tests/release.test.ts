import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALLOWED_URL_HOSTS } from "../src/config.ts";
import { SUMMARY_MAX_BYTES } from "../src/analyzer/summary.ts";
import { buildRelease, checkEntries, collectDist, verifyRelease } from "../scripts/release.ts";
import { makeZip, readZip } from "../scripts/zip.ts";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string; dependencies: Record<string, string>; devDependencies: Record<string, string> };
const manifest = JSON.parse(readFileSync("manifest.json", "utf8")) as Record<string, unknown>;
const doc = (name: string) => readFileSync(`docs/store/${name}`, "utf8");
const line = (text: string, key: string): string => new RegExp(`^${key}: (.+)$`, "m").exec(text)?.[1]?.trim() ?? "";

describe("version", () => {
  it("is identical in package.json, the manifest and the store text", () => {
    expect(manifest["version"]).toBe(pkg.version);
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(line(doc("listing.md"), "Version")).toBe(pkg.version);
    expect(line(doc("privacy.md"), "Version")).toBe(pkg.version);
    expect(readFileSync("docs/QA.md", "utf8")).toContain(`skinly-ai-${pkg.version}.zip`);
  });
  it("justifies minimum_chrome_version (registerContentScripts with persistAcrossSessions needs 96)", () => {
    expect(manifest["minimum_chrome_version"]).toBe("96");
  });
});

describe("icons", () => {
  it("ships the four PNGs from assets/icons at their stated sizes, and the manifest points at them", () => {
    for (const size of [16, 32, 48, 128]) {
      const a = readFileSync(`assets/icons/icon-${size}.png`);
      const v = new DataView(a.buffer, a.byteOffset);
      expect(Array.from(a.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(v.getUint32(16)).toBe(size);
      expect(v.getUint32(20)).toBe(size);
      expect((manifest["icons"] as Record<string, string>)[String(size)]).toBe(`icons/icon-${size}.png`);
      expect((manifest["action"] as { default_icon: Record<string, string> }).default_icon[String(size)]).toBe(`icons/icon-${size}.png`);
    }
  });
});

describe("release zip", () => {
  const dir = "node_modules/.skinly-release-test";
  const files: Record<string, string> = {
    "manifest.json": JSON.stringify({ version: "9.9.9" }),
    "background.js": "1",
    "applier.js": "1",
    "applier-auto.js": "1",
    "palette.js": "1",
    "popup.js": "1",
    "popup/index.html": "x",
    "options/index.html": "x",
    "assets/a-123.js": "1",
    "icons/icon-128.png": "png",
    "background.js.map": "{}",
  };
  const make = () => {
    for (const [name, data] of Object.entries(files)) {
      const parts = name.split("/");
      mkdirSync(`${dir}/dist/${parts.slice(0, -1).join("/")}`, { recursive: true });
      writeFileSync(`${dir}/dist/${name}`, data);
    }
    return buildRelease(`${dir}/dist`, `${dir}/out`);
  };

  it("writes only dist files, drops source maps and unzips back to the same bytes", () => {
    const path = make();
    expect(path.replace(/\\/g, "/")).toBe(`${dir}/out/skinly-ai-9.9.9.zip`);
    const entries = readZip(readFileSync(path));
    const names = entries.map((e) => e.name);
    expect(names).toEqual(collectDist(`${dir}/dist`).map((e) => e.name));
    expect(names).toHaveLength(Object.keys(files).length - 1);
    expect(names.some((n) => n.endsWith(".map"))).toBe(false);
    expect(new TextDecoder().decode(entries.find((e) => e.name === "applier.js")!.data)).toBe("1");
    expect(verifyRelease(path)).toEqual([]);
  });

  it("flags files that do not belong and files that are missing", () => {
    expect(checkEntries(["manifest.json", "docs/QA.md", "src/x.ts", "private/k.json", "tests/a.js"])).toEqual(
      expect.arrayContaining(["unexpected file: docs/QA.md", "unexpected file: src/x.ts", "unexpected file: private/k.json", "unexpected file: tests/a.js", "missing: background.js"]),
    );
  });

  it("round-trips arbitrary bytes", () => {
    const data = Uint8Array.from({ length: 5000 }, (_, i) => (i * 31) % 251);
    const [e] = readZip(makeZip([{ name: "a/b.bin", data }]));
    expect(e!.name).toBe("a/b.bin");
    expect(Array.from(e!.data)).toEqual(Array.from(data));
  });

  it("the real release zip, when built, passes the same check", () => {
    const path = `release/skinly-ai-${pkg.version}.zip`;
    if (existsSync(path)) expect(verifyRelease(path)).toEqual([]);
  });
});

describe("privacy text matches the product", () => {
  const privacy = doc("privacy.md");
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  it("lists exactly the manifest permissions and provider hosts", () => {
    expect(list(line(privacy, "Permissions")).sort()).toEqual([...(manifest["permissions"] as string[])].sort());
    expect(list(line(privacy, "Provider hosts")).sort()).toEqual([...ALLOWED_URL_HOSTS].sort());
    expect(line(doc("permissions.md"), "Permissions")).toBe((manifest["permissions"] as string[]).join(", "));
    for (const host of ALLOWED_URL_HOSTS) expect(doc("permissions.md")).toContain(host);
    expect(list(line(doc("permissions.md"), "Optional host permissions").replace(/ \(.*$/, ""))).toEqual(manifest["optional_host_permissions"]);
  });

  it("makes the same data claims as the code and tests", () => {
    expect(privacy).toMatch(/No text, links or forms are sent/);
    expect(privacy).toContain("after");
    expect(doc("data-use.md")).toContain(`${SUMMARY_MAX_BYTES / 1024} KB`);
    expect(doc("data-use.md")).toMatch(/no text, links, ids, images, form values, URLs or page titles/i);
    // The payload claims are enforced by these tests (marker test: no page-derived string reaches the payload).
    expect(readFileSync("tests/ai/flow-safety.test.ts", "utf8")).toContain("the payload contains no marker");
    expect(readFileSync("tests/analyzer/fixtures.test.ts", "utf8")).toContain("zqxleakmarker");
  });

  it("claims nothing the extension does not do", () => {
    for (const forbidden of ["analytics enabled", "we collect", "sell your data"]) expect(privacy.toLowerCase()).not.toContain(forbidden);
    expect(Object.keys(pkg.dependencies)).toEqual(["preact"]);
    expect(privacy).toContain("No analytics, telemetry, accounts, ads, remote code or remote configuration");
  });
});
