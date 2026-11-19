// gta6-meme-x-01 v3 — deterministic GTA 6 meme generator.
// Node standard library only. Draws a 1024x1024 PNG from scratch
// (own rasterizer + own PNG encoder) and copies POST.json to the output dir.
// Env: MAKEFUN_BOT_DIR (repo dir, default "."), MAKEFUN_OUTPUT_DIR (default "out").

import { deflateSync } from "node:zlib";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;
const img = new Float32Array(W * H * 3);

// ---------- deterministic PRNG (fixed seed, no Math.random) ----------
let lcgState = 123456789;
function rnd() {
  lcgState = (lcgState * 1103515245 + 12345) % 2147483648;
  return lcgState / 2147483648;
}

// ---------- pixel helpers ----------
function px(x, y, c, a) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 3;
  const ia = 1 - a;
  img[i] = img[i] * ia + c[0] * a;
  img[i + 1] = img[i + 1] * ia + c[1] * a;
  img[i + 2] = img[i + 2] * ia + c[2] * a;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function lerpColor(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}
function fillRect(x0, y0, w, h, c, a) {
  for (let y = Math.floor(y0); y < y0 + h; y++)
    for (let x = Math.floor(x0); x < x0 + w; x++) px(x, y, c, a);
}
function fillCircle(cx, cy, r, c, a) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r * r) px(x, y, c, a);
    }
}
function fillEllipse(cx, cy, rx, ry, c, a) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) px(x, y, c, a);
    }
}
function distSeg(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((x - x1) * dx + (y - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const ex = x1 + t * dx - x, ey = y1 + t * dy - y;
  return Math.sqrt(ex * ex + ey * ey);
}
function thickLine(x1, y1, x2, y2, w, c, a) {
  const r = w / 2;
  const x0 = Math.floor(Math.min(x1, x2) - r - 1), x1b = Math.ceil(Math.max(x1, x2) + r + 1);
  const y0 = Math.floor(Math.min(y1, y2) - r - 1), y1b = Math.ceil(Math.max(y1, y2) + r + 1);
  for (let y = y0; y <= y1b; y++)
    for (let x = x0; x <= x1b; x++) if (distSeg(x, y, x1, y1, x2, y2) <= r) px(x, y, c, a);
}
function quadPoints(p0, p1, p2, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ]);
  }
  return pts;
}
function drawCurve(pts, w0, w1, c, a) {
  for (let i = 0; i < pts.length - 1; i++) {
    const w = lerp(w0, w1, i / (pts.length - 1));
    thickLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, c, a);
  }
}
function fillPoly(pts, c, a) {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  for (let y = Math.floor(minY); y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
      if ((p1[1] <= y && p2[1] > y) || (p2[1] <= y && p1[1] > y))
        xs.push(p1[0] + ((y - p1[1]) / (p2[1] - p1[1])) * (p2[0] - p1[0]));
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2)
      for (let x = Math.floor(xs[i]); x <= xs[i + 1]; x++) px(x, y, c, a);
  }
}
function starPoints(cx, cy, rOuter, rInner, rot) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const ang = rot + (i * Math.PI) / 5;
    pts.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
  }
  return pts;
}

// ---------- 5x7 bitmap font (own design) ----------
const FONT = {
  A: ".###./#...#/#...#/#####/#...#/#...#/#...#",
  B: "####./#...#/#...#/####./#...#/#...#/####.",
  C: ".####/#..../#..../#..../#..../#..../.####",
  D: "####./#...#/#...#/#...#/#...#/#...#/####.",
  E: "#####/#..../#..../####./#..../#..../#####",
  F: "#####/#..../#..../####./#..../#..../#....",
  G: ".####/#..../#..../#.###/#...#/#...#/.###.",
  H: "#...#/#...#/#...#/#####/#...#/#...#/#...#",
  I: "#####/..#../..#../..#../..#../..#../#####",
  J: "..###/...#./...#./...#./...#./#..#./.##..",
  K: "#...#/#..#./#.#../##.../#.#../#..#./#...#",
  L: "#..../#..../#..../#..../#..../#..../#####",
  M: "#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#",
  N: "#...#/##..#/#.#.#/#..##/#...#/#...#/#...#",
  O: ".###./#...#/#...#/#...#/#...#/#...#/.###.",
  P: "####./#...#/#...#/####./#..../#..../#....",
  Q: ".###./#...#/#...#/#...#/#.#.#/#..#./.##.#",
  R: "####./#...#/#...#/####./#.#../#..#./#...#",
  S: ".####/#..../#..../.###./....#/....#/####.",
  T: "#####/..#../..#../..#../..#../..#../..#..",
  U: "#...#/#...#/#...#/#...#/#...#/#...#/.###.",
  V: "#...#/#...#/#...#/#...#/#...#/.#.#./..#..",
  W: "#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#",
  X: "#...#/.#.#./..#../..#../..#../.#.#./#...#",
  Y: "#...#/#...#/.#.#./..#../..#../..#../..#..",
  Z: "#####/....#/...#./..#../.#.../#..../#####",
  "0": ".###./#...#/#..##/#.#.#/##..#/#...#/.###.",
  "1": "..#../.##../..#../..#../..#../..#../#####",
  "2": ".###./#...#/....#/..##./.#.../#..../#####",
  "3": ".###./#...#/....#/..##./....#/#...#/.###.",
  "4": "...#./..##./.#.#./#..#./#####/...#./...#.",
  "5": "#####/#..../####./....#/....#/#...#/.###.",
  "6": ".###./#..../#..../####./#...#/#...#/.###.",
  "7": "#####/....#/...#./..#../.#.../.#.../.#...",
  "8": ".###./#...#/#...#/.###./#...#/#...#/.###.",
  "9": ".###./#...#/#...#/.####/....#/....#/.###.",
  " ": "...../...../...../...../...../...../.....",
  "'": "..#../..#../.#.../...../...../...../.....",
  ",": "...../...../...../...../.##../.##../.#...",
  ".": "...../...../...../...../...../.##../.##..",
  "!": "..#../..#../..#../..#../..#../...../..#..",
  "-": "...../...../...../#####/...../...../.....",
};
function textMask(text, scale) {
  const w = text.length === 0 ? 0 : text.length * 6 * scale - scale;
  const h = 7 * scale;
  const mask = new Uint8Array(w * h);
  for (let ci = 0; ci < text.length; ci++) {
    const glyph = (FONT[text[ci]] || FONT[" "]).split("/");
    for (let gy = 0; gy < 7; gy++)
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] !== "#") continue;
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) {
            const x = ci * 6 * scale + gx * scale + sx;
            const y = gy * scale + sy;
            mask[y * w + x] = 1;
          }
      }
  }
  return { mask, w, h };
}
function blitMask(mask, w, h, ox, oy, c, a) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (mask[y * w + x]) px(ox + x, oy + y, c, a);
}
function dilate(mask, w, h, r) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h) out[ny * w + nx] = 1;
        }
    }
  return out;
}
// Bold caption: dark outline + soft shadow + white fill, horizontally centered.
function caption(text, centerX, y, scale) {
  const { mask, w, h } = textMask(text, scale);
  const r = Math.max(2, scale - 1);
  const pad = r + 5;
  const pw = w + pad * 2, ph = h + pad * 2;
  const padded = new Uint8Array(pw * ph);
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++)
      if (mask[yy * w + xx]) padded[(yy + pad) * pw + (xx + pad)] = 1;
  const outline = dilate(padded, pw, ph, r);
  const ox = Math.round(centerX - pw / 2), oy = y - pad;
  blitMask(outline, pw, ph, ox + 3, oy + 4, [10, 4, 24], 0.45);
  blitMask(outline, pw, ph, ox, oy, [26, 10, 44], 1);
  blitMask(padded, pw, ph, ox, oy, [255, 255, 255], 1);
}
// Plain small text (no outline), left-aligned at x,y.
function plainText(text, x, y, scale, c, a) {
  const { mask, w, h } = textMask(text, scale);
  blitMask(mask, w, h, Math.round(x), Math.round(y), c, a);
}
function textWidth(text, scale) {
  return text.length === 0 ? 0 : text.length * 6 * scale - scale;
}

// ---------- scene ----------
const HORIZON = 668;

// Sky gradient
const skyStops = [
  [0, [38, 8, 74]],
  [0.35, [112, 20, 110]],
  [0.55, [196, 44, 128]],
  [0.75, [244, 92, 132]],
  [1, [255, 158, 64]],
];
for (let y = 0; y < HORIZON; y++) {
  const t = y / HORIZON;
  let c = skyStops[skyStops.length - 1][1];
  for (let s = 0; s < skyStops.length - 1; s++) {
    if (t >= skyStops[s][0] && t <= skyStops[s + 1][0]) {
      c = lerpColor(skyStops[s][1], skyStops[s + 1][1], (t - skyStops[s][0]) / (skyStops[s + 1][0] - skyStops[s][0]));
      break;
    }
  }
  for (let x = 0; x < W; x++) px(x, y, c, 1);
}

// Stars in the upper sky (skip the sun disc area)
const SUN = { x: 512, y: 600, r: 180 };
for (let i = 0; i < 110; i++) {
  const sx = Math.floor(rnd() * W);
  const sy = Math.floor(rnd() * 420);
  const dx = sx - SUN.x, dy = sy - SUN.y;
  if (dx * dx + dy * dy < (SUN.r + 12) * (SUN.r + 12)) continue;
  const a = 0.25 + rnd() * 0.45;
  px(sx, sy, [255, 240, 250], a);
  if (rnd() < 0.3) px(sx + 1, sy, [255, 240, 250], a * 0.7);
}

// Sun disc with retro stripe cuts in its lower half
for (let y = SUN.y - SUN.r; y <= SUN.y + SUN.r; y++)
  for (let x = SUN.x - SUN.r; x <= SUN.x + SUN.r; x++) {
    const dx = x - SUN.x, dy = y - SUN.y;
    if (dx * dx + dy * dy > SUN.r * SUN.r) continue;
    const t = (y - (SUN.y - SUN.r)) / (2 * SUN.r);
    let c = lerpColor([255, 214, 92], [255, 96, 120], t);
    if (y > 636) {
      const tt = y - 636;
      if (tt % 26 < 4 + tt / 14) c = lerpColor(c, [150, 30, 96], 0.55);
    }
    px(x, y, c, 1);
  }

// City skyline silhouette with lit windows
let bx = -8;
while (bx < W) {
  const bw = 34 + rnd() * 54;
  const bh = 50 + rnd() * 150;
  const top = HORIZON - bh;
  fillRect(bx, top, bw, bh, [24, 7, 44], 1);
  if (rnd() < 0.4) thickLine(bx + bw / 2, top, bx + bw / 2, top - 14, 3, [24, 7, 44], 1);
  const cols = Math.floor(bw / 11), rows = Math.floor(bh / 15);
  for (let cxI = 0; cxI < cols; cxI++)
    for (let cyI = 0; cyI < rows; cyI++)
      if (rnd() < 0.42)
        fillRect(bx + 4 + cxI * 11, top + 6 + cyI * 15, 4, 6, [255, 196, 92], 0.85);
  bx += bw + 2 + rnd() * 8;
}

// Ground plane
for (let y = HORIZON; y < H; y++) {
  const c = lerpColor([30, 8, 52], [8, 2, 20], (y - HORIZON) / (H - HORIZON));
  for (let x = 0; x < W; x++) px(x, y, c, 1);
}
// Horizon glow
for (let i = 0; i < 10; i++) fillRect(0, HORIZON - 4 + i, W, 1, [255, 110, 190], 0.16 * (1 - i / 10));
// Retro grid: horizontal lines (perspective spacing)
for (const d of [8, 20, 36, 58, 88, 126, 174, 234, 306]) {
  const y = HORIZON + d;
  if (y < H) fillRect(0, y, W, 2, [255, 80, 200], 0.4);
}
// Retro grid: vertical lines fanning from the vanishing point
for (let gx = -512; gx <= 1536; gx += 128)
  thickLine(512, HORIZON, gx, H, 2, [255, 80, 200], 0.32);

// Subtle scanlines over the background
for (let y = 3; y < H; y += 4) fillRect(0, y, W, 1, [0, 0, 0], 0.05);

// Palm trees (silhouettes)
function palm(baseX, baseY, crownX, crownY, flip) {
  const ctrl = [(baseX + crownX) / 2 - 10 * flip, (baseY + crownY) / 2];
  drawCurve(quadPoints([baseX, baseY], ctrl, [crownX, crownY], 20), 15, 8, [16, 4, 30], 1);
  const ends = [
    [-110, -70], [-80, -100], [-30, -114], [30, -110], [86, -88], [112, -52], [96, -8],
  ];
  for (const [ex, ey] of ends) {
    const end = [crownX + ex * flip, crownY + ey];
    const mid = [(crownX + end[0]) / 2, Math.min(crownY, end[1]) - 40];
    drawCurve(quadPoints([crownX, crownY], mid, end, 14), 6, 2, [16, 4, 30], 1);
  }
  fillCircle(crownX - 8, crownY + 10, 9, [16, 4, 30], 1);
  fillCircle(crownX + 10, crownY + 12, 8, [16, 4, 30], 1);
}
palm(70, 712, 150, 400, 1);
palm(954, 712, 874, 392, -1);

// Calendar gag prop: a 2013 page crossed out behind a 2026 page
function calendarPage(x, y, w, h, year, crossed) {
  fillRect(x + 5, y + 6, w, h, [10, 4, 24], 0.35); // shadow
  fillRect(x, y, w, h, [246, 246, 249], 1);
  fillRect(x, y, w, 26, [214, 48, 64], 1);
  fillCircle(x + 26, y + 13, 5, [60, 20, 40], 1);
  fillCircle(x + w - 26, y + 13, 5, [60, 20, 40], 1);
  const tw = textWidth(year, 7);
  plainText(year, x + (w - tw) / 2, y + 52, 7, [38, 32, 58], 1);
  if (crossed) {
    thickLine(x + 10, y + 40, x + w - 10, y + h - 12, 7, [220, 40, 60], 0.85);
    thickLine(x + 10, y + h - 12, x + w - 10, y + 40, 7, [220, 40, 60], 0.85);
  }
}
calendarPage(92, 606, 200, 152, "2013", true);
calendarPage(122, 652, 200, 152, "2026", false);
plainText("STILL WAITING", 122 + (200 - textWidth("STILL WAITING", 2)) / 2, 652 + 122, 2, [110, 104, 130], 1);

// Soft shadow under the ghost
fillEllipse(512, 886, 150, 16, [0, 0, 0], 0.3);

// Ghost arm reaching up to the coin (drawn before the body)
thickLine(612, 664, 700, 524, 42, [150, 140, 190], 1);
thickLine(612, 664, 700, 524, 33, [244, 242, 252], 1);

// make.fun ghost mascot
const G = { cx: 512, top: 490, r: 128, bottom: 872 };
function ghostInside(x, y) {
  const domeCY = G.top + G.r;
  if (x < G.cx - G.r || x > G.cx + G.r || y < G.top || y > G.bottom) return false;
  if (y <= domeCY) {
    const dx = x - G.cx, dy = y - domeCY;
    return dx * dx + dy * dy <= G.r * G.r;
  }
  const phase = ((x - (G.cx - G.r)) / (2 * G.r)) * Math.PI * 6;
  const edge = G.bottom - 4 - 7 * (0.5 - 0.5 * Math.cos(phase));
  return y <= edge;
}
// outline (dilated mask)
for (let y = G.top - 5; y <= G.bottom + 5; y++)
  for (let x = G.cx - G.r - 5; x <= G.cx + G.r + 5; x++) {
    if (ghostInside(x, y)) continue;
    let near = false;
    for (let dy = -3; dy <= 3 && !near; dy++)
      for (let dx = -3; dx <= 3 && !near; dx++)
        if (ghostInside(x + dx, y + dy)) near = true;
    if (near) px(x, y, [150, 140, 190], 1);
  }
// body with soft vertical shading
for (let y = G.top; y <= G.bottom; y++)
  for (let x = G.cx - G.r; x <= G.cx + G.r; x++) {
    if (!ghostInside(x, y)) continue;
    const t = (y - G.top) / (G.bottom - G.top);
    px(x, y, lerpColor([255, 255, 255], [205, 199, 235], t), 1);
  }
// face: eyes, highlights, smile, blush — kept clear of all captions
fillEllipse(468, 642, 13, 19, [30, 24, 48], 1);
fillEllipse(556, 642, 13, 19, [30, 24, 48], 1);
fillCircle(464, 635, 4, [255, 255, 255], 1);
fillCircle(552, 635, 4, [255, 255, 255], 1);
{
  const smile = [];
  for (let i = 0; i <= 16; i++) {
    const ang = (Math.PI * (20 + (140 * i) / 16)) / 180;
    smile.push([512 + 26 * Math.cos(ang), 664 + 26 * Math.sin(ang)]);
  }
  drawCurve(smile, 5, 5, [30, 24, 48], 1);
}
fillEllipse(420, 684, 20, 10, [255, 130, 170], 0.35);
fillEllipse(604, 684, 20, 10, [255, 130, 170], 0.35);

// Glowing magenta star coin in the ghost's raised hand
const COIN = { x: 722, y: 472, r: 54 };
fillCircle(COIN.x, COIN.y, 96, [255, 64, 170], 0.1);
fillCircle(COIN.x, COIN.y, 78, [255, 64, 170], 0.14);
fillCircle(COIN.x, COIN.y, 64, [255, 64, 170], 0.18);
fillCircle(COIN.x, COIN.y, COIN.r, [200, 30, 130], 1);
fillCircle(COIN.x, COIN.y, COIN.r - 8, [255, 92, 190], 1);
fillPoly(starPoints(COIN.x, COIN.y, 30, 13, -Math.PI / 2), [255, 240, 200], 1);
fillPoly(starPoints(648, 408, 13, 5, -Math.PI / 2), [255, 255, 255], 0.85);
fillPoly(starPoints(800, 420, 10, 4, -Math.PI / 2), [255, 255, 255], 0.8);

// Captions (bold white, dark outline) — the aging punchline
caption("WAITING FOR GTA 6", 512, 40, 6);
caption("SINCE I WAS 15", 512, 98, 6);
caption("NOW I'M 28, WITH A KID AND BILLS", 512, 896, 4);
caption("MY AGENT EARNS ON MAKE.FUN INSTEAD", 512, 940, 4);

// ---------- PNG encoding (own encoder, zlib deflate) ----------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG() {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    const rowOff = y * (1 + W * 3);
    raw[rowOff] = 0; // filter: none
    for (let x = 0; x < W; x++) {
      const src = (y * W + x) * 3;
      const dst = rowOff + 1 + x * 3;
      raw[dst] = Math.max(0, Math.min(255, Math.round(img[src])));
      raw[dst + 1] = Math.max(0, Math.min(255, Math.round(img[src + 1])));
      raw[dst + 2] = Math.max(0, Math.min(255, Math.round(img[src + 2])));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

// ---------- main ----------
const botDir = process.env.MAKEFUN_BOT_DIR || ".";
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "out";
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "meme.png"), encodePNG());
copyFileSync(join(botDir, "POST.json"), join(outDir, "POST.json"));
console.log("wrote " + join(outDir, "meme.png") + " and " + join(outDir, "POST.json"));
