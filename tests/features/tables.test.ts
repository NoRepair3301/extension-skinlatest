import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { detectTable, detectTables } from "../../src/features/tables/detect.ts";
import { HIDE_ATTR, TABLE_CSS, createTableTools } from "../../src/features/tables/tools.ts";
import { parseValue, sortedOrder } from "../../src/features/tables/values.ts";

afterEach(() => {
  document.body.replaceChildren();
});

const host = () => {
  const added: string[] = [];
  let live = 0;
  return { added, live: () => live, host: { add: (css: string) => (added.push(css), live++, { remove: () => void live-- }) } };
};

const table = (rows: string[][], head = ["Name", "Value"]) =>
  `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

const col = (t: HTMLTableElement, i: number) => Array.from(t.tBodies[0]!.rows).map((r) => r.cells[i]!.textContent);

describe("detection", () => {
  it("finds the data tables in the table-heavy fixture and skips the tiny one", () => {
    document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/i.exec(readFileSync("fixtures/web/table-heavy.html", "utf8"))![1]!;
    const found = detectTables(document);
    expect(found.map((t) => t.table.className)).toEqual(["stats", "big"]);
    expect(found[1]!.rowCount).toBe(120);
  });
  it("accepts a header row of th without thead", () => {
    document.body.innerHTML = `<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>`;
    expect(detectTables(document)).toHaveLength(1);
  });
  it("skips tables with controls, inside forms, nested, too small or without headers", () => {
    document.body.innerHTML =
      table([["a", "<input>"], ["b", "c"], ["d", "e"]]) +
      `<form>${table([["a", "1"], ["b", "2"], ["c", "3"]])}</form>` +
      table([["a", "1"], ["b", "2"]]).replace("<tbody>", "<tbody><tr><td>x</td><td>y</td></tr>").replace(/<tr><td>b.*?<\/tr>/, "").replace(/<tr><td>x.*?<\/tr>/, "") +
      `<table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>` +
      `<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td><table><tr><td>z</td></tr></table></td><td>1</td></tr><tr><td>1</td><td>2</td></tr></tbody></table>`;
    expect(detectTables(document)).toHaveLength(0);
    expect(detectTable(document.querySelector("table")!)).toBeUndefined();
  });
});

describe("value parsing and stable sort", () => {
  const order = (xs: string[], dir: "asc" | "desc" = "asc") => sortedOrder(xs, dir).map((i) => xs[i]);
  it("sorts numbers with commas", () => expect(order(["1,200", "30", "4.5", "-2"])).toEqual(["-2", "4.5", "30", "1,200"]));
  it("ignores spaces inside numbers and does not eat letters", () => {
    expect(parseValue("$ 1 000").kind).toBe("number");
    expect(parseValue("sss")).toMatchObject({ kind: "text", s: "sss" });
  });
  it("sorts currency", () => expect(order(["$1,000.50", "€20", "£3", "($5.00)"])).toEqual(["($5.00)", "£3", "€20", "$1,000.50"]));
  it("sorts percentages", () => expect(order(["50%", "5%", "100%", "0.5%"])).toEqual(["0.5%", "5%", "50%", "100%"]));
  it("sorts ISO dates", () => expect(order(["2026-03-01", "2025-12-31T10:00:00Z", "2026-01-15"])).toEqual(["2025-12-31T10:00:00Z", "2026-01-15", "2026-03-01"]));
  it("sorts DD/MM/YYYY dates by day, not by text", () => expect(order(["02/01/2026", "15/12/2025", "01/02/2026"])).toEqual(["15/12/2025", "02/01/2026", "01/02/2026"]));
  it("puts empty cells last in both directions", () => {
    expect(order(["3", "", "1", "-", "2"])).toEqual(["1", "2", "3", "", "-"]);
    expect(order(["3", "", "1", "-", "2"], "desc")).toEqual(["3", "2", "1", "", "-"]);
  });
  it("sorts text case-insensitively with natural digits", () => expect(order(["b10", "B2", "a", "A1"])).toEqual(["a", "A1", "B2", "b10"]));
  it("is stable for equal keys", () => {
    const xs = ["2", "1", "2", "1", "2"];
    expect(sortedOrder(xs, "asc")).toEqual([1, 3, 0, 2, 4]);
    expect(sortedOrder(xs, "desc")).toEqual([0, 2, 4, 1, 3]);
  });
  it("rejects impossible dates and treats mixed columns as text", () => {
    expect(parseValue("31/02/2026").kind).toBe("text");
    expect(parseValue("1,2,3").kind).not.toBe("empty");
    expect(order(["10", "9", "n/a"])).toEqual(["9", "10", "n/a"]);
  });
  it("sorts 200 rows quickly", () => {
    const xs = Array.from({ length: 200 }, (_, i) => String(((i * 7919) % 200) + 1));
    const t0 = performance.now();
    sortedOrder(xs, "asc");
    expect(performance.now() - t0).toBeLessThan(100);
  });
});

describe("table tools", () => {
  const rows = [["pear", "30"], ["apple", "1,200"], ["fig", ""], ["kiwi", "4"]];
  const setup = () => {
    document.body.innerHTML = table(rows);
    const t = document.querySelector("table")!;
    const nodes = Array.from(t.tBodies[0]!.rows);
    const h = host();
    const tools = createTableTools(document, h.host);
    return { t, nodes, h, tools };
  };

  it("sorts the same row nodes within their tbody, ascending then descending on header clicks", () => {
    const { t, nodes, tools } = setup();
    expect(tools.enable()).toBe(1);
    const th = t.tHead!.rows[0]!.cells[1]!;
    th.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(col(t, 1)).toEqual(["4", "30", "1,200", ""]);
    expect(th.getAttribute("data-skinly-sort")).toBe("ascending");
    expect(new Set(Array.from(t.tBodies[0]!.rows))).toEqual(new Set(nodes));
    th.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(col(t, 1)).toEqual(["1,200", "30", "4", ""]);
    expect(th.getAttribute("data-skinly-sort")).toBe("descending");
  });

  it("filters case-insensitively with the hide attribute", () => {
    const { t, tools } = setup();
    tools.enable();
    expect(tools.filter(t, "AP")).toBe(1);
    const hidden = Array.from(t.tBodies[0]!.rows).filter((r) => r.hasAttribute(HIDE_ATTR));
    expect(hidden).toHaveLength(3);
    expect(tools.filter(t, "")).toBe(4);
    expect(t.querySelector(`[${HIDE_ATTR}]`)).toBeNull();
  });

  it("Restore order returns the original order", () => {
    const { t, nodes, tools } = setup();
    tools.enable();
    tools.sort(t, 0, "asc");
    expect(col(t, 0)).not.toEqual(rows.map((r) => r[0]));
    tools.restoreOrder(t);
    expect(Array.from(t.tBodies[0]!.rows)).toEqual(nodes);
  });

  it("uses only the two fixed templates and removes everything on restore", () => {
    const { t, h, tools } = setup();
    const before = document.body.innerHTML;
    tools.enable();
    tools.sort(t, 1, "desc");
    tools.filter(t, "p");
    expect(h.added).toEqual([TABLE_CSS]);
    expect(TABLE_CSS).toMatch(/position:sticky/);
    expect(TABLE_CSS).not.toMatch(/url\(|@import|filter|z-index|opacity/);
    tools.restore();
    expect(document.body.innerHTML).toBe(before);
    expect(h.live()).toBe(0);
    t.tHead!.rows[0]!.cells[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.body.innerHTML).toBe(before);
  });

  it("leaves tables with controls and tables inside forms untouched", () => {
    document.body.innerHTML = table([["a", "<input>"], ["b", "c"], ["d", "e"]]) + `<form>${table([["a", "1"], ["b", "2"], ["c", "3"]])}</form>`;
    const before = document.body.innerHTML;
    const tools = createTableTools(document, host().host);
    expect(tools.enable()).toBe(0);
    document.querySelectorAll("th").forEach((th) => th.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(document.body.innerHTML).toBe(before);
  });

  it("sorts a 200-row table quickly", () => {
    document.body.innerHTML = table(Array.from({ length: 200 }, (_, i) => [`n${i}`, String(((i * 7919) % 200) + 1)]));
    const t = document.querySelector("table")!;
    const tools = createTableTools(document, host().host);
    tools.enable();
    const t0 = performance.now();
    tools.sort(t, 1, "asc");
    expect(performance.now() - t0).toBeLessThan(100);
    expect(col(t, 1).slice(0, 3)).toEqual(["1", "2", "3"]);
  });
});
