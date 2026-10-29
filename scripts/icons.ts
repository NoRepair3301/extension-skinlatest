import { crc32, deflateSync } from "node:zlib";

export const ICON_SIZES = [16, 32, 48, 128] as const;

type Rgb = readonly [number, number, number];
const BG: Rgb = [0x20, 0x49, 0x5f];
const ORB: Rgb = [0x8f, 0xb8, 0xd8];
const SUN: Rgb = [0xf6, 0xd3, 0x6b];

/** Signed distance to a rounded square centred in a unit box (negative inside). */
const roundedSquare = (x: number, y: number, half: number, r: number): number => {
  const qx = Math.abs(x - 0.5) - (half - r);
  const qy = Math.abs(y - 0.5) - (half - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const circle = (x: number, y: number, cx: number, cy: number, r: number): number => Math.hypot(x - cx, y - cy) - r;

/**
 * Original procedural design: a deep blue rounded square, a large pale-blue orb and a small warm "sun" overlapping its upper right.
 * Returns RGBA for one point in the unit square (supersampled by the caller).
 */
function shade(x: number, y: number): [number, number, number, number] {
  if (roundedSquare(x, y, 0.48, 0.18) > 0) return [0, 0, 0, 0];
  let c: Rgb = BG;
  if (circle(x, y, 0.46, 0.56, 0.3) <= 0) c = ORB;
  if (circle(x, y, 0.68, 0.34, 0.14) <= 0) c = SUN;
  return [c[0], c[1], c[2], 255];
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A PNG of the icon at `size` px, 4 x 4 supersampled. Deterministic: same bytes every run. */
export function renderIcon(size: number): Uint8Array {
  const SS = 4;
  const raw = new Uint8Array(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [cr, cg, cb, ca] = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      const n = SS * SS;
      raw[o] = a === 0 ? 0 : Math.round(r / a);
      raw[o + 1] = a === 0 ? 0 : Math.round(g / a);
      raw[o + 2] = a === 0 ? 0 : Math.round(b / a);
      raw[o + 3] = Math.round(a / n);
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, size);
  v.setUint32(4, size);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const parts = [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", new Uint8Array(0))];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    png.set(p, at);
    at += p.length;
  }
  return png;
}

export const iconFileName = (size: number): string => `icons/icon-${size}.png`;
