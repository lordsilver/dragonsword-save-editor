#!/usr/bin/env node
// Write the World map screen's markers, apps/desktop/src/assets/map-mark-*.webp,
// from the game's map icons (Art/UI/InGame/Common/Mark/Icon_Mark_* in the
// 2D-art export in <assets-dir>, docs/game-assets.md), kept at 128 pixels so
// that they stay sharp at the size the game draws them. It also writes the
// quest marks the quest steps of crates/core/data/world.json use
// (Icon_Mark_QuestMark_NN, drawn as is, map-mark-quest-NN.webp; run
// scripts/gen-world.mjs first), and the pictures the world map's card shows
// for a place (Art/UI/InGame/03_System/World/World_MapInfo_*, map-info-*.webp).
//
// Usage: node scripts/gen-map-marks.mjs <assets-dir>
//
// The icons are white glyphs with a soft, half-transparent dark rim, and the
// game's world map tints them: a place that is done (a warp point or Statue of
// Organa activated, a dungeon found) in one flat periwinkle, one that is not in
// grey. No game file stores the tints (native code sets them), so they were
// measured on in-game screenshots of the world map (2026-11-07, 13 done and 4
// not-done icons): the body of a done marker is #82affa, of one not done
// #99a697. Each icon is tinted by scaling the colour with the pixel's
// brightness, so the rim stays dark and a dungeon's doorway mid-tone, as in the
// game. Eona's Legacy has its own art for an active one
// (Icon_Mark_AWindmill_Activate), drawn as is. The game shows a found dungeon
// without the check mark of Icon_Mark_Dungeon_Single_Complete, so that icon is
// not used.
//
// The soft rim washes out on the map's snow and pale ground, so the editor
// makes it solid: everything above about a tenth of the rim's opacity becomes
// nearly opaque, grown by half a screen pixel, in the dark green of the place
// names' glow (#0b2a22). The quest marks keep their own frames.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const [assetsDir] = process.argv.slice(2);
if (!assetsDir) {
  console.error('usage: node scripts/gen-map-marks.mjs <assets-dir>');
  process.exit(2);
}

const DONE = [0x82, 0xaf, 0xfa];
const NOT_DONE = [0x99, 0xa6, 0x97];
/** The solid rim's colour and opacity, and how far it grows: half a pixel of the 44 the screen draws. */
const RIM = [0x0b, 0x2a, 0x22];
const RIM_OPACITY = 0.95;
const SIZE = 128;
const RIM_GROW = (0.5 * SIZE) / 44;

const MARK = 'Art/UI/InGame/Common/Mark';

/** The editor's name for each marker: the game's texture, and the tint it is drawn in (none: as is). */
const MARKS = {
  waypoint: [`${MARK}/Icon_Mark_Waypoint`, NOT_DONE],
  'waypoint-done': [`${MARK}/Icon_Mark_Waypoint`, DONE],
  statue: [`${MARK}/Icon_Mark_Godbless`, NOT_DONE],
  'statue-done': [`${MARK}/Icon_Mark_Godbless`, DONE],
  legacy: [`${MARK}/Icon_Mark_AWindmill`, NOT_DONE],
  'legacy-done': [`${MARK}/Icon_Mark_AWindmill_Activate`, null],
  tower: [`${MARK}/Icon_Mark_TrialTower`, NOT_DONE],
  'tower-done': [`${MARK}/Icon_Mark_TrialTower`, DONE],
  dungeon: [`${MARK}/Icon_Mark_Dungeon_Single`, NOT_DONE],
  'dungeon-done': [`${MARK}/Icon_Mark_Dungeon_Single`, DONE],
};

const world = JSON.parse(readFileSync(new URL('../crates/core/data/world.json', import.meta.url), 'utf8'));
const questMarks = new Set(
  Object.values(world.quests).flatMap((quest) => Object.values(quest.marks ?? {}).map(([, , , mark]) => mark)),
);
for (const mark of [...questMarks].sort((a, b) => a - b)) {
  const nn = String(mark).padStart(2, '0');
  MARKS[`quest-${nn}`] = [`${MARK}/Icon_Mark_QuestMark_${nn}`, null, { rim: false }];
}

/** The place pictures the cards use, by the name world.json gives them, and the texture behind each. */
const PICTURES = new Map();
for (const place of [...world.waypoints, ...world.dungeons]) {
  if (place.picture) PICTURES.set(place.picture, null);
}
const WORLD_ART = 'Art/UI/InGame/03_System/World';
const pictureFiles = new Map(
  ['Waypoint', 'Statue', 'Windmill', 'TrialTower', 'Dungeon', 'Cave'].map((name) => [name.toLowerCase(), name]),
);

/**
 * The texture scaled to 128 px and tinted: each pixel's brightness, relative to
 * the glyph's, times the colour; with `rim`, on its solid rim.
 */
async function tinted(path, colour, rim = true) {
  const { data, info } = await sharp(path)
    .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (colour) {
    const brightness = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 128) brightness.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }
    brightness.sort((a, b) => a - b);
    // The glyph's white, not a stray highlight.
    const white = brightness[Math.floor(brightness.length * 0.95)] || 255;
    for (let i = 0; i < data.length; i += 4) {
      const level = Math.min(1, (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / white);
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(colour[c] * level);
    }
  }
  if (rim) solidRim(data, info.width, info.height);
  return sharp(data, { raw: info }).webp({ lossless: true, effort: 6 }).toBuffer();
}

/** Lays the icon over its solid rim: its alpha raised (×1.7 − 0.04), grown by RIM_GROW, in RIM. */
function solidRim(data, width, height) {
  const solid = new Float32Array(width * height);
  for (let i = 0; i < solid.length; i++) solid[i] = Math.min(1, Math.max(0, (1.7 * data[i * 4 + 3]) / 255 - 0.04));
  const reach = Math.floor(RIM_GROW);
  const grown = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let most = 0;
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (dx * dx + dy * dy > RIM_GROW * RIM_GROW || nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          most = Math.max(most, solid[ny * width + nx]);
        }
      }
      grown[y * width + x] = most;
    }
  }
  for (let i = 0; i < grown.length; i++) {
    const under = grown[i] * RIM_OPACITY;
    const over = data[i * 4 + 3] / 255;
    const alpha = over + under * (1 - over);
    if (alpha === 0) continue;
    for (let c = 0; c < 3; c++) {
      data[i * 4 + c] = Math.round((data[i * 4 + c] * over + RIM[c] * under * (1 - over)) / alpha);
    }
    data[i * 4 + 3] = Math.round(alpha * 255);
  }
}

for (const [mark, [texture, colour, { rim = true } = {}]] of Object.entries(MARKS)) {
  const path = join(assetsDir, `${texture}.png`);
  if (!existsSync(path)) {
    console.error(`gen-map-marks: ${path} is missing`);
    process.exit(1);
  }
  writeFileSync(
    new URL(`../apps/desktop/src/assets/map-mark-${mark}.webp`, import.meta.url),
    await tinted(path, colour, rim),
  );
}
for (const name of PICTURES.keys()) {
  const file = pictureFiles.get(name);
  const path = file && join(assetsDir, WORLD_ART, `World_MapInfo_${file}.png`);
  if (!path || !existsSync(path)) {
    console.error(`gen-map-marks: no picture for ${name}`);
    process.exit(1);
  }
  writeFileSync(
    new URL(`../apps/desktop/src/assets/map-info-${name}.webp`, import.meta.url),
    await sharp(path).webp({ lossless: true, effort: 6 }).toBuffer(),
  );
}
console.log(`markers: ${Object.keys(MARKS).length}, pictures: ${PICTURES.size}`);
