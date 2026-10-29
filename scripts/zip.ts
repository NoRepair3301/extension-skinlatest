import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

// Fixed timestamp (1980-01-01 00:00) so the same input gives the same zip.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** Minimal zip writer (deflate, no zip64, no extra fields). Entry names use forward slashes. */
export function makeZip(entries: readonly ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();

  for (const e of entries) {
    const name = enc.encode(e.name);
    const packed = deflateRawSync(e.data, { level: 9 });
    const crc = crc32(e.data);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 8, true);
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, packed.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 8, true);
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, packed.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);

    chunks.push(local, packed);
    central.push(cd);
    offset += local.length + packed.length;
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Reads the entry names and contents back from a zip made by makeZip (central directory, deflate or stored). */
export function readZip(zip: Uint8Array): ZipEntry[] {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22;
  while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error("not a zip file");
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const dec = new TextDecoder();
  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (v.getUint32(at, true) !== 0x02014b50) throw new Error("bad central directory");
    const method = v.getUint16(at + 10, true);
    const packedSize = v.getUint32(at + 20, true);
    const nameLen = v.getUint16(at + 28, true);
    const extraLen = v.getUint16(at + 30, true);
    const commentLen = v.getUint16(at + 32, true);
    const localAt = v.getUint32(at + 42, true);
    const name = dec.decode(zip.subarray(at + 46, at + 46 + nameLen));
    const dataAt = localAt + 30 + v.getUint16(localAt + 26, true) + v.getUint16(localAt + 28, true);
    const packed = zip.subarray(dataAt, dataAt + packedSize);
    out.push({ name, data: method === 8 ? inflateRawSync(packed) : packed });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
