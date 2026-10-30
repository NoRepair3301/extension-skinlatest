import { usableGutters, type Gutters } from "../freespace/index.ts";
import { SCENE_CSS } from "../scenes/css.ts";
import { sheet } from "../scenes/engine.ts";
import { fromBase64 } from "./store.ts";
import type { AssetPlacement, AssetRecord, AssetSize, AssetSpeed } from "./types.ts";

export interface AssetEnv {
  doc: Document;
  win: Window;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  /** Decodes a still picture so it can be drawn on a canvas (this does not depend on the page's content security policy). */
  decodePoster(bytes: Uint8Array, mime: string): Promise<{ w: number; h: number; draw(ctx: CanvasRenderingContext2D, w: number, h: number): void } | undefined>;
}

/** shown: the file is on screen. poster: the page blocked the file, so its still picture is shown. failed: neither worked. no-gutter: lane mode and no free side space. */
export type AssetStatus = "shown" | "poster" | "failed" | "no-gutter";

export const ASSET_WHY: Record<AssetStatus, string> = {
  shown: "",
  poster: "This page blocks pictures from extensions, so a still picture is shown instead.",
  failed: "This page blocks pictures from extensions, so the built-in scene is shown instead.",
  "no-gutter": "This page uses the full width, so your picture is not shown. Try the corner or background option.",
};

const BOX_PX: Record<AssetSize, number> = { S: 96, M: 160, L: 256 };
const SPEED_MULT: Record<AssetSpeed, number> = { slow: 1.7, normal: 1, fast: 0.55 };
const BASE_DUR: Record<string, number> = { spin: 24, float: 6, orbit: 14, sway: 5, slide: 14, pulse: 4, drift: 10 };
const MARGIN = 12;
export const COVER_ATTR = "data-skinly-cover";
const COVER_CSS = `html[${COVER_ATTR}]:not(#skinly-cover),html[${COVER_ATTR}]:not(#skinly-cover) body{background:transparent!important}`;

export interface AssetRenderer {
  show(req: { record: AssetRecord; placement: AssetPlacement; gutters: Gutters }, onStatus: (s: AssetStatus) => void): void;
  hide(): void;
  host(): HTMLElement | undefined;
  destroy(): void;
}

const EXTRA_CSS =
  ".asset{position:absolute;pointer-events:none}.asset img,.asset video,.asset canvas{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none}" +
  ".cover{position:fixed;inset:0}.cover img,.cover video,.cover canvas{object-fit:cover}.corner{position:fixed}";

/**
 * Shows a stored picture or video: in an empty side gutter (default), as a corner companion, or as a background behind the page
 * (only when the user chose it). Everything sits in one extension-owned shadow-root host that ignores the pointer. Videos are
 * muted and loop, and pause while the tab is hidden. If the page's security policy blocks the file, the stored still picture is
 * drawn on a canvas instead; if that fails too the caller is told so it can show the built-in scene.
 */
export function createAssetRenderer(env: AssetEnv): AssetRenderer {
  const { doc, win } = env;
  let host: HTMLElement | undefined;
  let rootEl: HTMLElement | undefined;
  let urls: string[] = [];
  let videos: HTMLVideoElement[] = [];
  let coverSheet: CSSStyleSheet | undefined;
  let offEnv: (() => void) | undefined;
  let token = 0;

  const reduced = (): boolean => win.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const apply = () => {
    const hidden = doc.visibilityState === "hidden";
    rootEl?.classList.toggle("paused", hidden);
    rootEl?.classList.toggle("still", reduced());
    for (const v of videos) {
      if (hidden || reduced()) v.pause();
      else void v.play().catch(() => undefined);
    }
  };

  const teardown = () => {
    token++;
    offEnv?.();
    offEnv = undefined;
    for (const u of urls) env.revokeObjectURL(u);
    urls = [];
    videos = [];
    host?.remove();
    host = undefined;
    rootEl = undefined;
    if (coverSheet) {
      const d = doc as Document & { adoptedStyleSheets: CSSStyleSheet[] };
      d.adoptedStyleSheets = d.adoptedStyleSheets.filter((s) => s !== coverSheet);
      coverSheet = undefined;
    }
    doc.documentElement.removeAttribute(COVER_ATTR);
  };

  const mount = (cover: boolean): HTMLElement => {
    teardown();
    const h = doc.createElement("div");
    h.setAttribute("data-skinly-scene", "asset");
    h.setAttribute("data-skinly-ui", "asset");
    const s = h.style;
    s.setProperty("all", "initial");
    s.setProperty("position", "fixed");
    s.setProperty("inset", "0");
    s.setProperty("pointer-events", "none");
    s.setProperty("z-index", cover ? "-1" : "2147479000");
    const shadow = h.attachShadow({ mode: "open" });
    sheet(doc, shadow, SCENE_CSS + EXTRA_CSS);
    const r = doc.createElement("div");
    r.className = "root";
    shadow.append(r);
    doc.documentElement.append(h);
    host = h;
    rootEl = r;
    const on = () => apply();
    doc.addEventListener("visibilitychange", on);
    const mq = win.matchMedia?.("(prefers-reduced-motion: reduce)");
    mq?.addEventListener?.("change", on);
    offEnv = () => {
      doc.removeEventListener("visibilitychange", on);
      mq?.removeEventListener?.("change", on);
    };
    return h;
  };

  /** Draws the stored still picture on a canvas; false when it cannot be decoded. */
  const posterCanvas = async (record: AssetRecord, w: number, h: number): Promise<HTMLCanvasElement | undefined> => {
    const bytes = fromBase64(record.poster);
    if (!bytes) return undefined;
    const pic = await env.decodePoster(bytes, record.posterMime).catch(() => undefined);
    if (!pic) return undefined;
    const c = doc.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    const ctx = c.getContext("2d");
    if (!ctx) return undefined;
    pic.draw(ctx, c.width, c.height);
    return c;
  };

  const show: AssetRenderer["show"] = ({ record, placement, gutters }, onStatus) => {
    const cover = placement.mode === "cover";
    let area: { x: number; w: number } | undefined;
    if (placement.mode === "lane") {
      const lanes = usableGutters(gutters, "both");
      area = lanes[lanes.length - 1];
      if (!area) {
        teardown();
        return onStatus("no-gutter");
      }
    }
    mount(cover);
    const my = token;
    const data = fromBase64(record.data);
    if (!data) {
      teardown();
      return onStatus("failed");
    }
    const px = BOX_PX[placement.size];
    const boxW = area ? Math.min(px, area.w - MARGIN * 2) : px;
    const boxH = boxW * (record.h / record.w > 1.6 ? 1.6 : Math.max(0.3, record.h / record.w));
    const laneH = Math.max(160, win.innerHeight || 600);

    // container: lane (clipped), corner or cover
    const holder = doc.createElement("div");
    const box = doc.createElement("div");
    box.className = "asset";
    box.style.setProperty("opacity", String(Math.max(10, Math.min(100, placement.opacity)) / 100));
    if (cover) {
      holder.className = "cover";
      box.style.setProperty("inset", "0");
      box.style.setProperty("position", "absolute");
      box.style.setProperty("width", "100%");
      box.style.setProperty("height", "100%");
    } else if (area) {
      holder.className = "lane";
      holder.style.setProperty("left", `${area.x}px`);
      holder.style.setProperty("width", `${area.w}px`);
      box.style.setProperty("width", `${boxW}px`);
      box.style.setProperty("height", `${boxH}px`);
      box.style.setProperty("left", `${(area.w - boxW) / 2}px`);
      box.style.setProperty("top", `${Math.max(MARGIN, laneH * 0.35)}px`);
    } else {
      holder.className = "corner";
      holder.style.setProperty("left", `${MARGIN}px`);
      holder.style.setProperty("bottom", `${MARGIN}px`);
      holder.style.setProperty("width", `${boxW}px`);
      holder.style.setProperty("height", `${boxH}px`);
      box.style.setProperty("width", "100%");
      box.style.setProperty("height", "100%");
    }

    // motion preset on the wrapper (transform and opacity only)
    const dur = (BASE_DUR[placement.preset] ?? 6) * SPEED_MULT[placement.speed];
    const travel = area ? Math.max(0, area.w - boxW - MARGIN * 2) : 0;
    let target: HTMLElement = box;
    if (placement.preset !== "none" && !cover) {
      const set = (el: HTMLElement, name: string, amp: number, phase = 0) => {
        el.setAttribute("data-anim", name);
        el.style.setProperty("--dur", `${dur}s`);
        el.style.setProperty("--delay", `${-phase}s`);
        el.style.setProperty("--amp", `${amp}px`);
      };
      if (placement.preset === "orbit") {
        const inner = doc.createElement("div");
        inner.style.setProperty("width", "100%");
        inner.style.setProperty("height", "100%");
        set(box, "orbit-x", Math.min(24, travel / 2 || 24));
        set(inner, "orbit-y", Math.min(24, travel / 2 || 24), dur / 2);
        box.append(inner);
        target = inner;
      } else if (placement.preset === "slide") set(box, "drift", Math.max(8, travel / 2));
      else if (placement.preset === "drift") set(box, "drift", Math.min(16, Math.max(6, travel / 2)));
      else if (placement.preset === "float") set(box, "float", 12);
      else set(box, placement.preset, 0);
    }
    holder.append(box);
    rootEl!.append(holder);
    if (cover) {
      doc.documentElement.setAttribute(COVER_ATTR, "");
      const win2 = doc.defaultView as (Window & { CSSStyleSheet?: typeof CSSStyleSheet }) | null;
      if (win2?.CSSStyleSheet) {
        try {
          const s = new win2.CSSStyleSheet();
          s.replaceSync(COVER_CSS);
          const d = doc as Document & { adoptedStyleSheets: CSSStyleSheet[] };
          d.adoptedStyleSheets = [...d.adoptedStyleSheets, s];
          coverSheet = s;
        } catch {
          // the picture still shows over the page background
        }
      }
    }

    const usePoster = async (status: AssetStatus) => {
      if (my !== token) return;
      const c = await posterCanvas(record, boxW * 2, boxH * 2);
      if (my !== token) return;
      if (!c) {
        teardown();
        return onStatus("failed");
      }
      target.replaceChildren(c);
      onStatus(status);
    };

    const blob = new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], { type: record.mime });
    let url: string;
    try {
      url = env.createObjectURL(blob);
    } catch {
      void usePoster("poster");
      return;
    }
    urls.push(url);
    if (record.kind === "video") {
      const v = doc.createElement("video");
      v.muted = true;
      v.loop = true;
      v.autoplay = true;
      v.playsInline = true;
      v.setAttribute("muted", "");
      v.setAttribute("aria-hidden", "true");
      v.tabIndex = -1;
      v.addEventListener("error", () => void usePoster("poster"), { once: true });
      v.src = url;
      videos.push(v);
      target.append(v);
    } else {
      const img = doc.createElement("img");
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      img.draggable = false;
      img.addEventListener("error", () => void usePoster("poster"), { once: true });
      img.src = url;
      target.append(img);
    }
    apply();
    onStatus("shown");
  };

  return { show, hide: teardown, host: () => host, destroy: teardown };
}
