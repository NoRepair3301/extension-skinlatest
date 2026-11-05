// Leftover scanner for the Skinly AI -> Repaint rename (Stage 6). Zero dependencies.
// Usage: node scripts/rename-check.mjs [--summary] [--class A|B|...] [--json] [--list-allowed] [--root <dir>]
//   default      leftovers: N in M files, top 15 files with one sample line each
//   --summary    counts per class (hits / files / allowlisted); --class X lists one class
//   --json       machine-readable output; --list-allowed shows what the allowlist hides
// Exit code: 0 = no non-allowlisted hits, 1 = leftovers, 2 = internal error.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const PATTERN = /skinly/i;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "private"]);
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|zip|gz|woff2?|ttf|otf|pdf|mp4|webm|map)$/i;
const MAX_BYTES = 2 * 1024 * 1024;

// Class table, first match wins. Same letters as workflow/RENAME_MAP.md.
// K (history) is decided by path, the rest by the matched text.
export const CLASSES = {
  A: "DOM markers and attributes",
  B: "window globals / injected API names",
  C: "message types and contracts",
  D: "bundle / IIFE names and build config",
  E: "CSS ids, classes, custom properties, host names",
  F: "theme code prefix",
  G: "storage keys",
  H: "package, manifest, scripts, release, assets",
  I: "user-visible strings, README, docs",
  J: "tests, fixtures, comments",
  K: "archives and history",
};

const K_PATHS = [/^docs\/archive\//, /^workflow\//, /^prompts\//, /^CLAUDE\.legacy\.md$/, /^_recon\//, /^STAGES\.md$/, /^specs\.md$/, /^CHANGELOG\.md$/,
  /^docs\/(PROGRESS|FINAL_REPORT|HUMAN_CHECKS)\.md$/, /^docs\/PHASE_/, /^(PROMPTS\.md|prompt-launch\.txt|autopilot-all\.ps1)$/,
  // The scanner, its allowlist and its test quote the old names on purpose.
  /^scripts\/rename-(check\.mjs|allowlist\.json)$/, /^tests\/rename-check\.test\.ts$/];

/** @param {{path:string,text:string,line?:string}} m */
export function classify(m) {
  const path = m.path.split(sep).join("/");
  const t = m.text;
  if (K_PATHS.some((r) => r.test(path))) return "K";
  if (/skinly1:/i.test(t)) return "F";
  if (/data-skinly/i.test(t) || /dataset\.skinly/i.test(t)) return "A";
  if (/skinly-badge|skinly-[a-z]+-on\b/i.test(t)) return "C";
  if (/Skinly(Applier|ApplierAuto|Scene|Palette)\b|skinly-manifest/.test(t)) return "D";
  if (/\bskinly(Applier|Tools|Toast|Scene|Palette|OnApplied|AutoLive)\b|\.skinly[A-Z]/.test(t)) return "B";
  if (/skinly-(force|ui-box|pet|opt|list|cover|child|x)\b|skinly-opt-/i.test(t)) return "E";
  if (/skinly-ai|skinly-(icon|logo)|skinly_ai|SkinlyAI/i.test(t)) return "H";
  if (/^(package\.json|manifest\.json|vite\.config\.ts|scripts\/)/.test(path)) return "H";
  if (/^(tests|fixtures)\//.test(path)) return "J";
  if (/^(src\/ui\/|README\.md|docs\/)/.test(path)) return "I";
  if (/^src\//.test(path)) return "I";
  return "J";
}

function globToRegex(g) {
  const esc = g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*");
  return new RegExp(`^${esc}`);
}

/** Throws on an entry with no reason, so a lazy allowlist cannot pass silently. */
export function compileAllowlist(list) {
  return list.map((e, i) => {
    if (!e || typeof e.reason !== "string" || e.reason.trim() === "") throw new Error(`allowlist entry ${i} (${e?.path ?? "?"}) has no reason`);
    if (typeof e.path !== "string" || e.path === "") throw new Error(`allowlist entry ${i} has no path`);
    return { entry: e, path: globToRegex(e.path), pattern: e.pattern ? new RegExp(e.pattern, "i") : null };
  });
}

/**
 * @param {{path:string,content:string}[]} fileEntries relative paths with text content
 * @param {object[]} allowlist raw allowlist entries
 * @returns {{hits:object[],allowed:object[]}}
 */
export function scan(fileEntries, allowlist) {
  const rules = compileAllowlist(allowlist);
  const hits = [];
  const allowed = [];
  for (const f of fileEntries) {
    const path = f.path.split(sep).join("/");
    // A file whose own name carries the old name is a leftover too (reported as line 0).
    const lines = [PATTERN.test(path) ? `[file name] ${path}` : "", ...f.content.split(/\r?\n/)];
    lines.forEach((line, i) => {
      if (!PATTERN.test(line)) return;
      const m = { path, line: i, text: line.trim().slice(0, 160) };
      m.cls = i === 0 && /^(assets|release)\//.test(path) ? "H" : classify(m);
      const rule = rules.find((r) => r.path.test(path) && (!r.pattern || r.pattern.test(line)));
      if (rule) allowed.push({ ...m, reason: rule.entry.reason });
      else hits.push(m);
    });
  }
  return { hits, allowed };
}

export function exitCode(result) {
  return result.hits.length === 0 ? 0 : 1;
}

export function collectFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name)) walk(full);
      } else if (BINARY_EXT.test(name) || st.size > MAX_BYTES) {
        out.push({ path: relative(root, full), content: "" }); // name only: contents are never read
      } else {
        const buf = readFileSync(full);
        if (buf.includes(0)) { out.push({ path: relative(root, full), content: "" }); continue; } // NUL byte: binary
        out.push({ path: relative(root, full), content: buf.toString("utf8") });
      }
    }
  };
  walk(root);
  return out;
}

const tally = (items) => {
  const files = new Map();
  for (const h of items) files.set(h.path, [...(files.get(h.path) ?? []), h]);
  return files;
};

function perClass(result) {
  const rows = {};
  for (const c of Object.keys(CLASSES)) rows[c] = { hits: 0, files: 0, allowed: 0 };
  for (const c of Object.keys(CLASSES)) {
    rows[c].hits = result.hits.filter((h) => h.cls === c).length;
    rows[c].files = tally(result.hits.filter((h) => h.cls === c)).size;
    rows[c].allowed = result.allowed.filter((h) => h.cls === c).length;
  }
  return rows;
}

function main(argv) {
  const arg = (n) => argv.indexOf(n);
  const rootAt = arg("--root");
  const root = resolve(rootAt >= 0 ? argv[rootAt + 1] : join(fileURLToPath(import.meta.url), "..", ".."));
  const allowFile = join(root, "scripts", "rename-allowlist.json");
  let allowlist = [];
  try {
    allowlist = JSON.parse(readFileSync(allowFile, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const result = scan(collectFiles(root), allowlist);
  const cls = arg("--class") >= 0 ? String(argv[arg("--class") + 1]).toUpperCase() : null;
  if (cls && !CLASSES[cls]) throw new Error(`unknown class ${cls}`);
  const hits = cls ? result.hits.filter((h) => h.cls === cls) : result.hits;
  const code = exitCode(cls ? { hits } : result);

  if (argv.includes("--json")) {
    console.log(JSON.stringify({ leftovers: hits.length, files: tally(hits).size, classes: perClass(result), hits, allowed: argv.includes("--list-allowed") ? result.allowed : undefined }, null, 2));
  } else if (argv.includes("--list-allowed")) {
    const by = new Map();
    for (const a of result.allowed) by.set(a.reason, (by.get(a.reason) ?? 0) + 1);
    console.log(`allowed: ${result.allowed.length} hits in ${tally(result.allowed).size} files`);
    for (const e of allowlist) console.log(`  ${String(by.get(e.reason) ?? 0).padStart(5)}  ${e.path}${e.pattern ? ` /${e.pattern}/` : ""} -- ${e.reason}`);
  } else if (argv.includes("--summary")) {
    const rows = perClass(result);
    console.log(`leftovers: ${result.hits.length} in ${tally(result.hits).size} files (allowlisted ${result.allowed.length})`);
    console.log("class  hits  files  allowed  name");
    for (const [c, r] of Object.entries(rows)) console.log(`${c.padEnd(5)}  ${String(r.hits).padStart(4)}  ${String(r.files).padStart(5)}  ${String(r.allowed).padStart(7)}  ${CLASSES[c]}`);
  } else {
    const files = [...tally(hits)].sort((a, b) => b[1].length - a[1].length);
    console.log(`leftovers: ${hits.length} in ${files.length} files`);
    for (const [p, hs] of files.slice(0, 15)) console.log(`${String(hs.length).padStart(5)}  ${p}  [${hs[0].cls}] ${hs[0].text.slice(0, 90)}`);
    if (files.length > 15) console.log(`  ... ${files.length - 15} more files`);
  }
  return code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`rename-check: ${e.message}`);
    process.exitCode = 2;
  }
}
