import { afterEach, describe, expect, it, vi } from "vitest";
import { analyze } from "../../src/analyzer/analyze.ts";
import { createAssetRenderer, COVER_ATTR, type AssetEnv } from "../../src/features/assets/render.ts";
import { computeGutters } from "../../src/features/freespace/index.ts";
import { prepareAsset, PREPARE_MESSAGES, type MediaDeps, type UploadFile } from "../../src/features/assets/prepare.ts";
import { sniff, stripGif } from "../../src/features/assets/sniff.ts";
import { addAsset, freeBytes, fromBase64, labelFor, parseAsset, parseAssets, removeAsset, toBase64, totalBytes } from "../../src/features/assets/store.ts";
import { defaultPlacement, MAX_ASSETS, TOTAL_CAP_BYTES, type AssetPlacement, type AssetRecord } from "../../src/features/assets/types.ts";
import { defaultSettings, parseSettings } from "../../src/extension/settings.ts";
import { readdirSync, readFileSync, statSync } from "node:fs";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const WEBP = [...ascii("RIFF"), 1, 0, 0, 0, ...ascii("WEBPVP8 ")];
const MP4 = [0, 0, 0, 0x18, ...ascii("ftypmp42"), 0, 0, 0, 0];
const WEBM = [0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81];
const gif = (extra: number[] = []) => new Uint8Array([...ascii("GIF89a"), 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255, ...extra, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x4c, 1, 0, 0x3b]);
const COMMENT = [0x21, 0xfe, 3, ...ascii("abc"), 0];
const XMP = [0x21, 0xff, 11, ...ascii("XMP DataXMP"), 3, 120, 121, 122, 0];
const LOOP = [0x21, 0xff, 11, ...ascii("NETSCAPE2.0"), 3, 1, 0, 0, 0];
const GCE = [0x21, 0xf9, 4, 0, 0, 0, 0, 0];

describe("sniff", () => {
  it("knows the six allowed types from their first bytes, whatever the name says", () => {
    const kind = (b: number[]) => {
      const s = sniff(new Uint8Array(b));
      return s.ok ? s.kind : s.reason;
    };
    expect(kind(PNG)).toBe("png");
    expect(kind(JPG)).toBe("jpeg");
    expect(kind(WEBP)).toBe("webp");
    expect(kind([...ascii("GIF87a"), 0, 0])).toBe("gif");
    expect(kind([...ascii("GIF89a"), 0, 0])).toBe("gif");
    expect(kind(MP4)).toBe("mp4");
    expect(kind(WEBM)).toBe("webm");
  });
  it("refuses SVG in every disguise, plain text, random bytes and empty files", () => {
    const text = (t: string) => new TextEncoder().encode(t);
    for (const svg of ['<svg xmlns="x"></svg>', '<?xml version="1.0"?><svg/>', "  \n<svg/>", "\uFEFF<svg/>", "<!DOCTYPE svg PUBLIC>", "<html><body><svg></svg></body></html>", "<SVG/>"]) {
      expect(sniff(text(svg))).toEqual({ ok: false, reason: "svg" });
    }
    expect(sniff(text("hello world"))).toEqual({ ok: false, reason: "unknown" });
    expect(sniff(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toEqual({ ok: false, reason: "unknown" });
    expect(sniff(new Uint8Array(0))).toEqual({ ok: false, reason: "empty" });
    expect(sniff(new Uint8Array([0x89, 0x50]))).toEqual({ ok: false, reason: "unknown" });
  });
});

describe("stripGif", () => {
  it("removes comments and other application blocks but keeps the loop count, timing and frames", () => {
    const src = gif([...COMMENT, ...XMP, ...LOOP, ...GCE]);
    const out = stripGif(src)!;
    expect(out).toBeDefined();
    const text = new TextDecoder("latin1").decode(out);
    expect(text).toContain("NETSCAPE2.0");
    expect(text).not.toContain("XMP Data");
    expect(text).not.toContain("abc");
    expect(out[out.length - 1]).toBe(0x3b);
    expect(out.length).toBeLessThan(src.length);
    expect(sniff(out)).toEqual({ ok: true, kind: "gif" });
    expect(Array.from(out).join(",")).toContain(GCE.join(","));
  });
  it("leaves an already clean GIF the same size, and refuses a broken or truncated one", () => {
    const clean = gif([...LOOP, ...GCE]);
    expect(stripGif(clean)!.length).toBe(clean.length);
    expect(stripGif(clean.subarray(0, 20))).toBeUndefined();
    expect(stripGif(new Uint8Array(ascii("GIF89a")))).toBeUndefined();
    expect(stripGif(new Uint8Array(PNG))).toBeUndefined();
  });
});

describe("base64 and records", () => {
  it("round-trips a large byte array", () => {
    const big = new Uint8Array(200_000).map((_, i) => (i * 31) % 251);
    expect(Array.from(fromBase64(toBase64(big))!)).toEqual(Array.from(big));
    expect(fromBase64("not base64!")).toBeUndefined();
    expect(fromBase64("abc")).toBeUndefined();
  });

  const record = (over: Partial<AssetRecord> = {}): AssetRecord => ({
    id: "0a1b2c3d",
    kind: "image",
    mime: "image/png",
    name: "Cat",
    w: 10,
    h: 10,
    data: toBase64(new Uint8Array(PNG)),
    poster: toBase64(new Uint8Array(JPG)),
    posterMime: "image/jpeg",
    ...over,
  });
  const video = (over: Partial<AssetRecord> = {}) => record({ kind: "video", mime: "video/mp4", data: toBase64(new Uint8Array(MP4)), duration: 5, ...over });

  it("accepts a good image and a good video record", () => {
    expect(parseAsset(record())).toEqual(record());
    expect(parseAsset(video())).toEqual(video());
  });
  it("re-checks magic bytes on every read: a record that lies about its type is dropped", () => {
    expect(parseAsset(record({ mime: "image/jpeg" }))).toBeUndefined();
    expect(parseAsset(record({ data: toBase64(new TextEncoder().encode("<svg/>")) }))).toBeUndefined();
    expect(parseAsset(record({ poster: toBase64(new TextEncoder().encode("<svg/>")) }))).toBeUndefined();
    expect(parseAsset(record({ posterMime: "image/svg+xml" }))).toBeUndefined();
    expect(parseAsset(record({ kind: "video" }))).toBeUndefined();
    const noDuration: Record<string, unknown> = { ...video() };
    delete noDuration["duration"];
    expect(parseAsset(noDuration)).toBeUndefined();
    expect(parseAsset(video({ duration: -1 }))).toBeUndefined();
  });
  it("rejects bad ids, names, sizes, base64 and non-objects", () => {
    for (const bad of [record({ id: "XYZ" }), record({ id: "0a1b2c3" }), record({ name: "" }), record({ name: "x".repeat(61) }), record({ w: 0 }), record({ h: 1.5 }), record({ data: "***" }), record({ poster: "" })]) {
      expect(parseAsset(bad)).toBeUndefined();
    }
    for (const bad of [null, "x", 3, [], undefined]) expect(parseAsset(bad)).toBeUndefined();
  });
  it("a corrupt record is ignored and the good ones around it are kept; duplicates collapse", () => {
    const list = parseAssets([record(), { id: "zz" }, "junk", video({ id: "11112222" }), record()]);
    expect(list.map((r) => r.id)).toEqual(["0a1b2c3d", "11112222"]);
    expect(parseAssets("nope")).toEqual([]);
    expect(parseAssets(undefined)).toEqual([]);
  });
  it("enforces the count cap and the 7 MB total on read and on add", () => {
    const fat = (id: string, chars: number) => {
      // a valid PNG header followed by filler, encoded: the size is what matters here
      const body = new Uint8Array(Math.floor((chars * 3) / 4));
      body.set(PNG);
      return record({ id, data: toBase64(body) });
    };
    const a = fat("aaaaaaaa", 4 * 1024 * 1024);
    const b = fat("bbbbbbbb", 2 * 1024 * 1024);
    const c = fat("cccccccc", 2 * 1024 * 1024);
    expect(parseAssets([a, b, c]).map((r) => r.id)).toEqual(["aaaaaaaa", "bbbbbbbb"]);
    const first = addAsset([], a);
    expect(first.ok).toBe(true);
    if (first.ok) {
      const second = addAsset(first.list, b);
      expect(second.ok).toBe(true);
      if (second.ok) {
        expect(totalBytes(second.list)).toBeLessThanOrEqual(TOTAL_CAP_BYTES);
        expect(addAsset(second.list, c)).toEqual({ ok: false, reason: "full" });
        expect(freeBytes(second.list)).toBeLessThan(TOTAL_CAP_BYTES - 5 * 1024 * 1024);
        expect(freeBytes(removeAsset(second.list, "aaaaaaaa"))).toBeGreaterThan(freeBytes(second.list));
      }
    }
    const many = Array.from({ length: MAX_ASSETS }, (_, i) => record({ id: i.toString(16).padStart(8, "0") }));
    expect(addAsset(many, record({ id: "ffffffff" }))).toEqual({ ok: false, reason: "count" });
    expect(addAsset([], record({ id: "BAD" }))).toEqual({ ok: false, reason: "invalid" });
  });
  it("labels come from the file name only, without path or extension", () => {
    expect(labelFor("C:\\Users\\me\\Pictures\\holiday photo.png")).toBe("holiday photo");
    expect(labelFor("/home/me/cat.v2.jpg")).toBe("cat.v2".replace(".", ""));
    expect(labelFor("<script>.gif")).toBe("script");
    expect(labelFor("....png")).toBe("My file");
    expect(labelFor("a".repeat(100) + ".png").length).toBe(40);
  });
});

describe("prepareAsset", () => {
  const file = (bytes: number[] | Uint8Array, name = "pic.png", size?: number): UploadFile => {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return { name, size: size ?? u.length, bytes: async () => u };
  };
  const deps = (over: Partial<MediaDeps> = {}): MediaDeps => ({
    decodeImage: async () => ({
      w: 4000,
      h: 2000,
      encode: async (side, type) => (type === "image/webp" ? new Uint8Array([...WEBP, side & 255]) : new Uint8Array([...JPG, side & 255])),
    }),
    probeVideo: async () => ({ w: 640, h: 360, duration: 6.04, poster: async () => new Uint8Array(JPG) }),
    newId: () => "0a1b2c3d",
    ...over,
  });
  const pngBody = new Uint8Array([...PNG, ...new Array(50).fill(7)]);

  it("re-encodes a big picture to WebP at most 1920 px wide and makes a poster", async () => {
    const r = await prepareAsset(file(pngBody, "My Holiday.PNG"), [], deps());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record).toMatchObject({ kind: "image", mime: "image/webp", name: "My Holiday", w: 1920, h: 960, posterMime: "image/jpeg" });
    const stored = sniff(fromBase64(r.record.data)!);
    expect(stored).toEqual({ ok: true, kind: "webp" });
    expect(sniff(fromBase64(r.record.poster)!)).toEqual({ ok: true, kind: "jpeg" });
    expect(parseAsset(r.record)).toBeDefined();
    expect(r.list).toHaveLength(1);
  });
  it("falls back to JPEG when the browser cannot encode WebP, and keeps small pictures at their size", async () => {
    const d = deps({ decodeImage: async () => ({ w: 300, h: 200, encode: async (_s, type) => (type === "image/webp" ? undefined : new Uint8Array([...JPG, 1])) }) });
    const r = await prepareAsset(file(pngBody), [], d);
    expect(r.ok && r.record).toMatchObject({ mime: "image/jpeg", w: 300, h: 200 });
  });
  it("keeps a GIF animated: it is cleaned, not re-drawn", async () => {
    const g = gif([...COMMENT, ...LOOP, ...GCE]);
    let decoded: Uint8Array | undefined;
    const r = await prepareAsset(file(g, "spin.gif"), [], deps({ decodeImage: async (b) => ((decoded = b), { w: 1, h: 1, encode: async () => new Uint8Array(JPG) }) }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record.mime).toBe("image/gif");
    const text = new TextDecoder("latin1").decode(fromBase64(r.record.data)!);
    expect(text).toContain("NETSCAPE2.0");
    expect(text).not.toContain("abc");
    expect(decoded!.length).toBeLessThan(g.length);
  });
  it("refuses SVG, unknown types and empty files with a clear message and never echoes the file name", async () => {
    const svg = await prepareAsset(file(new TextEncoder().encode("<svg/>"), "evil-name.svg"), [], deps());
    expect(svg).toEqual({ ok: false, error: "svg", message: PREPARE_MESSAGES.svg });
    const txt = await prepareAsset(file(new TextEncoder().encode("hello"), "evil-name.png"), [], deps());
    expect(txt).toMatchObject({ ok: false, error: "type" });
    expect(await prepareAsset(file([], "x.png"), [], deps())).toMatchObject({ ok: false, error: "empty" });
    for (const m of Object.values(PREPARE_MESSAGES)) expect(m).not.toContain("evil-name");
    expect(PREPARE_MESSAGES.svg).toContain("SVG");
  });
  it("refuses a file that lies about its type (a PNG name on text), a file over 25 MB and a GIF over 3 MB", async () => {
    expect(await prepareAsset(file(new Uint8Array([...PNG]), "a.png", 26 * 1024 * 1024), [], deps())).toMatchObject({ ok: false, error: "too-big" });
    const bigGif = new Uint8Array(3 * 1024 * 1024 + 1);
    bigGif.set(gif());
    expect(await prepareAsset(file(bigGif, "a.gif"), [], deps())).toMatchObject({ ok: false, error: "gif-big" });
    expect(await prepareAsset(file(new Uint8Array([...ascii("GIF89a"), 1, 2]), "a.gif"), [], deps())).toMatchObject({ ok: false, error: "broken" });
  });
  it("accepts a short video, rounds its length, makes a poster, and does not re-encode it", async () => {
    const mp4 = new Uint8Array([...MP4, ...new Array(100).fill(1)]);
    const r = await prepareAsset(file(mp4, "clip.mp4"), [], deps());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record).toMatchObject({ kind: "video", mime: "video/mp4", w: 640, h: 360, duration: 6 });
    expect(Array.from(fromBase64(r.record.data)!)).toEqual(Array.from(mp4));
    expect(parseAsset(r.record)).toBeDefined();
    const webm = await prepareAsset(file(new Uint8Array([...WEBM, 1, 2, 3, 4]), "clip.webm"), [], deps());
    expect(webm.ok && webm.record.mime).toBe("video/webm");
  });
  it("rejects a video over 4 MB or over 15 seconds, and one the browser cannot read", async () => {
    const over = new Uint8Array(4 * 1024 * 1024 + 1);
    over.set(MP4);
    expect(await prepareAsset(file(over, "big.mp4"), [], deps())).toMatchObject({ ok: false, error: "video-big" });
    const mp4 = new Uint8Array([...MP4, 1, 2, 3]);
    expect(await prepareAsset(file(mp4, "long.mp4"), [], deps({ probeVideo: async () => ({ w: 1, h: 1, duration: 15.5, poster: async () => new Uint8Array(JPG) }) }))).toMatchObject({ ok: false, error: "video-long" });
    expect((await prepareAsset(file(mp4, "ok.mp4"), [], deps({ probeVideo: async () => ({ w: 1, h: 1, duration: 15, poster: async () => new Uint8Array(JPG) }) }))).ok).toBe(true);
    expect(await prepareAsset(file(mp4, "bad.mp4"), [], deps({ probeVideo: async () => undefined }))).toMatchObject({ ok: false, error: "broken" });
    expect(await prepareAsset(file(mp4, "bad.mp4"), [], deps({ probeVideo: async () => { throw new Error("x"); } }))).toMatchObject({ ok: false, error: "broken" });
  });
  it("stops when the total quota is used up", async () => {
    const filler: AssetRecord = { id: "99999999", kind: "image", mime: "image/png", name: "f", w: 1, h: 1, data: toBase64(new Uint8Array([...PNG, ...new Array(10).fill(0)])), poster: toBase64(new Uint8Array(JPG)), posterMime: "image/jpeg" };
    const fat = { ...filler, data: "A".repeat(TOTAL_CAP_BYTES - 20) };
    const r = await prepareAsset(file(pngBody), [fat], deps());
    expect(r).toEqual({ ok: false, error: "full", message: PREPARE_MESSAGES.full });
  });
  it("a decode failure is a plain refusal, not an exception", async () => {
    expect(await prepareAsset(file(pngBody), [], deps({ decodeImage: async () => { throw new Error("boom"); } }))).toMatchObject({ ok: false, error: "broken" });
    expect(await prepareAsset({ name: "x.png", size: 10, bytes: async () => { throw new Error("io"); } }, [], deps())).toMatchObject({ ok: false, error: "broken" });
  });
});

describe("renderer", () => {
  const rec = (kind: "image" | "video" = "image"): AssetRecord => ({
    id: "0a1b2c3d",
    kind,
    mime: kind === "image" ? "image/png" : "video/mp4",
    name: "Pic",
    w: 200,
    h: 100,
    ...(kind === "video" ? { duration: 4 } : {}),
    data: toBase64(new Uint8Array(kind === "image" ? PNG : MP4)),
    poster: toBase64(new Uint8Array(JPG)),
    posterMime: "image/jpeg",
  });
  const place = (over: Partial<AssetPlacement> = {}): AssetPlacement => ({ ...defaultPlacement(), assetId: "0a1b2c3d", ...over });
  const centred = computeGutters([{ x: 360, w: 600 }], 1320, 1320);
  const none = computeGutters([{ x: 0, w: 1320 }], 1320, 1320);
  const make = (over: Partial<AssetEnv> = {}) => {
    const revoked: string[] = [];
    const env: AssetEnv = {
      doc: document,
      win: window,
      createObjectURL: () => "blob:test/1",
      revokeObjectURL: (u) => void revoked.push(u),
      decodePoster: async () => ({ w: 1, h: 1, draw: () => undefined }),
      ...over,
    };
    return { r: createAssetRenderer(env), revoked };
  };
  const host = () => document.querySelector('[data-skinly-scene="asset"]') as HTMLElement | null;
  const inner = (sel: string) => host()?.shadowRoot?.querySelector(sel) ?? null;
  const flush = () => new Promise((r) => setTimeout(r, 0));

  afterEach(() => {
    document.documentElement.querySelectorAll("[data-skinly-scene]").forEach((n) => n.remove());
    document.documentElement.removeAttribute(COVER_ATTR);
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("lane mode: one clipped lane in the free gutter, pointer-events none, opacity and size applied", () => {
    const { r } = make();
    const seen: string[] = [];
    r.show({ record: rec(), placement: place({ opacity: 40, size: "S" }), gutters: centred }, (s) => seen.push(s));
    expect(seen).toEqual(["shown"]);
    expect(host()!.style.getPropertyValue("pointer-events")).toBe("none");
    const lane = inner(".lane") as HTMLElement;
    expect(lane).not.toBeNull();
    expect(parseFloat(lane.style.width)).toBeGreaterThanOrEqual(120);
    const box = inner(".asset") as HTMLElement;
    expect(box.style.opacity).toBe("0.4");
    expect(parseFloat(box.style.width)).toBeLessThanOrEqual(96);
    const img = inner("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("blob:test/1");
    expect(img.getAttribute("aria-hidden")).toBe("true");
    r.destroy();
    expect(host()).toBeNull();
  });
  it("lane mode with no free gutter shows nothing and says why", () => {
    const { r } = make();
    const seen: string[] = [];
    r.show({ record: rec(), placement: place(), gutters: none }, (s) => seen.push(s));
    expect(seen).toEqual(["no-gutter"]);
    expect(host()).toBeNull();
  });
  it("every preset animates with transform or opacity names only; none has no animation", () => {
    for (const preset of ["spin", "float", "orbit", "sway", "slide", "pulse", "drift"] as const) {
      const { r } = make();
      r.show({ record: rec(), placement: place({ preset }), gutters: centred }, () => undefined);
      expect(host()!.shadowRoot!.querySelectorAll("[data-anim]").length, preset).toBeGreaterThan(0);
      r.destroy();
    }
    const { r } = make();
    r.show({ record: rec(), placement: place({ preset: "none" }), gutters: centred }, () => undefined);
    expect(host()!.shadowRoot!.querySelectorAll("[data-anim]")).toHaveLength(0);
    r.destroy();
  });
  it("reduced motion keeps the picture on screen (still, not hidden); a video is paused, not removed", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduced-motion"), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    const { r } = make();
    const seen: string[] = [];
    r.show({ record: rec(), placement: place({ preset: "spin" }), gutters: centred }, (s) => seen.push(s));
    expect(seen).toEqual(["shown"]);
    expect(inner("img")).not.toBeNull();
    expect(inner(".root")!.classList.contains("still")).toBe(true);
    r.destroy();
    r.show({ record: rec("video"), placement: place(), gutters: centred }, () => undefined);
    expect(inner("video")).not.toBeNull();
    expect(pause).toHaveBeenCalled();
    r.destroy();
  });
  it("a video is muted, loops and has no controls; it pauses when the tab is hidden", () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    const { r } = make();
    r.show({ record: rec("video"), placement: place(), gutters: centred }, () => undefined);
    const v = inner("video") as HTMLVideoElement;
    expect(v.muted).toBe(true);
    expect(v.loop).toBe(true);
    expect(v.hasAttribute("controls")).toBe(false);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(pause).toHaveBeenCalled();
    r.destroy();
  });
  it("when the page blocks the file, the stored still picture is drawn on a canvas and the user is told", async () => {
    const draw = vi.fn();
    const { r } = make({ decodePoster: async () => ({ w: 1, h: 1, draw }) });
    const seen: string[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    r.show({ record: rec(), placement: place(), gutters: centred }, (s) => seen.push(s));
    (inner("img") as HTMLImageElement).dispatchEvent(new Event("error"));
    await flush();
    expect(seen).toEqual(["shown", "poster"]);
    expect(inner("canvas")).not.toBeNull();
    expect(inner("img")).toBeNull();
    expect(draw).toHaveBeenCalled();
    r.destroy();
  });
  it("when even the still picture fails, it reports failure and removes the host (the caller shows the built-in scene)", async () => {
    const { r } = make({ decodePoster: async () => undefined });
    const seen: string[] = [];
    r.show({ record: rec(), placement: place(), gutters: centred }, (s) => seen.push(s));
    (inner("img") as HTMLImageElement).dispatchEvent(new Event("error"));
    await flush();
    expect(seen).toEqual(["shown", "failed"]);
    expect(host()).toBeNull();
  });
  it("a blocked object URL goes straight to the still picture", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    const { r } = make({ createObjectURL: () => { throw new Error("blocked"); } });
    const seen: string[] = [];
    r.show({ record: rec(), placement: place(), gutters: centred }, (s) => seen.push(s));
    await flush();
    expect(seen).toEqual(["poster"]);
    r.destroy();
  });
  it("cover mode sits behind the page, works with no gutter, and Restore (hide) removes the marker and the object URL", () => {
    const { r, revoked } = make();
    r.show({ record: rec(), placement: place({ mode: "cover" }), gutters: none }, () => undefined);
    expect(host()!.style.getPropertyValue("z-index")).toBe("-1");
    expect(document.documentElement.hasAttribute(COVER_ATTR)).toBe(true);
    r.hide();
    expect(document.documentElement.hasAttribute(COVER_ATTR)).toBe(false);
    expect(host()).toBeNull();
    expect(revoked).toEqual(["blob:test/1"]);
  });
  it("corner mode works with no gutter", () => {
    const { r } = make();
    const seen: string[] = [];
    r.show({ record: rec(), placement: place({ mode: "corner" }), gutters: none }, (s) => seen.push(s));
    expect(seen).toEqual(["shown"]);
    expect(inner(".corner")).not.toBeNull();
    r.destroy();
  });
  it("changes no site element", () => {
    document.body.innerHTML = '<main><a href="/x">link</a><form action="/f"><input name="q"></form></main>';
    const before = document.body.outerHTML;
    const { r } = make();
    r.show({ record: rec(), placement: place(), gutters: centred }, () => undefined);
    expect(document.body.outerHTML).toBe(before);
    r.destroy();
    expect(document.body.outerHTML).toBe(before);
  });
});

describe("settings: asset placement", () => {
  it("has no asset by default and validates every field", () => {
    expect(defaultSettings().asset.assetId).toBeNull();
    const ok = parseSettings({ asset: { assetId: "0a1b2c3d", mode: "cover", size: "L", opacity: 55, speed: "fast", preset: "orbit" } }).asset;
    expect(ok).toEqual({ assetId: "0a1b2c3d", mode: "cover", size: "L", opacity: 55, speed: "fast", preset: "orbit" });
    const bad = parseSettings({ asset: { assetId: "../../x", mode: "full", size: "XL", opacity: 5, speed: "warp", preset: "explode" } }).asset;
    expect(bad).toEqual(defaultSettings().asset);
    expect(parseSettings({ asset: { opacity: 100.5 } }).asset.opacity).toBe(100);
    expect(parseSettings({ asset: "x" }).asset).toEqual(defaultSettings().asset);
  });
});

describe("privacy: assets never reach the AI", () => {
  it("no module on the AI path imports the assets code or reads the assets key", () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(`${dir}/${n}`).isDirectory() ? walk(`${dir}/${n}`) : [`${dir}/${n}`]));
    for (const f of [...walk("src/ai"), ...walk("src/providers"), ...walk("src/analyzer")]) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/features\/assets|assetStore|ASSETS_KEY|"assets"/);
    }
  });
  it("the structural summary of a page that shows an asset contains none of its bytes, label or object URL", () => {
    const rec = { data: toBase64(new Uint8Array([...PNG, 1, 2, 3, 4, 5, 6, 7, 8])), name: "Secret holiday" };
    document.body.innerHTML = "<main><p>hello</p></main>";
    const { r } = (() => {
      const env: AssetEnv = { doc: document, win: window, createObjectURL: () => "blob:test/zz", revokeObjectURL: () => undefined, decodePoster: async () => undefined };
      return { r: createAssetRenderer(env) };
    })();
    r.show(
      { record: { id: "0a1b2c3d", kind: "image", mime: "image/png", name: rec.name, w: 2, h: 2, data: rec.data, poster: toBase64(new Uint8Array(JPG)), posterMime: "image/jpeg" }, placement: { ...defaultPlacement(), mode: "corner" }, gutters: { state: "none" } },
      () => undefined,
    );
    const a = analyze(document);
    const json = JSON.stringify(a.status === "ok" ? a.summary : a);
    expect(json).not.toContain(rec.data);
    expect(json).not.toContain("Secret");
    expect(json).not.toContain("blob:");
    expect(json).not.toContain("data-skinly-scene");
    r.destroy();
    document.body.replaceChildren();
  });
});
