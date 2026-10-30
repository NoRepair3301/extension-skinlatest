export const IMAGE_KINDS = ["png", "jpeg", "webp", "gif"] as const;
export const VIDEO_KINDS = ["mp4", "webm"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];
export type VideoKind = (typeof VIDEO_KINDS)[number];
export type FileKind = ImageKind | VideoKind;

export const MIME: Record<FileKind, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
};

/** Largest picture side after re-encoding. */
export const MAX_IMAGE_SIDE = 1920;
export const IMAGE_QUALITY = 0.85;
/** Source files above this are refused before any decoding (a memory guard, not the storage cap). */
export const MAX_IMAGE_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAX_GIF_BYTES = 3 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 4 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 15;
export const POSTER_SIDE = 480;
/** Total of everything stored under the `assets` key (base64 characters of files and posters). No unlimitedStorage permission. */
export const TOTAL_CAP_BYTES = 7 * 1024 * 1024;
export const MAX_ASSETS = 24;
export const ASSETS_KEY = "assets";

export interface AssetRecord {
  id: string;
  kind: "image" | "video";
  mime: string;
  /** A short label made from the file name; never the path. */
  name: string;
  w: number;
  h: number;
  /** Video only, seconds. */
  duration?: number;
  /** Base64 of the stored file. */
  data: string;
  /** Base64 of a still picture (JPEG or WebP) of the file; the fallback when the page blocks the file. */
  poster: string;
  posterMime: string;
}

export const PRESETS = ["none", "spin", "float", "orbit", "sway", "slide", "pulse", "drift"] as const;
export type Preset = (typeof PRESETS)[number];
export const PLACEMENTS = ["lane", "corner", "cover"] as const;
export type Placement = (typeof PLACEMENTS)[number];
export const ASSET_SIZES = ["S", "M", "L"] as const;
export type AssetSize = (typeof ASSET_SIZES)[number];
export const ASSET_SPEEDS = ["slow", "normal", "fast"] as const;
export type AssetSpeed = (typeof ASSET_SPEEDS)[number];

/** How a stored asset is shown on a page. `assetId` null means no asset. */
export interface AssetPlacement {
  assetId: string | null;
  mode: Placement;
  size: AssetSize;
  /** 10 to 100. */
  opacity: number;
  speed: AssetSpeed;
  preset: Preset;
}

export const defaultPlacement = (): AssetPlacement => ({ assetId: null, mode: "lane", size: "M", opacity: 100, speed: "normal", preset: "float" });

export const ASSET_ID = /^[a-f0-9]{8}$/;
