#!/usr/bin/env node
// Build the World map screen's images from the game's own capture of each
// world seen from above: apps/desktop/src/assets/world-map-<world>.webp, and
// where each image sits in the world in crates/core/data/world_maps.json.
// Also writes the game's map markers (Art/UI/InGame/Common/Mark/Icon_Mark_*,
// from the 2D-art export in <assets-dir>) as map-mark-<marker>.webp.
//
// Usage: node scripts/gen-world-map.mjs <dump-dir> <tiles-dir> <assets-dir>
//
// The game draws a world's map from a DWorldMapData asset,
// Design/CaptureMinimap/Data/WorldMapData_<world> (100 Orbis, 200 Belos, as
// MapFieldData's WorldMapPath names them). Its MapTexturePath names the
// capture: MapTextureCount × MapTextureCount textures
// Design/CaptureMinimap/Export/<prefix>_<a>_<b>, and a JSONString asset
// <prefix> beside them holding the square they cover in world units (corner
// sx, sy, side size) and each texture's side in pixels (TexSize).
// <dump-dir> holds those assets as DsaExport `dump` writes them (one JSON per
// package, under DS/Content/...), <tiles-dir> the textures as its `export`
// writes them (Design/CaptureMinimap/Export/*.png); docs/game-assets.md
// gives the commands.
//
// The textures are stored upside down. Flipped top to bottom, texture <a>_<b>
// is row a, column b of the map: of the 64 ways to lay out the 16 textures
// (index order, row and column order, and one of the 8 symmetries of a
// square), only this arrangement and its rotations and mirror images join at
// every seam, and only this one puts the game's map points (WarpPositionData,
// MapPointIconData) on land while keeping the map unmirrored. A world point
// (X, Y) is then at ((sy + size - Y) / size, (X - sx) / size) of the image,
// across and down; crates/core/src/world.rs and the World map screen use
// that.
//
// A capture whose textures are not TexSize square is skipped: Belos's main
// textures (RTM_W2_1_world_02_main_wp, 769 × 765 and similar) were cut by
// hand and no JSON describes them, so markers could not be placed on them.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const [dumpDir, tilesDir, assetsDir] = process.argv.slice(2);
if (!dumpDir || !tilesDir || !assetsDir) {
  console.error('usage: node scripts/gen-world-map.mjs <dump-dir> <tiles-dir> <assets-dir>');
  process.exit(2);
}

function fail(message) {
  console.error(`gen-world-map: ${message}`);
  process.exit(1);
}

/** The pixels of the image the editor ships: half the capture, a quarter of its size. */
const OUTPUT = 4096;

const world = JSON.parse(readFileSync(new URL('../crates/core/data/world.json', import.meta.url), 'utf8'));
const captureDir = join(dumpDir, 'DS/Content/Design/CaptureMinimap');

/** The exports of one dumped package. */
function dumped(path) {
  const file = join(captureDir, `${path}.uasset.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

const placements = {};
for (const { id, name } of world.worlds) {
  const data = dumped(`Data/WorldMapData_${id}`)?.[0]?.Properties?.WorldMapDataInfo;
  if (!data) fail(`WorldMapData_${id} is missing from ${captureDir}/Data`);
  const prefix = data.MapTexturePath;
  const count = data.MapTextureCount;
  const capture = dumped(`Export/${prefix}`)?.[0]?.Properties?.JSONString;
  if (!capture) {
    console.warn(`${name.en}: no capture square for ${prefix}, skipped`);
    continue;
  }
  const square = JSON.parse(capture);
  const texSize = Number(square.TexSize);
  if (Number(square.count) !== count) fail(`${prefix} has ${square.count} textures a side, the map asks for ${count}`);

  const composite = [];
  let usable = true;
  for (let a = 0; a < count && usable; a++) {
    for (let b = 0; b < count; b++) {
      const path = join(tilesDir, 'Design/CaptureMinimap/Export', `${prefix}_${a}_${b}.png`);
      if (!existsSync(path)) fail(`${path} is missing`);
      const { width, height } = await sharp(path).metadata();
      if (width !== texSize || height !== texSize) {
        console.warn(`${name.en}: ${prefix}_${a}_${b} is ${width} × ${height}, not ${texSize} square; skipped`);
        usable = false;
        break;
      }
      composite.push({ input: await sharp(path).flip().toBuffer(), left: b * texSize, top: a * texSize });
    }
  }
  if (!usable) continue;

  const side = count * texSize;
  const stitched = await sharp({ create: { width: side, height: side, channels: 3, background: '#000' } })
    .composite(composite)
    .png()
    .toBuffer();
  const image = await sharp(stitched).resize(OUTPUT, OUTPUT).webp({ quality: 82, effort: 6 }).toBuffer();
  writeFileSync(new URL(`../apps/desktop/src/assets/world-map-${id}.webp`, import.meta.url), image);
  placements[id] = { x0: Number(square.sx), y0: Number(square.sy), size: Number(square.size) };
  console.log(
    `${name.en}: ${prefix}, ${count} × ${count} textures of ${texSize} px -> ${OUTPUT} px, ${image.length} bytes`,
  );
}

writeFileSync(
  new URL('../crates/core/data/world_maps.json', import.meta.url),
  `${JSON.stringify(placements, null, 2)}\n`,
);

// The markers the game's world map draws, by the editor's name for them.
const MARKS = {
  waypoint: 'Icon_Mark_Waypoint',
  statue: 'Icon_Mark_Godbless',
  legacy: 'Icon_Mark_AWindmill',
  'legacy-active': 'Icon_Mark_AWindmill_Activate',
  tower: 'Icon_Mark_TrialTower',
  dungeon: 'Icon_Mark_Dungeon_Single',
  'dungeon-found': 'Icon_Mark_Dungeon_Single_Complete',
  chest: 'Icon_Mark_Box_png',
};
for (const [mark, texture] of Object.entries(MARKS)) {
  const path = join(assetsDir, 'Art/UI/InGame/Common/Mark', `${texture}.png`);
  if (!existsSync(path)) fail(`${path} is missing`);
  const image = await sharp(path).resize(64, 64).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
  writeFileSync(new URL(`../apps/desktop/src/assets/map-mark-${mark}.webp`, import.meta.url), image);
}
console.log(`markers: ${Object.keys(MARKS).length}`);
