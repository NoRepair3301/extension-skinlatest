import { describe, expect, it } from "vitest";
import { compare, snapshot } from "../../src/plan/invariants.ts";
import { dom } from "../analyzer/helpers.ts";

const page = () =>
  dom('<a href="/a">a</a><a href="/b">b</a><button>x</button><form action="/go" method="post"><input name="q"><select><option>1</option></select><textarea></textarea></form><div tabindex="0">t</div>');

describe("invariants", () => {
  it("passes on an untouched document", () => {
    const d = page();
    expect(compare(snapshot(d), snapshot(d))).toEqual([]);
  });
  it("ignores data-skinly-* additions, including on forms", () => {
    const d = page();
    const before = snapshot(d);
    d.documentElement.setAttribute("data-skinly", "on");
    d.querySelector("form")!.setAttribute("data-skinly-r", "r1");
    d.querySelector("a")!.setAttribute("data-skinly-r", "r2");
    expect(compare(before, snapshot(d))).toEqual([]);
  });
  it("detects a removed link", () => {
    const d = page();
    const before = snapshot(d);
    d.querySelector("a")!.remove();
    expect(compare(before, snapshot(d))).toContain("a[href] changed");
  });
  it("detects reordered links", () => {
    const d = page();
    const before = snapshot(d);
    const [first, second] = Array.from(d.querySelectorAll("a"));
    second!.after(first!);
    expect(compare(before, snapshot(d))).toContain("a[href] changed");
  });
  it("detects a changed href", () => {
    const d = page();
    const before = snapshot(d);
    d.querySelector("a")!.setAttribute("href", "/other");
    expect(compare(before, snapshot(d))).toEqual(["href list changed"]);
  });
  it("detects changed form attributes and tabindex elements", () => {
    const d = page();
    const before = snapshot(d);
    d.querySelector("form")!.setAttribute("action", "/elsewhere");
    d.querySelector("[tabindex]")!.remove();
    const bad = compare(before, snapshot(d));
    expect(bad).toContain("form attributes changed");
    expect(bad).toContain("[tabindex] changed");
  });
});
