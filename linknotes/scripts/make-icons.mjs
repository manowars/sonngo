#!/usr/bin/env node
// Generates the PWA / launcher icons with no image dependencies:
// a rounded gradient tile with a white bookmark glyph, written as raw PNG.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'icons');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function writePng(path, size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
}

const A = [0x2d, 0xd4, 0xbf]; // teal
const B = [0x4f, 0x46, 0xe5]; // indigo

// All shape tests take normalized coords in [0,1] and return coverage 0..1.
function roundedRect(u, v, radius) {
  const dx = Math.max(radius - u, u - (1 - radius), 0);
  const dy = Math.max(radius - v, v - (1 - radius), 0);
  if (dx === 0 || dy === 0) return u >= 0 && u <= 1 && v >= 0 && v <= 1;
  return Math.hypot(dx, dy) <= radius;
}

function bookmark(u, v, scale) {
  // Re-center the glyph so `scale` shrinks it about the tile centre.
  const cu = (u - 0.5) / scale + 0.5;
  const cv = (v - 0.5) / scale + 0.5;
  const left = 0.33, right = 0.67, top = 0.20, bottom = 0.80;
  if (cu < left || cu > right || cv < top || cv > bottom) return false;
  const notchTop = 0.57;
  if (cv >= notchTop) {
    const half = 0.17 * ((cv - notchTop) / (bottom - notchTop));
    if (Math.abs(cu - 0.5) <= half) return false;
  }
  return true;
}

function build(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 3; // supersampling for smooth edges
  const radius = maskable ? 0 : 0.21;
  const glyphScale = maskable ? 0.76 : 1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          if (roundedRect(u, v, radius)) {
            bg += 1;
            if (bookmark(u, v, glyphScale)) fg += 1;
          }
        }
      }
      const n = SS * SS;
      const alpha = bg / n;
      const glyph = fg / n;
      const t = (x / size) * 0.35 + (y / size) * 0.65;
      const base = [0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * t));
      const mix = (c) => Math.round(c * (1 - glyph) + 255 * glyph);
      const o = (y * size + x) * 4;
      buf[o] = mix(base[0]);
      buf[o + 1] = mix(base[1]);
      buf[o + 2] = mix(base[2]);
      buf[o + 3] = Math.round(alpha * 255);
    }
  }
  return buf;
}

mkdirSync(OUT, { recursive: true });
for (const [name, size, opts] of [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
]) {
  writePng(join(OUT, name), size, build(size, opts));
  console.log(`wrote icons/${name}`);
}
