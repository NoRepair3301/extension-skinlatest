export type Kind = "empty" | "number" | "date" | "text";
export interface Parsed {
  kind: Kind;
  n: number;
  s: string;
}

const NUMBER = /^[-+]?\(?\d[\d,]*(\.\d+)?\)?%?$|^[-+]?\.\d+%?$/;
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;
const DMY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

const utc = (y: number, m: number, d: number): number | undefined => {
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d ? t : undefined;
};

/** Parses one cell's text: numbers with commas, currency symbols and percentages, ISO and DD/MM/YYYY dates. */
export function parseValue(raw: string): Parsed {
  const s = raw.replace(/\s+/g, " ").trim();
  if (s === "" || /^[-–—]+$/.test(s)) return { kind: "empty", n: 0, s: "" };

  const iso = ISO.exec(s);
  if (iso) {
    const t = utc(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (t !== undefined) return { kind: "date", n: t, s };
  }
  const dmy = DMY.exec(s);
  if (dmy) {
    const t = utc(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
    if (t !== undefined) return { kind: "date", n: t, s };
  }

  const stripped = s.replace(/[$€£¥₹]/g, "").replace(/\s/g, "");
  if (NUMBER.test(stripped)) {
    let t = stripped.replace(/,/g, "").replace(/%$/, "");
    let neg = false;
    if (t.startsWith("(") && t.endsWith(")")) {
      neg = true;
      t = t.slice(1, -1);
    }
    const n = Number(t);
    if (Number.isFinite(n)) return { kind: "number", n: neg ? -n : n, s };
  }
  return { kind: "text", n: 0, s };
}

/**
 * Stable order of row indexes for one column. All non-empty cells numbers: numeric; all dates: by time; otherwise text
 * (case-insensitive, natural digits). Empty cells always go last, in either direction.
 */
export function sortedOrder(texts: readonly string[], dir: "asc" | "desc"): number[] {
  const parsed = texts.map(parseValue);
  const filled = parsed.filter((p) => p.kind !== "empty");
  const mode: Kind = filled.length > 0 && filled.every((p) => p.kind === "number") ? "number" : filled.length > 0 && filled.every((p) => p.kind === "date") ? "date" : "text";
  const sign = dir === "asc" ? 1 : -1;
  const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  return parsed
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const ea = a.p.kind === "empty";
      const eb = b.p.kind === "empty";
      if (ea || eb) return ea === eb ? a.i - b.i : ea ? 1 : -1;
      const c = mode === "text" ? collator.compare(a.p.s, b.p.s) : a.p.n - b.p.n;
      return c !== 0 ? sign * c : a.i - b.i;
    })
    .map((x) => x.i);
}
