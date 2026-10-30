import type { FileKind } from "./types.ts";

export type Sniffed = { ok: true; kind: FileKind } | { ok: false; reason: "svg" | "unknown" | "empty" };

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0): boolean => sig.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, at: number, text: string): boolean => [...text].every((c, i) => b[at + i] === c.charCodeAt(0));

/**
 * File type from the first bytes, never from the extension or a declared type.
 * SVG (and any text that looks like markup) is refused on purpose: it can carry script and links.
 */
export function sniff(bytes: Uint8Array): Sniffed {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ok: true, kind: "png" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { ok: true, kind: "jpeg" };
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return { ok: true, kind: "webp" };
  if (ascii(bytes, 0, "GIF87a") || ascii(bytes, 0, "GIF89a")) return { ok: true, kind: "gif" };
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return { ok: true, kind: "webm" };
  if (bytes.length >= 12 && ascii(bytes, 4, "ftyp")) return { ok: true, kind: "mp4" };
  const head = new TextDecoder().decode(bytes.subarray(0, 512)).replace(/^﻿/, "").trimStart().toLowerCase();
  if (head.startsWith("<svg") || head.startsWith("<?xml") || head.startsWith("<!doctype svg") || (head.startsWith("<") && head.includes("<svg"))) return { ok: false, reason: "svg" };
  return { ok: false, reason: "unknown" };
}

/**
 * Rewrites a GIF keeping only what is needed to show it (header, palettes, graphic control, the loop count, frames).
 * Comments, plain-text blocks and other application blocks (where tools hide metadata) are dropped. Returns undefined for a broken file.
 */
export function stripGif(src: Uint8Array): Uint8Array | undefined {
  if (!(ascii(src, 0, "GIF87a") || ascii(src, 0, "GIF89a")) || src.length < 14) return undefined;
  const out: number[] = [];
  const push = (from: number, to: number) => {
    for (let i = from; i < to; i++) out.push(src[i]!);
  };
  const flags = src[10]!;
  const gct = flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0;
  let p = 13 + gct;
  if (p > src.length) return undefined;
  push(0, p);
  const skipSubBlocks = (from: number): number => {
    let q = from;
    while (q < src.length && src[q] !== 0) q += src[q]! + 1;
    return q + 1;
  };
  while (p < src.length) {
    const b = src[p]!;
    if (b === 0x3b) {
      out.push(0x3b);
      return new Uint8Array(out);
    }
    if (b === 0x21) {
      const label = src[p + 1];
      const end = skipSubBlocks(p + 2);
      if (end > src.length) return undefined;
      const keep = label === 0xf9 || (label === 0xff && src[p + 2] === 11 && ascii(src, p + 3, "NETSCAPE2.0"));
      if (keep) push(p, end);
      p = end;
    } else if (b === 0x2c) {
      if (p + 10 > src.length) return undefined;
      const f = src[p + 9]!;
      const lct = f & 0x80 ? 3 * 2 ** ((f & 7) + 1) : 0;
      const dataStart = p + 10 + lct + 1;
      const end = skipSubBlocks(dataStart);
      if (end > src.length) return undefined;
      push(p, end);
      p = end;
    } else return undefined;
  }
  return undefined;
}
