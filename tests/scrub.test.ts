import { describe, expect, it } from "vitest";
import { DATA_URI_RE, EMAIL_RE, filler, formatReport, PHONE_RE, scrubHtml, TOKEN_RE } from "../scripts/scrub-fixture.ts";

// Fake personal data is assembled at runtime so no real-looking value sits in the repo.
const email = "person" + "@" + "example" + ".test";
const phone = "+1 415 555 " + "0132";
const token = "tk" + "a1b2c3d4".repeat(5);
const term = "Zebra" + "Quokka";
const dataUri = "data:image/png;base64," + "QUJD".repeat(10);

const page = `<!doctype html><html><head><title>Account of ${term}</title>
<script>var secret = "${token}";</script></head>
<body onload="track()"><!-- note ${email} -->
<h1 title="Hello there">Welcome back, ${term}</h1>
<p>Call ${phone} or write ${email}</p>
<a href="https://private.example.test/u/123?x=1" onclick="go()" aria-label="Open my inbox">Inbox</a>
<img src="${dataUri}" alt="portrait of someone" srcset="a.png 1x">
<form action="#"><input type="text" value="hunter22" name="q"><textarea>draft message</textarea></form>
<div class="card keep-me" id="r-main"><span>   </span></div>
<p data-x="${token}">${token}</p></body></html>`;

describe("scrubHtml", () => {
  const { html, counts } = scrubHtml(page, [term]);

  it("removes scripts, handlers, comments and data URIs", () => {
    expect(html).not.toContain("<script");
    expect(html).not.toContain("secret");
    expect(html).not.toMatch(/\bon\w+=/);
    expect(html).not.toContain("<!--");
    expect(html.match(DATA_URI_RE)).toBeNull();
  });

  it("replaces text, attributes, hrefs and values", () => {
    expect(html).not.toContain("Welcome");
    expect(html).not.toContain("Hello there");
    expect(html).not.toContain("inbox");
    expect(html).not.toContain("portrait");
    expect(html).not.toContain("draft message");
    expect(html).not.toContain("hunter22");
    expect(html).not.toContain("private.example");
    expect(html).toContain('href="#"');
    expect(html).not.toContain("srcset");
    expect(html).not.toContain("src=");
  });

  it("removes emails, phones, tokens and local terms", () => {
    expect(html.match(EMAIL_RE)).toBeNull();
    expect(html.match(PHONE_RE)).toBeNull();
    expect(html.match(TOKEN_RE)).toBeNull();
    expect(html.toLowerCase()).not.toContain(term.toLowerCase());
  });

  it("keeps tags, classes, ids and whitespace-only nodes", () => {
    expect(html).toContain('class="card keep-me"');
    expect(html).toContain('id="r-main"');
    expect(html).toContain("<span>   </span>");
    expect(html).toContain("<h1");
  });

  it("keeps text length", () => {
    expect(filler("ab cd")).toBe("xx xx");
    expect(filler("a".repeat(40))).toHaveLength(40);
    expect(filler("a".repeat(40)).match(TOKEN_RE)).toBeNull();
  });

  it("reports counts only", () => {
    expect(counts["script"]).toBe(1);
    expect(counts["comment"]).toBe(1);
    expect(Object.values(counts).every((n) => Number.isInteger(n))).toBe(true);
    const report = formatReport(counts);
    for (const secret of [email, phone, token, term, "hunter22", "Welcome"]) expect(report).not.toContain(secret);
    expect(report).toMatch(/script: 1/);
  });
});
