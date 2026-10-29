export interface DataTable {
  table: HTMLTableElement;
  headerRow: HTMLTableRowElement;
  headers: HTMLTableCellElement[];
  /** Data rows grouped by their own tbody (the header row is excluded). */
  bodies: Array<{ body: HTMLTableSectionElement; rows: HTMLTableRowElement[] }>;
  rowCount: number;
}

const CONTROLS = "input, select, textarea, button, [contenteditable], [role=button], [role=checkbox]";

const cells = (row: HTMLTableRowElement): HTMLTableCellElement[] => Array.from(row.cells);

/**
 * A data table has a header row (in thead, or a first row made of th), at least 3 rows and 2 columns,
 * no form controls, no nested table and no form around it.
 */
export function detectTable(table: HTMLTableElement): DataTable | undefined {
  if (table.closest("form") || table.closest("[data-skinly-ui]")) return undefined;
  if (table.querySelector(`table, ${CONTROLS}`)) return undefined;
  const all = Array.from(table.rows);
  if (all.length < 3) return undefined;

  const thead = table.tHead;
  let headerRow: HTMLTableRowElement | undefined;
  if (thead && thead.rows.length > 0) headerRow = thead.rows[thead.rows.length - 1];
  else if (all[0] && cells(all[0]).length > 0 && cells(all[0]).every((c) => c.localName === "th")) headerRow = all[0];
  if (!headerRow) return undefined;
  const headers = cells(headerRow);
  if (headers.length < 2) return undefined;

  const bodies: DataTable["bodies"] = [];
  let rowCount = 0;
  for (const body of Array.from(table.tBodies)) {
    const rows = Array.from(body.rows).filter((r) => r !== headerRow);
    if (rows.length > 0) {
      bodies.push({ body, rows });
      rowCount += rows.length;
    }
  }
  if (rowCount < 2) return undefined;
  return { table, headerRow, headers, bodies, rowCount };
}

export const detectTables = (doc: Document): DataTable[] =>
  Array.from(doc.querySelectorAll("table"))
    .map((t) => detectTable(t))
    .filter((t): t is DataTable => t !== undefined);
