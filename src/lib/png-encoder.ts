// Tiny pure-JS PNG encoder for raw pixel data (RGB or RGBA) extracted from a
// PDF via unpdf. Runs on the Cloudflare Worker runtime (no native canvas).

import { deflate } from "pako";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (~c) >>> 0;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const a of arrays) n += a.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const a of arrays) { out.set(a, o); o += a.length; }
  return out;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = (n >>> 24) & 0xff;
  b[1] = (n >>> 16) & 0xff;
  b[2] = (n >>> 8) & 0xff;
  b[3] = n & 0xff;
  return b;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) typeBytes[i] = type.charCodeAt(i);
  const crc = crc32(concat(typeBytes, data));
  return concat(u32(data.length), typeBytes, data, u32(crc));
}

/**
 * Encode a raw RGB or RGBA pixel buffer to a PNG byte array.
 * channels: 3 (RGB) or 4 (RGBA); anything else is treated as RGB.
 */
export function encodePNG(width: number, height: number, pixels: Uint8Array, channels: number): Uint8Array {
  const ch = channels === 4 ? 4 : 3;
  const rowLen = width * ch;
  const raw = new Uint8Array((rowLen + 1) * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    raw[pos++] = 0; // filter: none
    raw.set(pixels.subarray(y * rowLen, y * rowLen + rowLen), pos);
    pos += rowLen;
  }
  const compressed = deflate(raw, { level: 6 });

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = new Uint8Array(13);
  ihdrData.set(u32(width), 0);
  ihdrData.set(u32(height), 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = ch === 4 ? 6 : 2; // color type
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  return concat(sig, chunk("IHDR", ihdrData), chunk("IDAT", compressed), chunk("IEND", new Uint8Array(0)));
}

/** Convert a Uint8Array to a base64 string (Cloudflare-Worker safe). */
export function toBase64(bytes: Uint8Array): string {
  // Buffer is available in the Worker runtime with nodejs_compat.
  return Buffer.from(bytes).toString("base64");
}
