/** Base64 and base64url without Node or Deno APIs (works in Edge Functions, Node and the browser). */
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function toB64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += ALPHA[a >> 2]!;
    out += ALPHA[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    out += b === undefined ? "=" : ALPHA[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    out += c === undefined ? "=" : ALPHA[c & 63]!;
  }
  return out;
}

/** Strict: only the base64 alphabet (padding optional); anything else is undefined. */
export function fromB64(text: string): Uint8Array | undefined {
  const clean = text.replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1) return undefined;
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    buf = (buf << 6) | ALPHA.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 255);
    }
  }
  return new Uint8Array(out);
}

export const toB64Url = (bytes: Uint8Array): string => toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function fromB64Url(text: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return undefined;
  return fromB64(text.replace(/-/g, "+").replace(/_/g, "/"));
}

export const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
export const fromUtf8 = (b: Uint8Array): string => new TextDecoder("utf-8", { fatal: true }).decode(b);

/** A fresh ArrayBuffer copy (WebCrypto wants a BufferSource that is exactly the bytes). */
export const buf = (b: Uint8Array): ArrayBuffer => b.slice().buffer as ArrayBuffer;

export const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
