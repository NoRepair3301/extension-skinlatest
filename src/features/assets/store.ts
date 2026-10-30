import { sniff } from "./sniff.ts";
import { ASSET_ID, MAX_ASSETS, MIME, TOTAL_CAP_BYTES, type AssetRecord } from "./types.ts";

const CHUNK = 0x8000;

/** Bytes to base64 (chunked so a big file does not overflow the call stack). */
export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

/** Base64 to bytes; undefined when it is not valid base64. */
export function fromBase64(text: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) return undefined;
  try {
    const bin = atob(text);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return undefined;
  }
}

/** Stored size of one record: the base64 characters of the file and the poster. */
export const recordBytes = (r: AssetRecord): number => r.data.length + r.poster.length;
export const totalBytes = (list: readonly AssetRecord[]): number => list.reduce((n, r) => n + recordBytes(r), 0);
export const freeBytes = (list: readonly AssetRecord[], cap = TOTAL_CAP_BYTES): number => Math.max(0, cap - totalBytes(list));

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const dim = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 20000;
const POSTER_MIME = new Set(["image/jpeg", "image/webp"]);

/**
 * One stored record, checked again on every read: shape, id, label, sizes, and the magic bytes of the file and the poster
 * must match what the record says. Anything else is dropped (undefined).
 */
export function parseAsset(input: unknown): AssetRecord | undefined {
  if (!isObj(input)) return undefined;
  const { id, kind, mime, name, w, h, duration, data, poster, posterMime } = input;
  if (typeof id !== "string" || !ASSET_ID.test(id)) return undefined;
  if (kind !== "image" && kind !== "video") return undefined;
  if (typeof name !== "string" || name.length === 0 || name.length > 60) return undefined;
  if (!dim(w) || !dim(h)) return undefined;
  if (typeof data !== "string" || typeof poster !== "string" || typeof mime !== "string" || typeof posterMime !== "string") return undefined;
  if (!POSTER_MIME.has(posterMime)) return undefined;
  const bytes = fromBase64(data);
  const still = fromBase64(poster);
  if (!bytes || !still) return undefined;
  const s = sniff(bytes);
  if (!s.ok || MIME[s.kind] !== mime || (kind === "image") !== mime.startsWith("image/")) return undefined;
  const p = sniff(still);
  if (!p.ok || MIME[p.kind] !== posterMime) return undefined;
  if (kind === "video") {
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0 || duration > 3600) return undefined;
    return { id, kind, mime, name, w, h, duration, data, poster, posterMime };
  }
  return { id, kind, mime, name, w, h, data, poster, posterMime };
}

/** The valid records of a stored list, in order, without duplicates, within the count and total caps. */
export function parseAssets(raw: unknown): AssetRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: AssetRecord[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const item of raw) {
    if (out.length >= MAX_ASSETS) break;
    const rec = parseAsset(item);
    if (!rec || seen.has(rec.id)) continue;
    const size = recordBytes(rec);
    if (total + size > TOTAL_CAP_BYTES) continue;
    seen.add(rec.id);
    total += size;
    out.push(rec);
  }
  return out;
}

export type AddResult = { ok: true; list: AssetRecord[] } | { ok: false; reason: "full" | "count" | "invalid" };

/** Adds a record when it fits both caps. Pure. */
export function addAsset(list: readonly AssetRecord[], rec: AssetRecord, cap = TOTAL_CAP_BYTES): AddResult {
  if (!parseAsset(rec)) return { ok: false, reason: "invalid" };
  if (list.length >= MAX_ASSETS) return { ok: false, reason: "count" };
  if (recordBytes(rec) > freeBytes(list, cap)) return { ok: false, reason: "full" };
  return { ok: true, list: [...list.filter((r) => r.id !== rec.id), rec] };
}

export const removeAsset = (list: readonly AssetRecord[], id: string): AssetRecord[] => list.filter((r) => r.id !== id);

/** A short label from a file name: no path, no extension, only plain characters. */
export function labelFor(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base).replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 40);
  return stem.length > 0 ? stem : "My file";
}
