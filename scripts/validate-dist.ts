import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { ALLOWED_URL_HOSTS } from "../src/config.ts";
import { KEY_PATTERNS, SERVICE_ROLE_RE } from "./rules.ts";

const PERMISSIONS = ["activeTab", "scripting", "storage"];
const OPTIONAL_HOSTS = ["https://*/*", "http://*/*"];

/**
 * The engine marker attribute (src/engine/dom.ts ENGINE_MARK). Defined once here; the Stage 6 rename changes it to data-repaint-engine.
 * It also opens the engine base-sheet signature (`html[<marker>-sheet]`, a template in dom.ts, not a plain literal), so the marker alone covers both.
 */
export const ENGINE_MARKER = "data-skinly-engine";

/** XML namespace identifiers that appear in bundled libraries but are never fetched. */
const NAMESPACE_URL = /^https?:\/\/www\.w3\.org\//i;

/** Chromium refuses to load an extension with more suggested shortcuts than this. */
export const MAX_SUGGESTED_KEYS = 4;

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
  const suggested = Object.values((m["commands"] ?? {}) as Record<string, { suggested_key?: unknown }>).filter((c) => c.suggested_key !== undefined).length;
  if (suggested > MAX_SUGGESTED_KEYS) out.push(`at most ${MAX_SUGGESTED_KEYS} commands may have a suggested_key (found ${suggested})`);
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
  for (const [rule, re] of KEY_PATTERNS) {
    if (!re.test(text)) continue;
    out.push(rule);
  }
  if (SERVICE_ROLE_RE.test(text)) out.push("service_role");
  for (const m of text.matchAll(/https?:\/\/([^\s/"'`)<>\\:?#]+)[^\s"'`)<>\\]*/gi)) {
    if (NAMESPACE_URL.test(m[0])) continue;
    const host = (m[1] ?? "").toLowerCase();
    if (!allowedHosts.includes(host)) out.push(`remote URL: ${host}`);
  }
  return out;
}

/** Phase 10: all scene code, minified, stays under this. */
export const SCENE_MAX_BYTES = 150 * 1024;

/** Phase 11 budgets (docs/PERF.md). Popup, applier and auto script are gzip sizes; the scene script is minified size. */
export const BUDGETS = { popupGzip: 60 * 1024, applierGzip: 50 * 1024, autoGzip: 20 * 1024, sceneMin: SCENE_MAX_BYTES } as const;

export interface Sizes {
  popupGzip: number;
  applierGzip: number;
  autoGzip: number;
  sceneMin: number;
}

/** Pure check so a test can feed sizes. */
export function budgetProblems(s: Sizes): string[] {
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  const out: string[] = [];
  if (s.popupGzip > BUDGETS.popupGzip) out.push(`popup bundle is ${kb(s.popupGzip)} gzip, budget ${kb(BUDGETS.popupGzip)}`);
  if (s.applierGzip > BUDGETS.applierGzip) out.push(`applier.js is ${kb(s.applierGzip)} gzip, budget ${kb(BUDGETS.applierGzip)}`);
  if (s.autoGzip > BUDGETS.autoGzip) out.push(`applier-auto.js is ${kb(s.autoGzip)} gzip, budget ${kb(BUDGETS.autoGzip)}`);
  if (s.sceneMin > BUDGETS.sceneMin) out.push(`scene.js is ${kb(s.sceneMin)} minified, budget ${kb(BUDGETS.sceneMin)}`);
  return out;
}

const gz = (file: string): number => (existsSync(file) ? gzipSync(readFileSync(file), { level: 9 }).length : 0);

/** The popup bundle is popup.js plus every shared chunk (an upper bound: options shares them). */
export function measureDist(dist: string): Sizes {
  const chunks = existsSync(join(dist, "assets")) ? jsFiles(join(dist, "assets")) : [];
  const scene = join(dist, "scene.js");
  return {
    popupGzip: gz(join(dist, "popup.js")) + chunks.reduce((n, f) => n + gz(f), 0),
    applierGzip: gz(join(dist, "applier.js")),
    autoGzip: gz(join(dist, "applier-auto.js")),
    sceneMin: existsSync(scene) ? statSync(scene).size : 0,
  };
}

const allFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? allFiles(p) : [p];
  });

const jsFiles = (dir: string): string[] => allFiles(dir).filter((p) => p.endsWith(".js"));

/** D9 / I9: the engine lives in applier.js only; applier-auto.js reaches it through the applier global and must not embed it. */
export function engineBundleProblems(applierJs: string, autoJs: string): string[] {
  const out: string[] = [];
  if (!applierJs.includes(ENGINE_MARKER)) out.push(`applier.js must contain the engine marker ${ENGINE_MARKER}`);
  if (autoJs.includes(ENGINE_MARKER)) out.push(`applier-auto.js must not embed the engine (found ${ENGINE_MARKER}); it applies through the applier`);
  return out;
}

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
  for (const f of [bg, popup, options, "applier.js", "palette.js", "scene.js", ...icons]) {
    if (!f || !existsSync(join(dist, f))) out.push(`missing built file: ${f ?? "(unset in manifest)"}`);
  }
  const shipped = allFiles(dist).map((f) => f.split("\\").join("/")).filter((f) => f.includes("/icons/")).map((f) => f.slice(f.lastIndexOf("/") + 1)).sort();
  const wanted = ["icon-128.png", "icon-16.png", "icon-32.png", "icon-48.png"];
  if (shipped.join() !== wanted.join()) out.push(`dist/icons must hold exactly ${wanted.join(", ")}, found: ${shipped.join(", ") || "nothing"}`);
  const scene = join(dist, "scene.js");
  if (existsSync(scene) && statSync(scene).size > SCENE_MAX_BYTES) out.push(`scene.js is over ${SCENE_MAX_BYTES / 1024} KB`);
  out.push(...budgetProblems(measureDist(dist)));
  if (allFiles(dist).some((f) => f.endsWith(".map"))) out.push("source map files must not ship");
  for (const file of jsFiles(dist)) {
    for (const rule of scanBuiltJs(readFileSync(file, "utf8"))) out.push(`${file}: ${rule}`);
  }
  return out;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/validate-dist.ts")) {
  const problems = validateDist("dist");
  // Run here, not inside validateDist: tests feed validateDist stub bundles that hold no engine.
  const read = (f: string): string => (existsSync(join("dist", f)) ? readFileSync(join("dist", f), "utf8") : "");
  if (existsSync(join("dist", "applier.js"))) problems.push(...engineBundleProblems(read("applier.js"), read("applier-auto.js")));
  if (problems.length > 0) {
    process.stdout.write(problems.map((p) => `validate-dist: ${p}\n`).join(""));
    process.exitCode = 1;
  } else {
    process.stdout.write("validate-dist: ok\n");
  }
}
