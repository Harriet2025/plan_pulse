// Builds the app colours people can pick in Settings → Appearance (blue, pink, purple, …), for light and dark.
//   node scripts/make-accents.mjs
// Writes:
//   src/accents.css                     every colour's tokens, for <html data-accent="…" data-theme="light|dark">
//   public/icons/<id>/*.png             the app icon in that colour (home screen, desktop app, browser tab)
//   public/manifest-<id>.webmanifest    the install file that points at those icons
// Blue is the original hand-tuned palette in src/index.css, and its icons stay in public/icons/, so it is not rebuilt.
//
// Each shade is found by searching lightness until it meets a contrast target, so every pairing the app uses keeps
// WCAG AA (4.5:1) for text, in both themes, whatever colour is picked. The script stops with an error if one does not.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// id, name, hue, saturation (0-1), and how much the greys lean toward the colour (0 = plain grey, 1 = like blue's)
export const ACCENTS = [
  { id: 'pink', name: 'Pink', h: 336, s: 0.68, tint: 0.8 },
  { id: 'purple', name: 'Purple', h: 258, s: 0.62, tint: 0.8 },
  { id: 'teal', name: 'Teal', h: 186, s: 0.8, tint: 0.7 },
  { id: 'green', name: 'Green', h: 140, s: 0.55, tint: 0.6 },
  { id: 'orange', name: 'Orange', h: 22, s: 0.88, tint: 0.7 },
  { id: 'brown', name: 'Brown', h: 24, s: 0.42, tint: 0.8 },
  { id: 'graphite', name: 'Graphite', h: 215, s: 0.12, tint: 0.35 },
];

// ---- colour maths -------------------------------------------------------------------------------------------
const hsl = (h, s, l) => {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
};
const lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const WHITE = [255, 255, 255];
/** The lightest shade (h, s) that still has `ratio` against `bg` (for dark shades under light text or on light bg). */
const darkest = (h, s, bg, ratio, start = 0.6) => { for (let l = start; l > 0; l -= 0.002) { const c = hsl(h, s, l); if (contrast(c, bg) >= ratio) return c; } throw new Error('no shade'); };
/** The darkest shade (h, s) that has `ratio` against a dark `bg`. */
const lightest = (h, s, bg, ratio, start = 0.4) => { for (let l = start; l < 1; l += 0.002) { const c = hsl(h, s, l); if (contrast(c, bg) >= ratio) return c; } throw new Error('no shade'); };
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const css = (c) => c.join(' ');

function palette(a) {
  const { h, s, tint } = a;
  const g = (sat) => sat * tint;   // saturation for the greys
  // Light theme
  const L = {
    ivory: hsl(h, g(0.33), 0.97), soft: WHITE, panel: hsl(h, g(0.35), 0.95), raised: hsl(h, g(0.32), 0.91), oat: hsl(h, g(0.3), 0.88),
    charcoal: hsl(h, g(0.27), 0.17), muted: hsl(h, g(0.19), 0.32), faint: hsl(h, g(0.16), 0.4),
  };
  L.rust = darkest(h, s, WHITE, 4.8, 0.55);
  L.btn = L.rust;
  L['rust-strong'] = darkest(h, s, WHITE, 7.0, 0.5);
  L['rust-dark'] = darkest(h, s, L.ivory, 7.0, 0.5);
  L.blush = darkest(h + 14, s * 0.9, WHITE, 4.6, 0.6);
  L['blush-dark'] = darkest(h + 14, s * 0.9, WHITE, 6.0, 0.6);
  L.deep = L.charcoal;
  L['hero-from'] = L.rust;
  L['hero-to'] = hsl(h, Math.min(s, 0.5) * 1, 0.2);
  L['tab-active'] = L.rust;
  // Dark theme
  const D = {
    ivory: hsl(h, g(0.13), 0.105), soft: hsl(h, g(0.15), 0.168), panel: hsl(h, g(0.15), 0.202), raised: hsl(h, g(0.15), 0.25), oat: hsl(h, g(0.14), 0.265),
    charcoal: hsl(h, g(0.25), 0.96), muted: hsl(h, g(0.16), 0.81), faint: hsl(h, g(0.14), 0.72),
  };
  D.rust = lightest(h, s, D.soft, 4.6, 0.45);
  D.btn = darkest(h, s, WHITE, 5.2, 0.6);
  D['rust-strong'] = darkest(h, s, WHITE, 6.4, 0.6);
  D['rust-dark'] = lightest(h, s * 0.85, D.soft, 6.8, 0.5);
  D.blush = lightest(h + 14, s * 0.85, D.soft, 7.5, 0.5);
  D['blush-dark'] = D.blush;
  D.deep = D.raised;
  D['hero-from'] = darkest(h, s * 0.9, WHITE, 7.0, 0.55);
  D['hero-to'] = hsl(h, g(0.18), 0.15);
  D['tab-active'] = lightest(h, s, D.soft, 5.5, 0.5);
  return { L, D };
}

// Every pair the app draws text with, and the contrast it needs
function check(id, theme, p) {
  const need = [
    ['charcoal', 'soft', 4.5], ['charcoal', 'ivory', 4.5], ['muted', 'soft', 4.5], ['muted', 'ivory', 4.5], ['muted', 'panel', 4.5],
    ['faint', 'soft', 4.5], ['faint', 'ivory', 4.5], ['rust-dark', 'soft', 4.5], ['rust-dark', 'ivory', 4.5], ['rust-dark', 'panel', 4.5],
    ['blush-dark', 'soft', 4.5], ['charcoal', 'raised', 4.5],
  ];
  const onWhite = [['btn', 4.5], ['rust-strong', 4.5], ['hero-from', 4.5], ['hero-to', 4.5], ['deep', 4.5]];
  const fails = [];
  for (const [fg, bg, r] of need) if (contrast(p[fg], p[bg]) < r) fails.push(`${fg} on ${bg}: ${contrast(p[fg], p[bg]).toFixed(2)}`);
  for (const [bg, r] of onWhite) if (contrast(WHITE, p[bg]) < r) fails.push(`white on ${bg}: ${contrast(WHITE, p[bg]).toFixed(2)}`);
  if (theme === 'light' && contrast(p.rust, p.soft) < 4.5) fails.push('rust on soft');
  if (fails.length) throw new Error(`${id} ${theme}: ${fails.join('; ')}`);
}

// ---- PNG icons (no dependencies: drawn pixel by pixel, 4×4 supersampled) -----------------------------------------
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// The four-point star, in a 0-1 box, scaled by `k` around the centre
function inStar(u, v, k) {
  // Fold into one quarter; the arm runs 0.27 out from the centre and the waist sits 0.066 out on the diagonal
  const x = Math.abs(u - 0.5) / k, y = Math.abs(v - 0.5) / k, arm = 0.27, w = 0.066;
  return x <= y ? (arm - w) * x + w * y <= arm * w : w * x + (arm - w) * y <= arm * w;
}
function icon(size, from, to, { rounded = 0, star = 1 } = {}) {
  const S = 4;
  return png(size, (px, py) => {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const u = (px + (sx + 0.5) / S) / size, v = (py + (sy + 0.5) / S) / size;
      // Rounded corners (only for the browser-tab icon)
      if (rounded) {
        const cx = Math.min(Math.max(u, rounded), 1 - rounded), cy = Math.min(Math.max(v, rounded), 1 - rounded);
        if ((u - cx) ** 2 + (v - cy) ** 2 > rounded ** 2) continue;
      }
      let col;
      if (inStar(u, v, star)) col = WHITE;
      else { const t = Math.min(1, Math.max(0, (u + v) / 2)) ** 1.6; col = from.map((c, i) => c + (to[i] - c) * t); }
      r += col[0]; g += col[1]; b += col[2]; a += 255;
    }
    const n = S * S, cov = a / 255;
    return cov ? [Math.round(r / cov), Math.round(g / cov), Math.round(b / cov), Math.round(a / n)] : [0, 0, 0, 0];
  });
}

// ---- write everything -----------------------------------------------------------------------------------------
let out = `/* Generated by scripts/make-accents.mjs: do not edit by hand. The app colours people can pick in Settings.
   Blue is the default palette in index.css. Every text pairing here is checked for at least 4.5:1 contrast. */\n`;
const summary = [];
for (const a of ACCENTS) {
  const { L, D } = palette(a);
  check(a.id, 'light', L); check(a.id, 'dark', D);
  const block = (p) => Object.entries(p).map(([k, v]) => `  --${k}: ${css(v)};`).join('\n');
  out += `\n:root[data-accent="${a.id}"], :root[data-accent="${a.id}"][data-theme="light"] {\n${block(L)}\n}\n`;
  out += `:root[data-accent="${a.id}"][data-theme="dark"] {\n${block(D)}\n}\n`;
  summary.push({ id: a.id, name: a.name, light: hex(L.rust), dark: hex(D.rust), bgLight: hex(L.ivory), bgDark: hex(D.ivory) });

  const dir = join(root, 'public', 'icons', a.id);
  mkdirSync(dir, { recursive: true });
  const to = L['hero-to'];
  const f = darkest(a.h, a.s, WHITE, 4.0, 0.62);   // a bright but solid start for the gradient
  writeFileSync(join(dir, 'icon-512.png'), icon(512, f, to));
  writeFileSync(join(dir, 'icon-192.png'), icon(192, f, to));
  writeFileSync(join(dir, 'maskable-512.png'), icon(512, f, to, { star: 0.8 }));
  writeFileSync(join(dir, 'apple-touch-icon.png'), icon(180, f, to));
  writeFileSync(join(dir, 'favicon-32.png'), icon(32, f, to, { rounded: 0.28, star: 1.25 }));

  const manifest = {
    id: '/', name: 'AuraGoal', short_name: 'AuraGoal',
    description: 'Set goals for the week, month and year, plan your days, and keep your streak with an accountability partner.',
    start_url: '/', scope: '/', display: 'standalone', orientation: 'any',
    background_color: hex(L.ivory), theme_color: hex(L.rust), lang: 'en', categories: ['productivity', 'lifestyle'],
    icons: [
      { src: `/icons/${a.id}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `/icons/${a.id}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `/icons/${a.id}/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  writeFileSync(join(root, 'public', `manifest-${a.id}.webmanifest`), `${JSON.stringify(manifest, null, 2)}\n`);
}
writeFileSync(join(root, 'src', 'accents.css'), out);
console.table(summary);
