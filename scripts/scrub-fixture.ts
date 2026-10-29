import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { JSDOM } from "jsdom";

export const TERMS_FILE = ".scrub-terms.local.json";

// Shared with tests/fixtures-clean.test.ts so "clean" means the same thing in both places.
export const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
export const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g;
export const TOKEN_RE = /[A-Za-z0-9_-]{32,}/g;
export const DATA_URI_RE = /data:[\w.+-]+\/[\w.+-]+[;,][^\s"')]*/gi;

export type Counts = Record<string, number>;

/** Same-length filler: whitespace is kept, every other character becomes x, with a dot every 16th so it never looks like a token. */
export function filler(text: string): string {
  let n = 0;
  return text.replace(/\S/g, () => (++n % 16 === 0 ? "." : "x"));
}

const ATTR_FILLER = new Set(["alt", "title", "aria-label"]);
const ATTR_REMOVE = new Set(["src", "srcset", "poster"]);

export function scrubHtml(html: string, terms: readonly string[] = []): { html: string; counts: Counts } {
  const counts: Counts = {};
  const bump = (rule: string, by = 1) => {
    if (by > 0) counts[rule] = (counts[rule] ?? 0) + by;
  };

  const dom = new JSDOM(html);
  const doc = dom.window.document;

  for (const el of Array.from(doc.querySelectorAll("script"))) {
    el.remove();
    bump("script");
  }

  const walker = doc.createTreeWalker(doc, 4 | 128); // SHOW_TEXT | SHOW_COMMENT
  const nodes: Node[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  for (const node of nodes) {
    if (node.nodeType === 8) {
      node.parentNode?.removeChild(node);
      bump("comment");
      continue;
    }
    const parent = node.parentElement;
    const text = node.nodeValue ?? "";
    if (!text.trim() || parent?.tagName === "STYLE") continue;
    if (parent?.tagName === "TEXTAREA") {
      node.nodeValue = "";
      bump("input value");
    } else {
      node.nodeValue = filler(text);
      bump("text");
    }
  }

  for (const el of Array.from(doc.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
        bump("event handler");
      } else if (ATTR_FILLER.has(name)) {
        if (attr.value.trim()) bump("text attribute");
        attr.value = filler(attr.value);
      } else if (name === "href" || name === "xlink:href") {
        if (attr.value !== "#") bump("href");
        attr.value = "#";
      } else if (ATTR_REMOVE.has(name)) {
        el.removeAttribute(attr.name);
        bump("src");
      } else if (name === "value") {
        if (attr.value) bump("input value");
        attr.value = "";
      }
    }
  }

  let out = dom.serialize();
  const replace = (rule: string, re: RegExp) => {
    out = out.replace(re, (m) => {
      bump(rule);
      return filler(m);
    });
  };
  replace("data uri", DATA_URI_RE);
  replace("email", EMAIL_RE);
  replace("phone", PHONE_RE);
  replace("token", TOKEN_RE);
  for (const term of terms) {
    if (term.trim()) replace("term", new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"));
  }
  return { html: out, counts };
}

/** Counts per rule, never matched text. */
export function formatReport(counts: Counts): string {
  return Object.entries(counts).map(([rule, n]) => `  ${rule}: ${n}`).join("\n");
}

export function loadTerms(path: string = TERMS_FILE): string[] {
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { terms?: unknown };
  return Array.isArray(parsed.terms) ? parsed.terms.filter((t): t is string => typeof t === "string") : [];
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/scrub-fixture.ts")) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    process.stdout.write("usage: npm run scrub -- <raw.html> <out.html>\n");
    process.exitCode = 1;
  } else {
    const { html, counts } = scrubHtml(readFileSync(input, "utf8"), loadTerms());
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, html);
    process.stdout.write(`scrubbed -> ${output}\n${formatReport(counts)}\n`);
  }
}
