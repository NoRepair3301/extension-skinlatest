/* Pure color math and parsing (no DOM access except optional canvas normalization fallback). */
import { contrastRatio, luminance as wcagLuminance } from "../plan/contrast.ts";

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  h = (((h % 360) + 360) % 360) / 360;
  if (!s) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

export function lerpHue(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return (((a + d * t) % 360) + 360) % 360;
}

export function luminance(c: { r: number; g: number; b: number }): number {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

const RGB_RE = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i;
const HEX_RE = /^#([0-9a-f]{3,8})$/i;

export function parseRgb(str: string): RGBA | null {
  const s = str.trim();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const m = RGB_RE.exec(s);
  if (m) {
    let a = 1;
    if (m[4] !== undefined) a = m[5] ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: parseFloat(m[1]!), g: parseFloat(m[2]!), b: parseFloat(m[3]!), a: clamp(a, 0, 1) };
  }
  const h = HEX_RE.exec(s);
  if (h) {
    const raw = h[1]!;
    if (raw.length === 3 || raw.length === 4) {
      const r = parseInt(raw[0]! + raw[0]!, 16);
      const g = parseInt(raw[1]! + raw[1]!, 16);
      const b = parseInt(raw[2]! + raw[2]!, 16);
      const a = raw.length === 4 ? parseInt(raw[3]! + raw[3]!, 16) / 255 : 1;
      return { r, g, b, a };
    }
    if (raw.length === 6 || raw.length === 8) {
      const r = parseInt(raw.slice(0, 2), 16);
      const g = parseInt(raw.slice(2, 4), 16);
      const b = parseInt(raw.slice(4, 6), 16);
      const a = raw.length === 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }
  return null;
}

export function toCss(r: number, g: number, b: number, a = 1): string {
  r = clamp(Math.round(r), 0, 255);
  g = clamp(Math.round(g), 0, 255);
  b = clamp(Math.round(b), 0, 255);
  if (a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

export function toHex(r: number, g: number, b: number): string {
  const f = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return `#${f(r)}${f(g)}${f(b)}`;
}

let canvasContext: CanvasRenderingContext2D | null = null;
const normalizedCache = new Map<string, string>();

/** Normalizes any CSS color (lab, oklch, color(), hsl, named) to rgba(...) via canvas context when available. */
export function normalizeCssColor(str: string, doc?: Document): string {
  const hit = normalizedCache.get(str);
  if (hit !== undefined) return hit;
  let out = str;
  try {
    if (!canvasContext) {
      const d = doc ?? (typeof document !== "undefined" ? document : null);
      if (d && typeof d.createElement === "function") {
        const cv = d.createElement("canvas");
        cv.width = cv.height = 1;
        canvasContext = cv.getContext("2d", { willReadFrequently: true });
      }
    }
    if (canvasContext) {
      canvasContext.clearRect(0, 0, 1, 1);
      canvasContext.fillStyle = "#000";
      canvasContext.fillStyle = str;
      canvasContext.fillRect(0, 0, 1, 1);
      const data = canvasContext.getImageData(0, 0, 1, 1).data;
      out = `rgba(${data[0]}, ${data[1]}, ${data[2]}, ${data[3]! / 255})`;
    }
  } catch {
    out = str;
  }
  normalizedCache.set(str, out);
  return out;
}

export { contrastRatio, wcagLuminance };
