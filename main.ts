// gta6-meme-x-01 v3 — deterministic GTA 6 meme generator.
//
// Node 22, standard library only. Draws one 1024x1024 PNG from scratch:
// a synthwave Vice City sunset, the make.fun ghost holding its magenta
// star coin, a calendar gag about waiting since 2013, and the caption.
// No clock, no network, no entropy beyond a fixed-seed LCG — two runs
// write byte-identical output. Also copies POST.json to the output dir.

import { deflateSync } from "node:zlib";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;
const HORIZON = 700;
const px = new Uint8Array(W * H * 3);

// ---------- deterministic PRNG (fixed-seed LCG) ----------
let lcgState = 0x2f6e2b1;
function rnd() {
  lcgState = (lcgState * 1103515245 + 12345) & 0x7fffffff;
  return lcgState / 0x7fffffff;
}

// ---------- raster primitives ----------
function blend(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 3;
  if (a >= 1) {
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    return;
  }
  px[i] = Math.round(px[i] * (1 - a) + r * a);
  px[i + 1] = Math.round(px[i + 1] * (1 - a) + g * a);
  px[i + 2] = Math.round(px[i + 2] * (1 - a) + b * a);
}

function fillRect(x, y, w, h, [r, g, b], a = 1) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++)
    for (let xx = x0; xx < x1; xx++) blend(xx, yy, r, g, b, a);
}

function fillCircle(cx, cy, rad, [r, g, b], a = 1) {
  const x0 = Math.floor(cx - rad);
  const x1 = Math.ceil(cx + rad);
  const y0 = Math.floor(cy - rad);
  const y1 = Math.ceil(cy + rad);
  for (let yy = y0; yy <= y1; yy++)
    for (let xx = x0; xx <= x1; xx++) {
      const dx = xx - cx;
      const dy = yy - cy;
      if (dx * dx + dy * dy <= rad * rad) blend(xx, yy, r, g, b, a);
    }
}

function fillEllipse(cx, cy, rx, ry, [r, g, b], a = 1) {
  const x0 = Math.floor(cx - rx);
  const x1 = Math.ceil(cx + rx);
  const y0 = Math.floor(cy - ry);
  const y1 = Math.ceil(cy + ry);
  for (let yy = y0; yy <= y1; yy++)
    for (let xx = x0; xx <= x1; xx++) {
      const dx = (xx - cx) / rx;
      const dy = (yy - cy) / ry;
      if (dx * dx + dy * dy <= 1) blend(xx, yy, r, g, b, a);
    }
}

function thickLine(x0, y0, x1, y1, th, color, a = 1) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    fillCircle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, th / 2, color, a);
  }
}

function fillPoly(points, [r, g, b], a = 1) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let yy = Math.floor(minY); yy <= Math.ceil(maxY); yy++) {
    for (let xx = Math.floor(minX); xx <= Math.ceil(maxX); xx++) {
      // ray-cast point-in-polygon
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if (
          yi > yy !== yj > yy &&
          xx < ((xj - xi) * (yy - yi)) / (yj - yi) + xi
        )
          inside = !inside;
      }
      if (inside) blend(xx, yy, r, g, b, a);
    }
  }
}

function starPoints(cx, cy, outer, inner) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
  }
  return pts;
}

function sparklePoints(cx, cy, s) {
  const k = 0.2;
  return [
    [cx, cy - s],
    [cx + s * k, cy - s * k],
    [cx + s, cy],
    [cx + s * k, cy + s * k],
    [cx, cy + s],
    [cx - s * k, cy + s * k],
    [cx - s, cy],
    [cx - s * k, cy - s * k],
  ];
}

// ---------- 5x7 pixel font ----------
const FONT = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "01010", "00100", "00100", "00100", "01010", "10001"],
  Y: ["10001", "01010", "00100", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  ",": ["00000", "00000", "00000", "00000", "00100", "00100", "01000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function textWidth(text, scale, gap = scale) {
  if (text.length === 0) return 0;
  return text.length * (5 * scale + gap) - gap;
}

function plainText(text, x, y, scale, [r, g, b], a = 1, gap = scale) {
  let cx = x;
  for (const ch of text) {
    const glyph = FONT[ch] || FONT[" "];
    for (let row = 0; row < 7; row++)
      for (let col = 0; col < 5; col++)
        if (glyph[row][col] === "1")
          fillRect(cx + col * scale, y + row * scale, scale, scale, [r, g, b], a);
    cx += 5 * scale + gap;
  }
}

// Bold caption: dark outline stamped in 8 directions, white on top.
function captionText(text, y, scale, gap = scale) {
  const w = textWidth(text, scale, gap);
  const x = Math.round((W - w) / 2);
  const o = Math.max(2, Math.round(scale * 0.4));
  const dark = [26, 10, 44];
  for (const [dx, dy] of [
    [-o, 0],
    [o, 0],
    [0, -o],
    [0, o],
    [-o, -o],
    [o, -o],
    [-o, o],
    [o, o],
  ])
    plainText(text, x + dx, y + dy, scale, dark, 1, gap);
  plainText(text, x, y, scale, [255, 255, 255], 1, gap);
}

// ---------- sky, stars, sun ----------
function skyColorAt(y) {
  const t = Math.min(1, y / HORIZON);
  const c1 = [43, 10, 92];
  const c2 = [176, 34, 128];
  const c3 = [255, 120, 44];
  const mix = (u, v, k) => Math.round(u + (v - u) * k);
  if (t < 0.5) {
    const k = t / 0.5;
    return [mix(c1[0], c2[0], k), mix(c1[1], c2[1], k), mix(c1[2], c2[2], k)];
  }
  const k = (t - 0.5) / 0.5;
  return [mix(c2[0], c3[0], k), mix(c2[1], c3[1], k), mix(c2[2], c3[2], k)];
}

for (let y = 0; y < H; y++) {
  const c = y < HORIZON ? skyColorAt(y) : [18, 5, 38];
  fillRect(0, y, W, 1, c, 1);
}

// faint stars in the upper sky
for (let i = 0; i < 150; i++) {
  const sx = Math.floor(rnd() * W);
  const sy = Math.floor(rnd() * 400);
  const s = rnd() < 0.25 ? 2 : 1;
  fillRect(sx, sy, s, s, [255, 240, 255], 0.25 + rnd() * 0.5);
}

// big low sun with retro stripe cuts, clipped at the horizon
{
  const sunCx = 512;
  const sunCy = 618;
  const sunR = 178;
  for (let yy = sunCy - sunR; yy < Math.min(sunCy + sunR, HORIZON); yy++) {
    for (let xx = sunCx - sunR; xx <= sunCx + sunR; xx++) {
      const dx = xx - sunCx;
      const dy = yy - sunCy;
      if (dx * dx + dy * dy > sunR * sunR) continue;
      if (dy > 30) {
        const band = Math.floor((dy - 30) / 22);
        const cut = 3 + band * 3;
        if ((dy - 30) % 22 < cut) continue; // stripe gap: sky shows through
      }
      const t = (yy - (sunCy - sunR)) / (2 * sunR);
      blend(xx, yy, 255, Math.round(198 - 98 * t), Math.round(86 - 32 * t), 1);
    }
  }
}

// ---------- skyline silhouette with lit windows ----------
{
  const buildings = [];
  let bx = -12;
  while (bx < W + 10) {
    const bw = 52 + Math.floor(rnd() * 66);
    const btop = 486 + Math.floor(rnd() * 168);
    buildings.push([bx, btop, bw]);
    bx += bw + 5 + Math.floor(rnd() * 16);
  }
  for (const [x, top, w] of buildings) {
    fillRect(x, top, w, HORIZON - top, [23, 9, 43], 1);
    for (let wy = top + 12; wy < HORIZON - 12; wy += 15)
      for (let wx = x + 7; wx < x + w - 8; wx += 13)
        if (rnd() < 0.34) fillRect(wx, wy, 5, 7, [255, 198, 96], 0.92);
  }
}

// ---------- glowing retro grid on the ground ----------
for (let gi = -9; gi <= 9; gi++)
  thickLine(512, HORIZON, 512 + gi * 168, H, 2, [255, 43, 214], 0.42);
for (let i = 1; i <= 15; i++) {
  const gy = HORIZON + Math.round(Math.pow(i, 1.55) * 4.4);
  if (gy >= H) break;
  fillRect(0, gy, W, 2, [255, 43, 214], 0.3 + Math.min(0.35, i * 0.024));
}

// ---------- palm silhouettes ----------
function palm(baseX, baseY, topX, topY, dir) {
  const col = [13, 5, 27];
  const mx = (baseX + topX) / 2 + dir * 26;
  const my = (baseY + topY) / 2;
  for (let s = 0; s <= 24; s++) {
    const t = s / 24;
    const x = (1 - t) * (1 - t) * baseX + 2 * (1 - t) * t * mx + t * t * topX;
    const y = (1 - t) * (1 - t) * baseY + 2 * (1 - t) * t * my + t * t * topY;
    fillCircle(x, y, 15 - 8 * t, col, 1);
  }
  fillCircle(topX - 8, topY + 9, 8, col, 1);
  fillCircle(topX + 9, topY + 11, 7, col, 1);
  for (let f = 0; f < 7; f++) {
    const ang = Math.PI * (1.06 + 0.88 * (f / 6));
    const len = 118;
    let prevX = topX;
    let prevY = topY;
    for (let s = 1; s <= 10; s++) {
      const d = (len * s) / 10;
      const droop = 62 * Math.pow(s / 10, 2);
      const x = topX + Math.cos(ang) * d;
      const y = topY + Math.sin(ang) * d + droop;
      thickLine(prevX, prevY, x, y, 5, col, 1);
      prevX = x;
      prevY = y;
    }
  }
}
palm(70, 714, 152, 402, 1);
palm(954, 710, 872, 394, -1);

// ---------- calendar gag prop ----------
function calendarPage(x, y, w, h, year, crossed) {
  fillRect(x + 5, y + 6, w, h, [10, 4, 24], 0.35); // shadow
  fillRect(x, y, w, h, [246, 246, 249], 1);
  fillRect(x, y, w, 26, [214, 48, 64], 1); // red header band
  fillCircle(x + 26, y + 13, 5, [60, 20, 40], 1); // binder holes
  fillCircle(x + w - 26, y + 13, 5, [60, 20, 40], 1);
  const tw = textWidth(year, 7);
  plainText(year, x + (w - tw) / 2, y + 52, 7, [38, 32, 58], 1);
  if (crossed) {
    thickLine(x + 10, y + 40, x + w - 10, y + h - 12, 7, [220, 40, 60], 0.85);
    thickLine(x + 10, y + h - 12, x + w - 10, y + 40, 7, [220, 40, 60], 0.85);
  }
}
calendarPage(56, 560, 210, 158, "2013", true);
calendarPage(150, 668, 200, 152, "2026", false);
plainText("STILL WAITING", 150 + (200 - textWidth("STILL WAITING", 2)) / 2, 668 + 122, 2, [110, 104, 130], 1);

// ---------- the make.fun ghost ----------
// soft shadow under the ghost
fillEllipse(512, 888, 150, 16, [0, 0, 0], 0.3);

// arm reaching up to the coin (drawn before the body so the shoulder hides)
thickLine(608, 662, 698, 526, 42, [150, 140, 190], 1);
thickLine(608, 662, 698, 526, 33, [244, 242, 252], 1);

// body: half-ellipse head, straight sides, wavy hem; lavender shading
{
  const cx = 512;
  const halfW = 148;
  const headCy = 642;
  const headRy = 172;
  const sideBottom = 846;
  for (let x = cx - halfW; x <= cx + halfW; x++) {
    const dxn = (x - cx) / halfW;
    const topEdge = Math.round(
      headCy - headRy * Math.sqrt(Math.max(0, 1 - dxn * dxn)),
    );
    const botEdge = Math.round(
      sideBottom +
        13 * Math.sin((((x - (cx - halfW)) / (2 * halfW)) * Math.PI * 5)),
    );
    const t = (x - (cx - halfW)) / (2 * halfW);
    for (let y = topEdge; y <= botEdge; y++) {
      const v = (y - topEdge) / Math.max(1, botEdge - topEdge);
      const a = 0.34 * t + 0.08 * v;
      blend(
        x,
        y,
        Math.round(247 + (199 - 247) * a),
        Math.round(245 + (186 - 245) * a),
        Math.round(253 + (233 - 253) * a),
        1,
      );
    }
  }
}

// face: dark oval eyes with highlights, a small smile, pink blush
fillEllipse(463, 690, 13, 19, [34, 27, 52], 1);
fillEllipse(561, 690, 13, 19, [34, 27, 52], 1);
fillCircle(459, 683, 3.5, [255, 255, 255], 0.9);
fillCircle(557, 683, 3.5, [255, 255, 255], 0.9);
for (let s = 0; s <= 12; s++) {
  const th = Math.PI * (0.18 + 0.64 * (s / 12));
  fillCircle(512 + Math.cos(th) * 21, 714 + Math.sin(th) * 15, 3.2, [34, 27, 52], 1);
}
fillEllipse(420, 724, 20, 10, [255, 148, 178], 0.5);
fillEllipse(604, 724, 20, 10, [255, 148, 178], 0.5);

// glowing magenta coin with a cream star, plus sparkles
fillCircle(716, 460, 76, [255, 64, 190], 0.2);
fillCircle(716, 460, 66, [255, 64, 190], 0.2);
fillCircle(716, 460, 56, [240, 45, 170], 1);
fillCircle(716, 460, 46, [248, 84, 190], 1);
fillPoly(starPoints(716, 460, 30, 13), [255, 241, 205], 1);
fillPoly(sparklePoints(636, 388, 17), [255, 255, 255], 0.95);
fillPoly(sparklePoints(798, 396, 12), [255, 255, 255], 0.9);
fillPoly(sparklePoints(790, 548, 10), [255, 220, 245], 0.85);

// ---------- captions ----------
captionText("WAITING FOR GTA 6", 34, 9);
captionText("SINCE I WAS 15", 117, 9);
captionText("NOW I'M 28, WITH A KID AND BILLS", 908, 5, 3);
captionText("MY AGENT EARNS ON MAKE.FUN INSTEAD", 957, 5, 3);

// ---------- PNG encoding (own encoder, zlib deflate) ----------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++)
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++)
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0; // filter: none
  Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type: truecolor RGB
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

// ---------- output ----------
const botDir = process.env.MAKEFUN_BOT_DIR || ".";
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "out";
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "meme.png"), png);
copyFileSync(join(botDir, "POST.json"), join(outDir, "POST.json"));
