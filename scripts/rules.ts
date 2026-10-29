import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ALLOWED_URL_HOSTS } from "../src/config.ts";

export interface Violation {
  path: string;
  line: number;
  rule: string;
}

const API_FILE = "src/extension/api.ts";
const CONFIG_FILE = "src/config.ts";
const PROVIDERS_DIR = "src/providers/";

/** Forbidden anywhere in src/. */
const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ["eval(", /\beval\s*\(/],
  ["new Function", /\bnew\s+Function\b/],
  ["string setTimeout/setInterval", /\bset(?:Timeout|Interval)\s*\(\s*["'`]/],
  ["innerHTML", /\binnerHTML\b/],
  ["outerHTML assignment", /\bouterHTML\s*=(?!=)/],
  ["insertAdjacentHTML", /\binsertAdjacentHTML\b/],
  ["document.write", /\bdocument\s*\.\s*write(?:ln)?\b/],
  ["localStorage", /\blocalStorage\b/],
  ["sessionStorage", /\bsessionStorage\b/],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/],
  ["sendBeacon", /\bsendBeacon\b/],
  ["WebSocket", /\bWebSocket\b/],
  ["EventSource", /\bEventSource\b/],
  [".click(", /\.click\s*\(/],
  [".submit(", /\.submit\s*\(/],
  ["requestSubmit", /\brequestSubmit\b/],
  ["navigator.credentials", /\bnavigator\s*\.\s*credentials\b/],
  ["<all_urls>", /<all_urls>/],
  ["javascript:", /javascript:/i],
  ["chrome.cookies/history/webRequest/downloads", /\bchrome\s*\.\s*(?:cookies|history|webRequest|downloads)\b/],
  ["tabs.executeScript", /\btabs\s*\.\s*executeScript\b/],
];

/** Forbidden in every scanned text file. */
const KEY_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["key-like string (AIza)", /AIza[0-9A-Za-z_-]{20,}/],
  ["key-like string (gsk_)", /gsk_[A-Za-z0-9]{20,}/],
  ["key-like string (xai-)", /xai-[A-Za-z0-9]{20,}/],
  ["key-like string (sk-)", /sk-[A-Za-z0-9]{20,}/],
];

const URL_RE = /https?:\/\/([^\s/"'`)<>\\:?#]+)/gi;

const norm = (p: string): string => p.replace(/\\/g, "/").replace(/^\.\//, "");

/** Scans one file. Forbidden-API rules apply to src/ only; key patterns apply to any path. */
export function scanSource(path: string, text: string, allowedHosts: readonly string[] = ALLOWED_URL_HOSTS): Violation[] {
  const p = norm(path);
  const inSrc = p.startsWith("src/");
  const out: Violation[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const add = (rule: string) => out.push({ path: p, line: i + 1, rule });
    for (const [rule, re] of KEY_PATTERNS) if (re.test(line)) add(rule);
    if (!inSrc) return;
    for (const [rule, re] of FORBIDDEN) if (re.test(line)) add(rule);
    if (p !== API_FILE && /\b(?:chrome|browser)\s*\./.test(line)) add("chrome./browser. outside src/extension/api.ts");
    if (!p.startsWith(PROVIDERS_DIR) && /\bfetch\s*\(/.test(line)) add("fetch( outside src/providers/");
    if (p !== CONFIG_FILE) {
      for (const m of line.matchAll(URL_RE)) {
        const host = (m[1] ?? "").toLowerCase();
        if (!allowedHosts.includes(host)) add(`URL not on allowlist: ${host}`);
      }
    }
  });
  return out;
}

const TEXT_EXT = /\.(?:ts|tsx|js|json|md|html|css|txt)$/;

/** Scans every text file under the given directories (relative to root). */
export function scanTree(root: string, dirs: readonly string[]): Violation[] {
  const out: Violation[] = [];
  const walk = (rel: string) => {
    for (const name of readdirSync(join(root, rel))) {
      if (name === "node_modules") continue;
      const childRel = `${rel}/${name}`;
      if (statSync(join(root, childRel)).isDirectory()) walk(childRel);
      else if (TEXT_EXT.test(name)) out.push(...scanSource(childRel, readFileSync(join(root, childRel), "utf8")));
    }
  };
  for (const d of dirs) walk(d);
  return out;
}
