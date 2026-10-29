import type { PaletteItem } from "./index-items.ts";

/** Higher is better; undefined means no match. Exact beats prefix beats substring beats subsequence. */
export function score(query: string, label: string): number | undefined {
  const q = query.toLowerCase().trim();
  const l = label.toLowerCase();
  if (q === "") return 0;
  if (l === q) return 4000;
  if (l.startsWith(q)) return 3000 - l.length;
  const at = l.indexOf(q);
  if (at >= 0) return 2000 - at;
  let pos = -1;
  let gaps = 0;
  for (const ch of q) {
    const next = l.indexOf(ch, pos + 1);
    if (next < 0) return undefined;
    if (pos >= 0) gaps += next - pos - 1;
    pos = next;
  }
  return 1000 - gaps - pos;
}

/** Matching items, best first; equal scores keep their original order. */
export function rank(query: string, items: readonly PaletteItem[]): PaletteItem[] {
  return items
    .map((item, i) => ({ item, i, s: score(query, item.label) }))
    .filter((r): r is { item: PaletteItem; i: number; s: number } => r.s !== undefined)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((r) => r.item);
}
