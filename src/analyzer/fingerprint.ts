import type { Fingerprint, RegionRole } from "../core/types.ts";

export const FINGERPRINT_REGIONS = 40;
export const SIMILAR_THRESHOLD = 0.8;

const CODE: Record<RegionRole, string> = {
  header: "h",
  nav: "n",
  main: "m",
  aside: "a",
  footer: "f",
  section: "s",
  "card-list": "c",
  "link-list": "l",
  table: "t",
  form: "o",
  "button-group": "b",
  heading: "g",
  other: "x",
};

/** 32-bit FNV-1a as 8 hex digits. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function fingerprint(regions: ReadonlyArray<{ role: RegionRole; tag: string }>): Fingerprint {
  const first = regions.slice(0, FINGERPRINT_REGIONS);
  const seq = first.map((r) => CODE[r.role]).join("");
  return { hash: fnv1a(seq + "|" + first.map((r) => r.tag).join(",")), seq };
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** 1 for identical role sequences, 0 for nothing in common. */
export function similarity(a: Fingerprint, b: Fingerprint): number {
  const longest = Math.max(a.seq.length, b.seq.length);
  return longest === 0 ? 1 : 1 - editDistance(a.seq, b.seq) / longest;
}

export const similar = (a: Fingerprint, b: Fingerprint): boolean => similarity(a, b) >= SIMILAR_THRESHOLD;
