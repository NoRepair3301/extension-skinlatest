import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateManifest } from "../scripts/validate-dist.ts";

const good = JSON.parse(readFileSync("manifest.json", "utf8")) as Record<string, unknown>;
const with_ = (patch: Record<string, unknown>) => ({ ...good, ...patch });

describe("manifest.json", () => {
  it("is MV3 with exactly the allowed permissions", () => {
    expect(good["manifest_version"]).toBe(3);
    expect(good["permissions"]).toEqual(["activeTab", "scripting", "storage"]);
    expect(good["optional_host_permissions"]).toEqual(["https://*/*", "http://*/*"]);
    expect("host_permissions" in good).toBe(false);
    expect("content_scripts" in good).toBe(false);
    expect(Object.keys(good["icons"] as object)).toEqual(["16", "32", "48", "128"]);
  });

  it("declares the five keyboard commands; at most 4 carry a suggested key (browser limit)", () => {
    const commands = good["commands"] as Record<string, { suggested_key?: { default: string }; description: string }>;
    expect(Object.values(commands).filter((c) => c.suggested_key).length).toBeLessThanOrEqual(4);
    expect(Object.entries(commands).filter(([, c]) => !c.suggested_key).map(([n]) => n)).toEqual(["open-palette"]);
    expect(Object.keys(commands)).toEqual(["transform-page", "restore-page", "open-palette", "toggle-blur-page", "toggle-pet"]);
    expect(commands["toggle-pet"]!.suggested_key!.default).toBe("Alt+Shift+P");
    expect(commands["toggle-blur-page"]!.suggested_key!.default).toBe("Alt+Shift+B");
    for (const c of Object.values(commands)) expect(c.description.length).toBeGreaterThan(5);
  });

  it("passes validation", () => {
    expect(validateManifest(good)).toEqual([]);
  });

  it("rejects more than 4 suggested keys", () => {
    const c = { ...(good["commands"] as object), extra: { suggested_key: { default: "Alt+Shift+X" }, description: "Extra command" } };
    expect(validateManifest(with_({ commands: c }))).toEqual([expect.stringContaining("suggested_key")]);
  });

  it("rejects an unexpected permission", () => {
    expect(validateManifest(with_({ permissions: ["activeTab", "scripting", "storage", "tabs"] }))).toHaveLength(1);
    expect(validateManifest(with_({ permissions: ["activeTab", "scripting"] }))).toHaveLength(1);
  });

  it("rejects host_permissions, content_scripts, <all_urls> and changed optional hosts", () => {
    expect(validateManifest(with_({ host_permissions: ["https://a.test/*"] }))).toContain("host_permissions must not exist");
    expect(validateManifest(with_({ content_scripts: [] }))).toContain("content_scripts must not exist");
    expect(validateManifest(with_({ optional_host_permissions: ["<all_urls>"] }))).toContain("<all_urls> must not appear");
    expect(validateManifest(with_({ optional_host_permissions: ["https://*/*"] }))).toHaveLength(1);
  });

  it("rejects a missing or malformed version", () => {
    expect(validateManifest(with_({ version: "1.0" }))).toContain("version must look like 1.2.3");
    expect(validateManifest(with_({ version: undefined }))).toContain("version must look like 1.2.3");
  });

  it("rejects a non-MV3 manifest", () => {
    expect(validateManifest(with_({ manifest_version: 2 }))).toContain("manifest_version must be 3");
  });
});
