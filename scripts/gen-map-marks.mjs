#!/usr/bin/env node
// Write the World map screen's markers, apps/desktop/src/assets/map-mark-*.webp,
// from the game's map icons (Art/UI/InGame/Common/Mark/Icon_Mark_* in the
// 2D-art export in <assets-dir>, docs/game-assets.md).
//
// Usage: node scripts/gen-map-marks.mjs <assets-dir>
//
// The icons are white glyphs with a dark rim, and the game's world map tints
// them: a place that is done (a warp point or Statue of Organa activated, a
// dungeon found) in one flat periwinkle, one that is not in grey. No game file
// stores the tints (native code sets them), so they were measured on in-game
// screenshots of the world map (2026-11-07, 13 done and 4 not-done icons): the
// body of a done marker is #82affa, of one not done #99a697. An unlit Eona's
// Legacy is its own grey-green sprite under the grey tint. Each icon is tinted by
// scaling the colour with the pixel's brightness, so the rim stays dark and a
// dungeon's doorway mid-tone, as in the game. Eona's Legacy has its own
// coloured art for an active one (Icon_Mark_AWindmill_Activate), drawn as is.
// The game shows a found dungeon as a blue doorway without the check mark of
// Icon_Mark_Dungeon_Single_Complete, so that icon is not used.

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const [assetsDir] = process.argv.slice(2);
if (!assetsDir) {
  console.error('usage: node scripts/gen-map-marks.mjs <assets-dir>');
  process.exit(2);
}

const DONE = [0x82, 0xaf, 0xfa];
const NOT_DONE = [0x99, 0xa6, 0x97];

/** The editor's name for each marker: the game's icon, and the tint it is drawn in (none: as is). */
const MARKS = {
  waypoint: ['Icon_Mark_Waypoint', NOT_DONE],
  'waypoint-done': ['Icon_Mark_Waypoint', DONE],
  statue: ['Icon_Mark_Godbless', NOT_DONE],
  'statue-done': ['Icon_Mark_Godbless', DONE],
  legacy: ['Icon_Mark_AWindmill', NOT_DONE],
  'legacy-done': ['Icon_Mark_AWindmill_Activate', null],
  tower: ['Icon_Mark_TrialTower', NOT_DONE],
  'tower-done': ['Icon_Mark_TrialTower', DONE],
  dungeon: ['Icon_Mark_Dungeon_Single', NOT_DONE],
  'dungeon-done': ['Icon_Mark_Dungeon_Single', DONE],
  chest: ['Icon_Mark_Box_png', null],
};

/** The icon scaled to 64 px and tinted: each pixel's brightness, relative to the glyph's, times the colour. */
async function tinted(path, colour) {
  const { data, info } = await sharp(path).resize(64, 64).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
  return sharp(data, { raw: info }).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
}

for (const [mark, [texture, colour]] of Object.entries(MARKS)) {
  const path = join(assetsDir, 'Art/UI/InGame/Common/Mark', `${texture}.png`);
  if (!existsSync(path)) {
    console.error(`gen-map-marks: ${path} is missing`);
    process.exit(1);
  }
  writeFileSync(
    new URL(`../apps/desktop/src/assets/map-mark-${mark}.webp`, import.meta.url),
    await tinted(path, colour),
  );
}
console.log(`markers: ${Object.keys(MARKS).length}`);
