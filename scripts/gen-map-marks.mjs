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
// The icons are white glyphs with a dark rim. The game's world map tints them
// periwinkle once done and grey before (#82affa and #99a697, measured on
// in-game screenshots, docs/game-assets.md), two colours of about the same
// brightness that are hard to tell apart on the green map. The editor is
// about what is left to do, so it draws a place not done in white and one
// done in grey, which the screen also dims. Each icon is tinted by scaling the
// colour with the pixel's brightness, so the rim stays dark and a dungeon's
// doorway mid-tone; Eona's Legacy's own grey-green sprite comes out white too.
// The game shows a found dungeon without the check mark of
// Icon_Mark_Dungeon_Single_Complete, so that icon is not used.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const [assetsDir] = process.argv.slice(2);
if (!assetsDir) {
  console.error('usage: node scripts/gen-map-marks.mjs <assets-dir>');
  process.exit(2);
}

const NOT_DONE = [0xff, 0xff, 0xff];
const DONE = [0x9a, 0x9e, 0xa4];

const MARK = 'Art/UI/InGame/Common/Mark';

/** The editor's name for each marker: the game's texture, and the tint it is drawn in (none: as is). */
const MARKS = {
  waypoint: [`${MARK}/Icon_Mark_Waypoint`, NOT_DONE],
  'waypoint-done': [`${MARK}/Icon_Mark_Waypoint`, DONE],
  statue: [`${MARK}/Icon_Mark_Godbless`, NOT_DONE],
  'statue-done': [`${MARK}/Icon_Mark_Godbless`, DONE],
  legacy: [`${MARK}/Icon_Mark_AWindmill`, NOT_DONE],
  'legacy-done': [`${MARK}/Icon_Mark_AWindmill`, DONE],
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
  MARKS[`quest-${nn}`] = [`${MARK}/Icon_Mark_QuestMark_${nn}`, null];
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

/** The texture scaled to 128 px and tinted: each pixel's brightness, relative to the glyph's, times the colour. */
async function tinted(path, colour) {
  const { data, info } = await sharp(path)
    .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
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
  return sharp(data, { raw: info }).webp({ lossless: true, effort: 6 }).toBuffer();
}

for (const [mark, [texture, colour]] of Object.entries(MARKS)) {
  const path = join(assetsDir, `${texture}.png`);
  if (!existsSync(path)) {
    console.error(`gen-map-marks: ${path} is missing`);
    process.exit(1);
  }
  writeFileSync(
    new URL(`../apps/desktop/src/assets/map-mark-${mark}.webp`, import.meta.url),
    await tinted(path, colour),
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
