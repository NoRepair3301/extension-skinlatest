import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { makeZip, readZip, type ZipEntry } from "./zip.ts";

/** Every file under `dir` except source maps, as zip entries with forward-slash names, sorted. */
export function collectDist(dir: string): ZipEntry[] {
  const out: ZipEntry[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (!name.endsWith(".map")) out.push({ name: relative(dir, p).replace(/\\/g, "/"), data: readFileSync(p) });
    }
  };
  walk(dir);
  return out;
}

/** Only these kinds of files belong in the extension package. */
const ALLOWED_ENTRY = /^(?:manifest\.json|[A-Za-z0-9_-]+\.js|(?:assets|icons|options|popup)\/[A-Za-z0-9._-]+\.(?:js|css|html|png))$/;
const REQUIRED = ["manifest.json", "background.js", "applier.js", "applier-auto.js", "palette.js", "popup/index.html", "options/index.html", "icons/icon-128.png"];

/** Problems with the file list of a release zip (empty when fine). */
export function checkEntries(names: readonly string[]): string[] {
  const out: string[] = [];
  for (const r of REQUIRED) if (!names.includes(r)) out.push(`missing: ${r}`);
  for (const n of names) if (!ALLOWED_ENTRY.test(n)) out.push(`unexpected file: ${n}`);
  return out;
}

/** Reads a zip back and checks its file list. */
export function verifyRelease(path: string): string[] {
  return checkEntries(readZip(readFileSync(path)).map((e) => e.name));
}

/** Zips dist/ only. Returns the path written. */
export function buildRelease(dist = "dist", outDir = "release"): string {
  const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8")) as { version: string };
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `skinly-ai-${manifest.version}.zip`);
  writeFileSync(path, makeZip(collectDist(dist)));
  return path;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/release.ts")) {
  const path = buildRelease();
  const problems = verifyRelease(path);
  if (problems.length > 0) {
    process.stdout.write(problems.map((p) => `release: ${p}\n`).join(""));
    process.exitCode = 1;
  } else {
    process.stdout.write(`release: ${path}\n`);
  }
}
