import type { AssetEnv } from "./render.ts";
import type { DecodedImage, MediaDeps, ProbedVideo } from "./prepare.ts";

const toBytes = async (blob: Blob | null): Promise<Uint8Array | undefined> => (blob ? new Uint8Array(await blob.arrayBuffer()) : undefined);

const blobOf = (bytes: Uint8Array, mime: string): Blob => new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: mime });

function drawToCanvas(doc: Document, source: CanvasImageSource, sw: number, sh: number, side: number): HTMLCanvasElement {
  const scale = Math.min(1, side / Math.max(sw, sh));
  const c = doc.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * scale));
  c.height = Math.max(1, Math.round(sh * scale));
  c.getContext("2d")!.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

const encodeCanvas = (c: HTMLCanvasElement, type: string, quality: number): Promise<Uint8Array | undefined> =>
  new Promise((resolve) => c.toBlob((b) => void toBytes(b).then(resolve), type, quality));

/** Media work for the options page: decode with createImageBitmap, re-draw on a canvas (this drops all metadata), read a video's length and first frame. */
export function browserMediaDeps(doc: Document): MediaDeps {
  return {
    async decodeImage(bytes, mime): Promise<DecodedImage | undefined> {
      const bmp = await createImageBitmap(blobOf(bytes, mime));
      return {
        w: bmp.width,
        h: bmp.height,
        encode: (side, type, quality) => encodeCanvas(drawToCanvas(doc, bmp, bmp.width, bmp.height, side), type, quality),
      };
    },
    async probeVideo(bytes, mime): Promise<ProbedVideo | undefined> {
      const url = URL.createObjectURL(blobOf(bytes, mime));
      try {
        const v = doc.createElement("video");
        v.muted = true;
        v.preload = "auto";
        v.src = url;
        await new Promise<void>((resolve, reject) => {
          v.addEventListener("loadeddata", () => resolve(), { once: true });
          v.addEventListener("error", () => reject(new Error("video")), { once: true });
        });
        const info = { w: v.videoWidth, h: v.videoHeight, duration: v.duration };
        if (!Number.isFinite(info.duration)) return undefined;
        const frame = await new Promise<HTMLCanvasElement | undefined>((resolve) => {
          const done = () => resolve(v.videoWidth > 0 ? drawToCanvas(doc, v, v.videoWidth, v.videoHeight, 480) : undefined);
          v.addEventListener("seeked", done, { once: true });
          v.currentTime = Math.min(0.1, info.duration / 2);
          setTimeout(done, 1500);
        });
        const still = frame ? await encodeCanvas(frame, "image/jpeg", 0.8) : undefined;
        return { ...info, poster: async () => still };
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    newId() {
      const a = new Uint8Array(4);
      crypto.getRandomValues(a);
      return Array.from(a, (x) => x.toString(16).padStart(2, "0")).join("");
    },
  };
}

/** Environment for the page-side renderer. */
export function browserAssetEnv(win: Window): AssetEnv {
  return {
    doc: win.document,
    win,
    createObjectURL: (b) => URL.createObjectURL(b),
    revokeObjectURL: (u) => URL.revokeObjectURL(u),
    async decodePoster(bytes, mime) {
      const bmp = await createImageBitmap(blobOf(bytes, mime));
      return { w: bmp.width, h: bmp.height, draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h) };
    },
  };
}
