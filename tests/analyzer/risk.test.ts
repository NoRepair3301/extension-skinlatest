import { describe, expect, it } from "vitest";
import { detectRisk } from "../../src/analyzer/risk.ts";
import { scan } from "../../src/analyzer/regions.ts";
import { dom, items } from "./helpers.ts";

const risk = (body: string) => detectRisk(scan(dom(body)));

describe("detectRisk", () => {
  it("is empty for a plain page", () => {
    expect(risk("<p>hi</p><input type='text'>")).toEqual([]);
  });
  it("flags password, file and payment inputs", () => {
    expect(risk("<input type='password'>")).toEqual(["password"]);
    expect(risk("<input type='FILE'>")).toEqual(["file"]);
    expect(risk("<input autocomplete='cc-number'>")).toEqual(["payment"]);
    expect(risk("<input autocomplete='section-a cc-exp'>")).toEqual(["payment"]);
    expect(risk("<input autocomplete='name'>")).toEqual([]);
  });
  it("flags contenteditable and large textareas", () => {
    expect(risk("<div contenteditable>x</div>")).toEqual(["editable"]);
    expect(risk("<div contenteditable='true'>x</div>")).toEqual(["editable"]);
    expect(risk("<div contenteditable='false'>x</div>")).toEqual([]);
    expect(risk("<textarea rows='8'></textarea>")).toEqual(["editable"]);
    expect(risk("<textarea rows='2'></textarea>")).toEqual([]);
  });
  it("flags big tables at 20 rows", () => {
    const rows = (n: number) => `<table>${items(n, () => "<tr><td>a</td></tr>")}</table>`;
    expect(risk(rows(20))).toEqual(["big-table"]);
    expect(risk(rows(19))).toEqual([]);
  });
  it("flags three or more iframes", () => {
    expect(risk(items(2, () => "<iframe></iframe>"))).toEqual([]);
    expect(risk(items(3, () => "<iframe></iframe>"))).toEqual(["iframes"]);
  });
  it("flags open shadow roots by count only", () => {
    const d = dom("<div id='h'></div>");
    d.getElementById("h")!.attachShadow({ mode: "open" });
    expect(detectRisk(scan(d))).toEqual(["shadow"]);
  });
  it("returns markers in a fixed order", () => {
    expect(risk("<div contenteditable>x</div><input type='password'>")).toEqual(["password", "editable"]);
  });
});
