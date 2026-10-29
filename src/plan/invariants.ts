/** Things the page's own behaviour depends on. Our changes must never alter them (SPEC 5). */
const WATCHED = ["a[href]", "button", "input", "select", "textarea", "[tabindex]"] as const;

export interface Snapshot {
  lists: Element[][];
  hrefs: string[];
  forms: string[];
}

const ours = (name: string): boolean => name.startsWith("data-skinly-") || name === "data-skinly";

export function snapshot(doc: Document): Snapshot {
  const lists = WATCHED.map((sel) => Array.from(doc.querySelectorAll(sel)));
  const hrefs = lists[0]!.map((a) => a.getAttribute("href") ?? "");
  const forms = Array.from(doc.querySelectorAll("form")).map((f) =>
    Array.from(f.attributes)
      .filter((a) => !ours(a.name))
      .map((a) => `${a.name}=${a.value}`)
      .sort()
      .join("\n"),
  );
  return { lists, hrefs, forms };
}

const sameList = <T>(a: T[], b: T[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** Names of the invariants that no longer hold. Empty means all good. */
export function compare(before: Snapshot, after: Snapshot): string[] {
  const bad: string[] = [];
  WATCHED.forEach((sel, i) => {
    if (!sameList(before.lists[i]!, after.lists[i]!)) bad.push(`${sel} changed`);
  });
  if (!sameList(before.hrefs, after.hrefs)) bad.push("href list changed");
  if (!sameList(before.forms, after.forms)) bad.push("form attributes changed");
  return bad;
}
