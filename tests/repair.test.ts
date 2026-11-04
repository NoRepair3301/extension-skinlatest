import { describe, expect, it } from "vitest";
import { buildRepairPayload, classTokens, colourDeclarations, REPAIR_MAX_BYTES, REPAIR_MAX_ELEMENTS, sanitizeDeclaration } from "../src/features/repair/payload.ts";
import { compileRepair, validateRepair, pathOf, type RuleBook } from "../src/plan/readability.ts";
import { contrastRatio } from "../src/plan/contrast.ts";
import { dom } from "./analyzer/helpers.ts";

describe("repair payload sanitiser", () => {
  it("keeps only class tokens in the allowed shape, at most three", () => {
    const d = dom('<p id="secret-id" class="Card ok-one 1bad a x_y-z toolongtoolongtoolongtoolongtoolong123 four five">TOP SECRET TEXT</p>');
    expect(classTokens(d.querySelector("p")!)).toEqual(["Card", "ok-one", "x_y-z"]);
  });

  it.each([
    ["color", "#112233", "color: #112233"],
    ["background-color", "rgb(1, 2, 3)", "background-color: rgb(1, 2, 3)"],
    ["background", "linear-gradient(red, blue)", "background: linear-gradient(red, blue)"],
    ["--brand", "#abc", "--brand: #abc"],
  ])("keeps %s: %s", (p, v, out) => expect(sanitizeDeclaration(p, v)).toBe(out));

  it.each([
    ["background", "url(https://x.example/a.png) no-repeat"],
    ["background", "url('a.png')"],
    ["color", "attr(data-x)"],
    ["fill", "var(--a) content"],
    ["background-color", "@import x"],
    ["color", 'red"'],
    ["background-image", "none"],
    ["--x", "data:image/png;base64,AAAA"],
    ["--x", "url(a)"],
    ["margin", "0"],
    ["color", "x".repeat(200)],
  ])("drops %s: %s", (p, v) => expect(sanitizeDeclaration(p, v)).toBeNull());

  it("reads same-origin stylesheet declarations and survives a sheet it cannot read", () => {
    const d = dom('<p class="note">x</p>', '<style>.note { color: #123456; background: url(secret.png); margin: 0 } p { background-color: #ffffff } [data-x="1"] { color: red }</style>');
    const out = colourDeclarations(d, d.querySelector("p")!);
    expect(out).toContain("color: rgb(18, 52, 86)");
    expect(out).toContain("background-color: rgb(255, 255, 255)");
    expect(out.every((x) => !x.includes("margin"))).toBe(true);
    expect(out.join()).not.toContain("url");
    const bad = { styleSheets: [{ get cssRules(): never { throw new Error("cross-origin"); } }] } as unknown as Document;
    expect(colourDeclarations(bad, d.querySelector("p")!)).toEqual([]);
  });

  it("builds a payload with no text, href, id, value, URL, origin or title, within the caps", () => {
    const d = dom(
      '<a id="user-42" class="link big" href="https://secret.example/path?token=abc">PRIVATE LINK TEXT</a><input value="PASSWORD123" class="field"><p>' + "word ".repeat(50) + "</p>",
      "<title>SECRET TITLE</title><style>.link { color: #ffffff; background: url(https://secret.example/x.png) }</style>",
    );
    const failures = Array.from(d.querySelectorAll("a, input, p")).map((el) => ({ el, fg: "#ffffff", bg: "#fefefe", ratio: 1.02, paint: { color: "#000000" } }));
    const { payload, targets } = buildRepairPayload(d, failures);
    const json = JSON.stringify(payload);
    for (const marker of ["PRIVATE LINK TEXT", "secret.example", "token=abc", "user-42", "PASSWORD123", "SECRET TITLE", "href", "word word", "http", "example.org"]) expect(json).not.toContain(marker);
    expect(Object.keys(payload).sort()).toEqual(["elements", "v"]);
    expect(Object.keys(payload.elements[0]!).sort()).toEqual(["bg", "classes", "css", "fg", "i", "ratio", "role", "tag"]);
    expect(targets).toHaveLength(payload.elements.length);
    expect(json.length).toBeLessThanOrEqual(REPAIR_MAX_BYTES);
  });

  it("caps at 40 elements and 6 KB", () => {
    const body = Array.from({ length: 80 }, (_, i) => `<p class="c${i}">t</p>`).join("");
    const d = dom(body, `<style>${Array.from({ length: 80 }, (_, i) => `.c${i}{color:#${(100000 + i).toString(16).padStart(6, "0")};background-color:#ffffff;border-color:#000000}`).join("")}</style>`);
    const failures = Array.from(d.querySelectorAll("p")).map((el) => ({ el, fg: "#ffffff", bg: "#ffffff", ratio: 1, paint: {} }));
    const { payload } = buildRepairPayload(d, failures);
    expect(payload.elements.length).toBeLessThanOrEqual(REPAIR_MAX_ELEMENTS);
    expect(JSON.stringify(payload).length).toBeLessThanOrEqual(REPAIR_MAX_BYTES);
    const tight = dom(Array.from({ length: 40 }, (_, i) => `<p class="${"a".repeat(25)}${i % 10}">t</p>`).join(""));
    const { payload: p2 } = buildRepairPayload(tight, Array.from(tight.querySelectorAll("p")).map((el) => ({ el, fg: "#ffffff", bg: "#ffffff", ratio: 1, paint: {} })));
    expect(JSON.stringify(p2).length).toBeLessThanOrEqual(REPAIR_MAX_BYTES);
  });
});

describe("RepairPlan validation", () => {
  const bgs = ["#ffffff", "#101010"];
  it("accepts indices and hex, repairs a colour under 4.5, rejects the rest", () => {
    const ok = validateRepair({ v: 1, fixes: [{ i: 0, color: "#EEEEEE" }, { i: 1, color: "#ffffff" }] }, bgs);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(contrastRatio(ok.plan.fixes[0]!.color, "#ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(ok.plan.fixes[1]!.color).toBe("#ffffff");
    }
    for (const bad of [null, { v: 2, fixes: [] }, { v: 1, fixes: [{ i: 5, color: "#ffffff" }] }, { v: 1, fixes: [{ i: 0, color: "red" }] }, { v: 1, fixes: [{ i: 0, color: "#ffffff", css: "x" }] }, { v: 1, fixes: [{ i: 0, color: "#000000" }, { i: 0, color: "#111111" }] }, { v: 1, fixes: [], extra: 1 }]) {
      expect(validateRepair(bad, bgs).ok).toBe(false);
    }
  });
  it("compiles by index to structural rules only", () => {
    const d = dom("<main><p>a</p><p>b</p></main>");
    const v = validateRepair({ v: 1, fixes: [{ i: 1, color: "#000000", bg: "#ffffff" }] }, ["#ffffff", "#ffffff"]);
    if (!v.ok) throw new Error("invalid");
    const book: RuleBook = new Map();
    expect(compileRepair(v.plan, Array.from(d.querySelectorAll("p")), book)).toBe(1);
    expect([...book.keys()][0]).toBe(pathOf(d.querySelectorAll("p")[1]!));
    expect([...book.values()][0]).toEqual({ color: "#000000", bg: "#ffffff" });
  });
});
