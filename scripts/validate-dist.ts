import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ALLOWED_URL_HOSTS } from "../src/config.ts";

const PERMISSIONS = ["activeTab", "scripting", "storage"];
const OPTIONAL_HOSTS = ["https://*/*", "http://*/*"];

/** XML namespace identifiers that appear in bundled libraries but are never fetched. */
const NAMESPACE_URL = /^https?:\/\/www\.w3\.org\//i;

const KEY_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["key-like string (AIza)", /AIza[0-9A-Za-z_-]{20,}/],
  ["key-like string (gsk_)", /gsk_[A-Za-z0-9]{20,}/],
  ["key-like string (xai-)", /xai-[A-Za-z0-9]{20,}/],
  ["key-like string (sk-)", /sk-[A-Za-z0-9]{20,}/],
];

const sameSet = (a: unknown, b: readonly string[]): boolean =>
  Array.isArray(a) && a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");

/** Checks a parsed manifest against SPEC 9. Returns problems (empty when fine). */
export function validateManifest(m: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (m["manifest_version"] !== 3) out.push("manifest_version must be 3");
  if (!sameSet(m["permissions"], PERMISSIONS)) out.push(`permissions must be exactly ${PERMISSIONS.join(", ")}`);
  if (!sameSet(m["optional_host_permissions"], OPTIONAL_HOSTS)) out.push("optional_host_permissions must be exactly https://*/* and http://*/*");
  if ("host_permissions" in m) out.push("host_permissions must not exist");
  if ("content_scripts" in m) out.push("content_scripts must not exist");
  if (JSON.stringify(m).includes("<all_urls>")) out.push("<all_urls> must not appear");
  if (typeof m["version"] !== "string" || !/^\d+\.\d+\.\d+$/.test(m["version"])) out.push("version must look like 1.2.3");
  return out;
}

/** Scans one built JS file. Returns rule names found (never the matched text). */
export function scanBuiltJs(text: string, allowedHosts: readonly string[] = ALLOWED_URL_HOSTS): string[] {
  const out: string[] = [];
  if (/\beval\s*\(/.test(text)) out.push("eval(");
  if (/\bnew\s+Function\b/.test(text)) out.push("new Function");
  if (/[A-Za-z]:\\(?:Users|Downloads)\\|\/(?:Users|home)\/[A-Za-z0-9._-]+\//.test(text)) out.push("developer machine path");
  if (/\/\/# sourceMappingURL=/.test(text)) out.push("source map reference");
  for (const [rule, re] of KEY_PATTERNS) if (re.test(text)) out.push(rule);
  for (const m of text.matchAll(/https?:\/\/([^\s/"'`)<>\\:?#]+)[^\s"'`)<>\\]*/gi)) {
    if (NAMESPACE_URL.test(m[0])) continue;
    const host = (m[1] ?? "").toLowerCase();
    if (!allowedHosts.includes(host)) out.push(`remote URL: ${host}`);
  }
  return out;
}

const allFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? allFiles(p) : [p];
  });

const jsFiles = (dir: string): string[] => allFiles(dir).filter((p) => p.endsWith(".js"));

/** Validates a built extension folder. Returns problems (empty when fine). */
export function validateDist(dist: string): string[] {
  const manifestPath = join(dist, "manifest.json");
  if (!existsSync(manifestPath)) return ["dist/manifest.json is missing"];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  const out = validateManifest(manifest);
  const bg = (manifest["background"] as { service_worker?: string } | undefined)?.service_worker;
  const popup = (manifest["action"] as { default_popup?: string } | undefined)?.default_popup;
  const options = manifest["options_page"] as string | undefined;
  const icons = Object.values((manifest["icons"] as Record<string, string> | undefined) ?? {});
  for (const f of [bg, popup, options, "applier.js", "palette.js", ...icons]) {
    if (!f || !existsSync(join(dist, f))) out.push(`missing built file: ${f ?? "(unset in manifest)"}`);
  }
  if (allFiles(dist).some((f) => f.endsWith(".map"))) out.push("source map files must not ship");
  for (const file of jsFiles(dist)) {
    for (const rule of scanBuiltJs(readFileSync(file, "utf8"))) out.push(`${file}: ${rule}`);
  }
  return out;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/validate-dist.ts")) {
  const problems = validateDist("dist");
  if (problems.length > 0) {
    process.stdout.write(problems.map((p) => `validate-dist: ${p}\n`).join(""));
    process.exitCode = 1;
  } else {
    process.stdout.write("validate-dist: ok\n");
  }
}
