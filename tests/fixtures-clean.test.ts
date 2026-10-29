import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DATA_URI_RE, EMAIL_RE, loadTerms, PHONE_RE, TOKEN_RE } from "../scripts/scrub-fixture.ts";

const ROOT = "fixtures";

const htmlFiles = (dir: string): string[] =>
  !existsSync(dir)
    ? []
    : readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) return htmlFiles(p);
        return name.endsWith(".html") ? [p] : [];
      });

const found = (text: string, re: RegExp) => new RegExp(re.source, re.flags.replace("g", "")).test(text);

/** Rule names that a fixture still violates (never the matched text). */
export function dirtyRules(html: string, terms: readonly string[]): string[] {
  const out: string[] = [];
  if (/<script\b[^>]*>\s*[^<\s]/i.test(html)) out.push("script body");
  if (/<[^>]+\son[a-z]+\s*=/i.test(html)) out.push("on* attribute");
  if (found(html, EMAIL_RE)) out.push("email");
  if (found(html, PHONE_RE)) out.push("phone");
  if (found(html, TOKEN_RE)) out.push("token-like string");
  if (found(html, DATA_URI_RE)) out.push("data: URI");
  if (/<input\b[^>]*\svalue\s*=\s*["']?[^"'\s>]/i.test(html)) out.push("input value");
  const lower = html.toLowerCase();
  if (terms.some((t) => t.trim() && lower.includes(t.toLowerCase()))) out.push("local term");
  return out;
}

describe("fixtures are clean", () => {
  const terms = loadTerms();
  const files = htmlFiles(ROOT);

  it("passes when fixtures/ is empty or every fixture is scrubbed", () => {
    for (const file of files) expect({ file, dirty: dirtyRules(readFileSync(file, "utf8"), terms) }).toEqual({ file, dirty: [] });
  });

  it("detects each kind of leftover (planted)", () => {
    const planted: Array<[string, string]> = [
      ["script body", "<script>var a = 1</script>"],
      ["on* attribute", '<div onclick="x()">a</div>'],
      ["email", "<p>" + "person" + "@" + "example" + ".test</p>"],
      ["phone", "<p>+1 415 555 " + "0132</p>"],
      ["token-like string", "<p>" + "a1b2c3d4".repeat(5) + "</p>"],
      ["data: URI", '<img src="data:image/png;base64,QUJD">'],
      ["input value", '<input type="text" value="hunter22">'],
    ];
    for (const [rule, html] of planted) expect(dirtyRules(html, [])).toContain(rule);
    expect(dirtyRules("<p>Some Term here</p>", ["some term"])).toContain("local term");
  });

  it("accepts a clean page", () => {
    expect(dirtyRules('<div class="a"><input type="text" value=""><script src="#"></script></div>', [])).toEqual([]);
  });
});
