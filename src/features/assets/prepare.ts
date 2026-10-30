import { addAsset, freeBytes, labelFor, toBase64 } from "./store.ts";
import { sniff, stripGif } from "./sniff.ts";
import {
  IMAGE_QUALITY,
  MAX_GIF_BYTES,
  MAX_IMAGE_SIDE,
  MAX_IMAGE_SOURCE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  MIME,
  POSTER_SIDE,
  type AssetRecord,
} from "./types.ts";

/** What the browser has to supply: decoding and canvas work. Injected so the rules below are testable without a browser. */
export interface MediaDeps {
  decodeImage(bytes: Uint8Array, mime: string): Promise<DecodedImage | undefined>;
  probeVideo(bytes: Uint8Array, mime: string): Promise<ProbedVideo | undefined>;
  /** Eight lowercase hex characters, random. */
  newId(): string;
}

export interface DecodedImage {
  w: number;
  h: number;
  /** Re-draws the picture on a canvas no larger than `side` and encodes it. Returns undefined when the browser cannot. */
  encode(side: number, type: "image/webp" | "image/jpeg", quality: number): Promise<Uint8Array | undefined>;
}

export interface ProbedVideo {
  w: number;
  h: number;
  duration: number;
  poster(side: number): Promise<Uint8Array | undefined>;
}

export interface UploadFile {
  name: string;
  size: number;
  bytes(): Promise<Uint8Array>;
}

export type PrepareError = "empty" | "svg" | "type" | "too-big" | "gif-big" | "video-big" | "video-long" | "broken" | "full" | "count";

/** Plain words for the user. Fixed text; nothing from the file is repeated except nothing at all. */
export const PREPARE_MESSAGES: Record<PrepareError, string> = {
  empty: "That file is empty.",
  svg: "SVG files are not accepted because they can carry scripts. Use PNG, JPG, WebP, GIF, MP4 or WebM.",
  type: "That file type is not supported. Use PNG, JPG, WebP, GIF, MP4 or WebM.",
  "too-big": "That file is too large (over 25 MB).",
  "gif-big": "That GIF is larger than 3 MB.",
  "video-big": "That video is larger than 4 MB.",
  "video-long": "That video is longer than 15 seconds.",
  broken: "Skinly could not read that file.",
  full: "There is not enough free space left. Delete something first.",
  count: "You have too many saved files. Delete one first.",
};

export type Prepared = { ok: true; record: AssetRecord; list: AssetRecord[] } | { ok: false; error: PrepareError; message: string };

const fail = (error: PrepareError): Prepared => ({ ok: false, error, message: PREPARE_MESSAGES[error] });

/**
 * Checks, cleans and sizes an uploaded file and returns the record to store, or a plain-words refusal.
 * The type comes from the magic bytes. Pictures are re-drawn on a canvas (at most 1920 px, WebP or JPEG at 0.85), which drops all
 * metadata. A GIF keeps its animation: only its comment and extension blocks are removed. Videos are not re-encoded.
 */
export async function prepareAsset(file: UploadFile, existing: readonly AssetRecord[], deps: MediaDeps): Promise<Prepared> {
  if (file.size === 0) return fail("empty");
  if (file.size > MAX_IMAGE_SOURCE_BYTES) return fail("too-big");
  let bytes: Uint8Array;
  try {
    bytes = await file.bytes();
  } catch {
    return fail("broken");
  }
  const s = sniff(bytes);
  if (!s.ok) return fail(s.reason === "svg" ? "svg" : s.reason === "empty" ? "empty" : "type");
  const name = labelFor(file.name);
  const id = deps.newId();

  let record: AssetRecord;
  if (s.kind === "mp4" || s.kind === "webm") {
    if (bytes.length > MAX_VIDEO_BYTES) return fail("video-big");
    const video = await deps.probeVideo(bytes, MIME[s.kind]).catch(() => undefined);
    if (!video || !(video.duration > 0) || !(video.w >= 1) || !(video.h >= 1)) return fail("broken");
    if (video.duration > MAX_VIDEO_SECONDS) return fail("video-long");
    const poster = await video.poster(POSTER_SIDE).catch(() => undefined);
    if (!poster || !sniff(poster).ok) return fail("broken");
    record = { id, kind: "video", mime: MIME[s.kind], name, w: Math.round(video.w), h: Math.round(video.h), duration: Math.round(video.duration * 10) / 10, data: toBase64(bytes), poster: toBase64(poster), posterMime: posterMime(poster) };
  } else {
    let body = bytes;
    if (s.kind === "gif") {
      if (bytes.length > MAX_GIF_BYTES) return fail("gif-big");
      const clean = stripGif(bytes);
      if (!clean) return fail("broken");
      body = clean;
    }
    const img = await deps.decodeImage(body, MIME[s.kind]).catch(() => undefined);
    if (!img || !(img.w >= 1) || !(img.h >= 1)) return fail("broken");
    let stored = body;
    let mime: string = MIME[s.kind];
    let w = img.w;
    let h = img.h;
    if (s.kind !== "gif") {
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.w, img.h));
      w = Math.max(1, Math.round(img.w * scale));
      h = Math.max(1, Math.round(img.h * scale));
      const webp = await img.encode(MAX_IMAGE_SIDE, "image/webp", IMAGE_QUALITY).catch(() => undefined);
      const out = webp ?? (await img.encode(MAX_IMAGE_SIDE, "image/jpeg", IMAGE_QUALITY).catch(() => undefined));
      const check = out ? sniff(out) : undefined;
      if (!out || !check?.ok || (check.kind !== "webp" && check.kind !== "jpeg")) return fail("broken");
      stored = out;
      mime = MIME[check.kind];
    }
    const poster = await img.encode(POSTER_SIDE, "image/jpeg", 0.8).catch(() => undefined);
    if (!poster || !sniff(poster).ok) return fail("broken");
    record = { id, kind: "image", mime, name, w, h, data: toBase64(stored), poster: toBase64(poster), posterMime: posterMime(poster) };
  }

  const added = addAsset(existing, record);
  if (!added.ok) return fail(added.reason === "count" ? "count" : added.reason === "full" ? "full" : "broken");
  return { ok: true, record, list: added.list };
}

function posterMime(bytes: Uint8Array): string {
  const s = sniff(bytes);
  return s.ok && s.kind === "webp" ? "image/webp" : "image/jpeg";
}

/** "3.2 MB" style text for the free-space line. */
export const megabytes = (n: number): string => `${(n / (1024 * 1024)).toFixed(1)} MB`;

export const freeText = (list: readonly AssetRecord[]): string => `${megabytes(freeBytes(list))} free`;
