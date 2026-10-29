import { detectTables, type DataTable } from "./detect.ts";
import { sortedOrder } from "./values.ts";

export const TABLE_ATTR = "data-skinly-table";
export const SORT_ATTR = "data-skinly-sort";
export const HIDE_ATTR = "data-skinly-hide";
/** Sticky header template and the filter's hide template; nothing else is generated. */
export const TABLE_CSS =
  `[${TABLE_ATTR}="1"] thead th,[${TABLE_ATTR}="1"] tr:first-child th{position:sticky;top:0;background-color:Canvas}` + `[${HIDE_ATTR}="1"]{display:none!important}`;

export interface StyleSheetHost {
  add(css: string): { remove(): void };
}

export interface TableTools {
  tables(): DataTable[];
  /** Starts the tools: sticky headers and click-to-sort on the headers of every detected table. */
  enable(): number;
  sort(table: HTMLTableElement, column: number, dir: "asc" | "desc"): boolean;
  filter(table: HTMLTableElement, query: string): number;
  restoreOrder(table: HTMLTableElement): void;
  /** Everything back as it was: order, hidden rows, attributes, listeners and the stylesheet. */
  restore(): void;
}

interface Saved {
  model: DataTable;
  order: Array<{ body: HTMLTableSectionElement; rows: HTMLTableRowElement[] }>;
}

export function createTableTools(doc: Document, style: StyleSheetHost): TableTools {
  const saved = new Map<HTMLTableElement, Saved>();
  const hidden = new Set<HTMLTableRowElement>();
  const listeners: Array<() => void> = [];
  let sheet: { remove(): void } | undefined;
  const sortState = new Map<HTMLTableElement, { column: number; dir: "asc" | "desc" }>();

  const clearSortMarks = (t: DataTable) => t.headers.forEach((h) => h.removeAttribute(SORT_ATTR));

  const sort: TableTools["sort"] = (table, column, dir) => {
    const s = saved.get(table);
    if (!s || column < 0 || column >= s.model.headers.length) return false;
    for (const { body, rows } of s.model.bodies) {
      const texts = rows.map((r) => r.cells[column]?.textContent ?? "");
      const order = sortedOrder(texts, dir);
      // Same row nodes, moved inside their own tbody only.
      for (const i of order) body.append(rows[i]!);
    }
    clearSortMarks(s.model);
    s.model.headers[column]!.setAttribute(SORT_ATTR, dir === "asc" ? "ascending" : "descending");
    sortState.set(table, { column, dir });
    return true;
  };

  const restoreOrder: TableTools["restoreOrder"] = (table) => {
    const s = saved.get(table);
    if (!s) return;
    for (const { body, rows } of s.order) for (const r of rows) body.append(r);
    clearSortMarks(s.model);
    sortState.delete(table);
  };

  const filter: TableTools["filter"] = (table, query) => {
    const s = saved.get(table);
    if (!s) return 0;
    const q = query.trim().toLowerCase();
    let shown = 0;
    for (const { rows } of s.model.bodies) {
      for (const r of rows) {
        const match = q === "" || (r.textContent ?? "").toLowerCase().includes(q);
        if (match) {
          r.removeAttribute(HIDE_ATTR);
          hidden.delete(r);
          shown++;
        } else {
          r.setAttribute(HIDE_ATTR, "1");
          hidden.add(r);
        }
      }
    }
    return shown;
  };

  return {
    tables: () => Array.from(saved.values()).map((s) => s.model),
    enable() {
      const found = detectTables(doc).filter((t) => !saved.has(t.table));
      if (found.length > 0) sheet ??= style.add(TABLE_CSS);
      for (const model of found) {
        saved.set(model.table, { model, order: model.bodies.map((b) => ({ body: b.body, rows: [...b.rows] })) });
        model.table.setAttribute(TABLE_ATTR, "1");
        model.headers.forEach((h, column) => {
          const onClick = () => {
            const cur = sortState.get(model.table);
            sort(model.table, column, cur && cur.column === column && cur.dir === "asc" ? "desc" : "asc");
          };
          h.addEventListener("click", onClick);
          listeners.push(() => h.removeEventListener("click", onClick));
        });
      }
      return saved.size;
    },
    sort,
    filter,
    restoreOrder,
    restore() {
      for (const [table, s] of saved) {
        restoreOrder(table);
        table.removeAttribute(TABLE_ATTR);
        clearSortMarks(s.model);
      }
      for (const r of hidden) r.removeAttribute(HIDE_ATTR);
      hidden.clear();
      for (const off of listeners) off();
      listeners.length = 0;
      sheet?.remove();
      sheet = undefined;
      saved.clear();
      sortState.clear();
    },
  };
}
