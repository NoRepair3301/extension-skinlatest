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
    expect("icons" in good).toBe(false);
  });

  it("passes validation", () => {
    expect(validateManifest(good)).toEqual([]);
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

  it("rejects a non-MV3 manifest", () => {
    expect(validateManifest(with_({ manifest_version: 2 }))).toContain("manifest_version must be 3");
  });
});
