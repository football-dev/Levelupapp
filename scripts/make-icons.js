// Generates the PNG app icons with no dependencies (raw PNG encoding via zlib).
// Draws the same shape as icons/icon.svg: green rounded tile, brown border,
// yellow up-arrow. Run: npm run icons
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(OUT, { recursive: true });

const GREEN = [0x8f, 0xd1, 0x4f], BROWN = [0x5c, 0x40, 0x33], YELLOW = [0xff, 0xc9, 0x3c], SKY = [0x7e, 0xc8, 0xe3];

// --- geometry helpers (all in a 512-unit design space) ----------------------
function roundedRectSDF(x, y, cx, cy, hw, hh, r) {
  const dx = Math.abs(x - cx) - (hw - r);
  const dy = Math.abs(y - cy) - (hh - r);
  const ox = Math.max(dx, 0), oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r;
}
const ARROW = [[256, 96], [416, 256], [336, 256], [336, 416], [176, 416], [176, 256], [96, 256]];
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToSegment(px, py, ax, ay, bx, by) {
  const l2 = (bx - ax) ** 2 + (by - ay) ** 2;
  let t = l2 === 0 ? 0 : ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
}
function distToPoly(x, y, poly) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    d = Math.min(d, distToSegment(x, y, ax, ay, bx, by));
  }
  return d;
}

/** Colour at a design-space point; null = transparent. */
function sample(x, y, { maskable }) {
  if (maskable) {
    // Maskable icons must fill the whole square; keep art inside the safe zone.
    const s = 0.8, off = (512 - 512 * s) / 2;
    const sx = (x - off) / s, sy = (y - off) / s;
    return shape(sx, sy, true);
  }
  return shape(x, y, false);
}
function shape(x, y, fillBg) {
  const tile = roundedRectSDF(x, y, 256, 256, 240, 240, 112);
  const arrowD = distToPoly(x, y, ARROW);
  const inArrow = pointInPoly(x, y, ARROW);
  if (tile <= 0) {
    if (inArrow && arrowD > 12) return YELLOW;
    if (inArrow || arrowD <= 12) return BROWN;
    if (tile > -28) return BROWN;
    return GREEN;
  }
  return fillBg ? SKY : null;
}

function render(size, opts) {
  const SS = 3; // supersampling for anti-aliasing
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const dx = ((x + (sx + 0.5) / SS) / size) * 512;
          const dy = ((y + (sy + 0.5) / SS) / size) * 512;
          const c = sample(dx, dy, opts);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
        }
      }
      const n = SS * SS, i = (y * size + x) * 4;
      const cov = a / 255;
      px[i] = cov ? r / cov : 0; px[i + 1] = cov ? g / cov : 0; px[i + 2] = cov ? b / cov : 0; px[i + 3] = a / n;
    }
  }
  return px;
}

// --- PNG encoding -----------------------------------------------------------
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const jobs = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: true }], // iOS squares the icon itself, so fill the background
];
for (const [name, size, opts] of jobs) {
  writeFileSync(join(OUT, name), encodePNG(size, render(size, opts)));
  console.log('wrote', name);
}
