#!/usr/bin/env node
// Build the editor's icon sprite from the game's own textures.
//
// Usage: node scripts/gen-icons.mjs <assets-dir> <extract-dir>
//
// <assets-dir> is the 2D-art export described in docs/game-assets.md (PNGs
// laid out by game path, e.g. Art/UI/InGame/Icon_Item/Common/Icon_Item_Common_Gold.png).
// <extract-dir> holds the game's XML tables (see scripts/gen-growth.mjs); only
// PCCharacterData is read, for each hero's portrait name. Neither folder is
// part of this repository.
//
// The script takes only the icons the catalog uses: each item's own icon by
// its game path, and each hero's square portrait (Icon_Character_<ImageType>).
// It packs them into apps/desktop/src/assets/sprite.webp and rewrites the
// cell offsets in crates/core/data/items.json. Cell 0 stays empty, because an
// item at offset 0,0 means "no icon" to the catalog.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const [assetsDir, extractDir] = process.argv.slice(2);
if (!assetsDir || !extractDir) {
  console.error('usage: node scripts/gen-icons.mjs <assets-dir> <extract-dir>');
  process.exit(2);
}

/** Pixels per sprite cell. The frontend's ItemIcon reads the same value from items.json. */
const CELL = 128;
const COLUMNS = 32;

const catalogPath = new URL('../crates/core/data/items.json', import.meta.url);
const spritePath = new URL('../apps/desktop/src/assets/sprite.webp', import.meta.url);

function fail(message) {
  console.error(`gen-icons: ${message}`);
  process.exit(1);
}

// Hero portraits: PCCharacterData names each hero's art set in ImageType.
const portraits = new Map();
const characters = readFileSync(join(extractDir, 'PCCharacterData.xml'), 'utf8');
for (const element of characters.matchAll(/<[\w-]+:\w+\s([^<>]*?)\/>/g)) {
  const id = element[1].match(/[\w-]+:ID="(\d+)"/)?.[1];
  const image = element[1].match(/[\w-]+:ImageType="([^"]*)"/)?.[1];
  if (id && image) portraits.set(id, `Art/UI/InGame/Icon_Character/Icon_Character_${image}`);
}
if (portraits.size === 0) fail('PCCharacterData has no ImageType rows');

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const sources = new Map(); // game path -> cell index
const placed = new Map(); // item CID -> game path
const missing = [];
for (const [cid, item] of Object.entries(catalog.items)) {
  const candidates = [item.iconPath, item.category === 'character' ? portraits.get(cid) : undefined];
  const path = candidates.find((candidate) => candidate && existsSync(join(assetsDir, `${candidate}.png`)));
  if (!path) {
    if (item.iconPath || portraits.has(cid)) missing.push(`${cid} ${item.en}: ${item.iconPath ?? portraits.get(cid)}`);
    continue;
  }
  placed.set(cid, path);
  sources.set(path, 0);
}

// Cells in game-path order, so a rerun on the same export gives the same sheet.
const ordered = [...sources.keys()].sort();
for (const [index, path] of ordered.entries()) sources.set(path, index + 1);
const rows = Math.ceil((ordered.length + 1) / COLUMNS);

const tiles = await Promise.all(
  ordered.map(async (path) => {
    const cell = sources.get(path);
    const input = await sharp(join(assetsDir, `${path}.png`))
      .resize(CELL, CELL, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
      .png()
      .toBuffer();
    return { input, left: (cell % COLUMNS) * CELL, top: Math.floor(cell / COLUMNS) * CELL };
  }),
);

const sheet = await sharp({
  create: { width: COLUMNS * CELL, height: rows * CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite(tiles)
  .webp({ quality: 90, alphaQuality: 100, effort: 6 })
  .toBuffer();
writeFileSync(spritePath, sheet);

for (const [cid, item] of Object.entries(catalog.items)) {
  const path = placed.get(cid);
  const cell = path ? sources.get(path) : 0;
  item.x = -(cell % COLUMNS) * CELL;
  item.y = -Math.floor(cell / COLUMNS) * CELL;
}
catalog.iconSize = CELL;
catalog._source =
  "Item names datamined from the game's own GameItemData/StringData (paks). Icons are the game's own textures, packed by scripts/gen-icons.mjs from the export described in docs/game-assets.md.";
writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

console.log(
  `packed ${ordered.length} icons for ${placed.size} of ${Object.keys(catalog.items).length} items into ${COLUMNS}x${rows} cells of ${CELL}px (${(sheet.length / 1048576).toFixed(1)} MB)`,
);
if (missing.length > 0) {
  console.log(`${missing.length} items name an icon the export does not have:`);
  for (const line of missing) console.log(`  ${line}`);
}
