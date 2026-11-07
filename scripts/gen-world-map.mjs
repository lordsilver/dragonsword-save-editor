#!/usr/bin/env node
// Build the World map screen's images from the game's own capture of each
// world seen from above: apps/desktop/src/assets/world-map-<world>.webp, and
// where each image sits in the world in crates/core/data/world_maps.json.
// scripts/gen-map-marks.mjs writes the markers drawn on it.
//
// Usage: node scripts/gen-world-map.mjs <dump-dir> <tiles-dir>
//
// The game draws a world's map from a DWorldMapData asset,
// Design/CaptureMinimap/Data/WorldMapData_<world> (100 Orbis, 200 Belos).
// Its MapTexturePath names the capture, MapTextureCount × MapTextureCount
// textures Design/CaptureMinimap/Export/<prefix>_<a>_<b>, and the map widget
// (UI/Layer/DLayerMap) stretches them over a square of MapDimensions world
// units centred on (MapDimensionsCenterX, MapDimensionsCenterY): world point
// (X, Y) is at ((X - x0) / size, (Y - y0) / size) of the image, across and
// down, with x0 = CenterX - size / 2 and y0 = CenterY - size / 2.
// crates/core/src/world.rs and the World map screen use that. The JSONString
// asset <prefix> beside the textures is the capture tool's own record; the
// widget does not read it, and its square does not match the map.
// <dump-dir> holds those assets as DsaExport `dump` writes them (one JSON per
// package, under DS/Content/...), <tiles-dir> the textures as its `export`
// writes them (Design/CaptureMinimap/Export/*.png); docs/game-assets.md
// gives the commands.
//
// Flipped top to bottom, texture <a>_<b> is row a, column b of the capture:
// of the 64 ways to lay out the 16 textures (index order, row and column
// order, and one of the 8 symmetries of a square), only this arrangement and
// its rotations and mirror images join at every seam. Laid out that way the
// capture is the map upside down, so the whole image is then flipped top to
// bottom. The fog's line texture FX_WorldMap_Line, which the game samples at
// the map's own coordinates, falls on Orbis's coastline only this way round.
// Belos's textures are pieces of one 3072-pixel capture cut unevenly (769 or
// 765 pixels a side), so each row and column takes the size of its pieces.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const [dumpDir, tilesDir] = process.argv.slice(2);
if (!dumpDir || !tilesDir) {
  console.error('usage: node scripts/gen-world-map.mjs <dump-dir> <tiles-dir>');
  process.exit(2);
}

function fail(message) {
  console.error(`gen-world-map: ${message}`);
  process.exit(1);
}

/** The largest image the editor ships: Orbis's capture is 4096 pixels a side, Belos's 3072. */
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
  const size = Number(data.MapDimensions);
  const centreX = Number(data.MapDimensionsCenterX);
  const centreY = Number(data.MapDimensionsCenterY);
  if (!prefix || !count || !size || Number.isNaN(centreX) || Number.isNaN(centreY)) {
    fail(`WorldMapData_${id} lacks the map's textures or square`);
  }

  const tiles = [];
  for (let a = 0; a < count; a++) {
    const row = [];
    for (let b = 0; b < count; b++) {
      const path = join(tilesDir, 'Design/CaptureMinimap/Export', `${prefix}_${a}_${b}.png`);
      if (!existsSync(path)) fail(`${path} is missing`);
      const { width, height } = await sharp(path).metadata();
      row.push({ path, width, height });
    }
    tiles.push(row);
  }
  // Each column is as wide as its pieces, each row as high.
  const widths = tiles[0].map((tile) => tile.width);
  const heights = tiles.map((row) => row[0].height);
  for (const [a, row] of tiles.entries()) {
    for (const [b, tile] of row.entries()) {
      if (tile.width !== widths[b] || tile.height !== heights[a]) {
        fail(`${prefix}_${a}_${b} is ${tile.width} × ${tile.height}, unlike the rest of its row or column`);
      }
    }
  }
  const offset = (sizes, index) => sizes.slice(0, index).reduce((sum, value) => sum + value, 0);
  const sideX = offset(widths, count);
  const sideY = offset(heights, count);
  if (sideX !== sideY) fail(`${prefix} is ${sideX} × ${sideY}, not square`);
  const composite = [];
  for (const [a, row] of tiles.entries()) {
    for (const [b, tile] of row.entries()) {
      composite.push({
        input: await sharp(tile.path).flip().toBuffer(),
        left: offset(widths, b),
        top: offset(heights, a),
      });
    }
  }
  const stitched = await sharp({ create: { width: sideX, height: sideY, channels: 3, background: '#000' } })
    .composite(composite)
    .png()
    .toBuffer();
  const output = Math.min(sideX, OUTPUT);
  const image = await sharp(stitched).flip().resize(output, output).webp({ quality: 82, effort: 6 }).toBuffer();
  writeFileSync(new URL(`../apps/desktop/src/assets/world-map-${id}.webp`, import.meta.url), image);
  placements[id] = { x0: centreX - size / 2, y0: centreY - size / 2, size };
  console.log(
    `${name.en}: ${prefix}, ${count} × ${count} textures, ${sideX} px -> ${output} px, ${image.length} bytes`,
  );
}

writeFileSync(
  new URL('../crates/core/data/world_maps.json', import.meta.url),
  `${JSON.stringify(placements, null, 2)}\n`,
);
