// Mean CIELAB colour of a disc's interior (r < 0.55 R) and rim band (0.75 R..0.95 R), game vs editor.
import { createRequire } from 'node:module';

const sharp = createRequire('/home/user/git-silver/dragonsword-save-editor/package.json')('sharp');
const D = '/mnt/c/Users/Gary/Desktop/dragonsword-ui/',
  T = '/mnt/c/Users/Gary/AppData/Local/Temp/';
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function lab([r, g, b]) {
  const [R, G, B] = [r, g, b].map((v) => lin(v / 255));
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.9505,
    Y = 0.2126 * R + 0.7152 * G + 0.0722 * B,
    Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.089;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
async function zones(file, cx, cy, R) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const acc = { in: [0, 0, 0, 0], rim: [0, 0, 0, 0] };
  for (let y = Math.floor(cy - R); y <= cy + R; y++)
    for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const d = Math.hypot(x - cx, y - cy) / R;
      const z = d < 0.55 ? 'in' : d > 0.75 && d < 0.95 ? 'rim' : null;
      if (!z) continue;
      const o = (y * info.width + x) * info.channels;
      const L = lab([data[o], data[o + 1], data[o + 2]]);
      for (let k = 0; k < 3; k++) acc[z][k] += L[k];
      acc[z][3]++;
    }
  return Object.fromEntries(
    Object.entries(acc).map(([k, v]) => [
      k,
      v
        .slice(0, 3)
        .map((s) => (s / v[3]).toFixed(0))
        .join('/'),
    ]),
  );
}
const ca = 'DSClient-Win64-Shipping_2026_10_27_11_32_03_772.png',
  th = 'DSClient-Win64-Shipping_2026_10_27_03_21_43_454.png';
const rows = [
  ['Wild Blow', ca, 720, 175, 'shot-c1.png', 572, 305],
  ['Whirlwind', ca, 1218, 340, 'shot-c1.png', 850, 305],
  ['Stun Blow', ca, 1218, 645, 'shot-c1.png', 850, 429],
  ['Upper Blow', ca, 1085, 795, 'shot-c1.png', 850, 491],
  ['Consecration', th, 1218, 340, 'shot-t1.png', 850, 305],
];
console.log('skill          game in(L/a/b)  editor in     | game rim      editor rim');
for (const [n, gf, gx, gy, ef, ex, ey] of rows) {
  const g = await zones(D + gf, gx * 1.28, gy * 1.28, 55 * 1.28),
    e = await zones(T + ef, ex, ey, 19);
  console.log(n.padEnd(14), g.in.padEnd(14), e.in.padEnd(14), '|', g.rim.padEnd(14), e.rim);
}
