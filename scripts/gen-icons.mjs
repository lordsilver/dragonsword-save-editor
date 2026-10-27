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
// Where the game ships no such texture (docs/game-assets.md lists them), it
// falls back to what the game's own tables use instead:
// - a costume item: its tall CostumeData card (Img_Item/Costume or
//   Costume_Weapon, same name), cropped to the top square;
// - a hero without a portrait (Viola): the hero's Img_Character_Mini bust,
//   cropped the same way;
// - a familiar without an item icon: the icon of the familiar whose
//   VehicleCharacterData row names the same image.
// It also packs each hero skill's icon and each skill effect's badge from
// crates/core/data/skills.json, and records each badge's colour (the average
// of its opaque pixels), which the editor uses to tint the effect's skill
// disc: the game tints it in a material the export does not include.
// It packs them into apps/desktop/src/assets/sprite.webp and rewrites the
// cell offsets in crates/core/data/items.json, items_extra.json (the game's
// items that items.json lacks) and skills.json, the last two written by
// scripts/gen-catalog-extras.mjs. Cell 0 stays empty, because an item at
// offset 0,0 means "no icon" to the catalog.

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
const extraPath = new URL('../crates/core/data/items_extra.json', import.meta.url);
const skillsPath = new URL('../crates/core/data/skills.json', import.meta.url);
const spritePath = new URL('../apps/desktop/src/assets/sprite.webp', import.meta.url);

function fail(message) {
  console.error(`gen-icons: ${message}`);
  process.exit(1);
}

/** Rows of a table as attribute maps, the way gen-growth.mjs reads them. */
function rows(table) {
  const text = readFileSync(join(extractDir, `${table}.xml`), 'utf8');
  const out = [];
  for (const element of text.matchAll(/<[\w-]+:\w+\s([^<>]*?)\/>/g)) {
    const row = {};
    for (const attribute of element[1].matchAll(/[\w-]+:(\w+)="([^"]*)"/g)) row[attribute[1]] = attribute[2];
    out.push(row);
  }
  if (out.length === 0) fail(`${table} has no rows`);
  return out;
}

const exists = (path) => existsSync(join(assetsDir, `${path}.png`));

// Hero art: PCCharacterData names each hero's art set in ImageType.
const heroImages = new Map();
for (const row of rows('PCCharacterData')) if (row.ImageType) heroImages.set(row.ID, row.ImageType);

// Familiars: VehicleCharacterData names one collection image per familiar,
// and two familiars can share it.
const vehicleImages = new Map();
for (const row of rows('VehicleCharacterData')) if (row.IconName) vehicleImages.set(row.ID, row.IconName);

/** Where an item's icon comes from: a game path, and whether to crop it to its top square. */
function iconSource(cid, item) {
  if (item.iconPath && exists(item.iconPath)) return { path: item.iconPath, crop: false };
  const costume = item.iconPath?.match(/\/Icon_Item\/Costume\/(?:Icon|Img)_Item_Costume_(\w+)$/)?.[1];
  if (costume) {
    for (const folder of ['Costume', 'Costume_Weapon']) {
      const card = `Art/UI/InGame/Img_Item/${folder}/Img_Item_Costume_${costume}`;
      if (exists(card)) return { path: card, crop: true };
    }
  }
  const hero = item.category === 'character' ? heroImages.get(cid) : undefined;
  if (hero) {
    const portrait = `Art/UI/InGame/Icon_Character/Icon_Character_${hero}`;
    if (exists(portrait)) return { path: portrait, crop: false };
    const bust = `Art/UI/InGame/Img_Character/Mini/Img_Character_Mini_${hero}`;
    if (exists(bust)) return { path: bust, crop: true };
  }
  if (item.category === 'mount' && !item.iconPath && vehicleImages.has(cid)) {
    for (const [other, image] of vehicleImages) {
      const sibling = allItems[other];
      if (other !== cid && image === vehicleImages.get(cid) && sibling?.iconPath && exists(sibling.iconPath)) {
        return { path: sibling.iconPath, crop: false };
      }
    }
  }
  return null;
}

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const extra = JSON.parse(readFileSync(extraPath, 'utf8'));
// items.json wins for a CID in both files, as in the catalog loader.
const allItems = { ...extra.items, ...catalog.items };
const sources = new Map(); // "path|crop" -> { path, crop, cell }
const placed = new Map(); // item CID -> source key
const missing = [];
for (const [cid, item] of Object.entries(allItems)) {
  const source = iconSource(cid, item);
  if (!source) {
    missing.push(`${cid} ${item.en}: ${item.iconPath ?? (heroImages.get(cid) || 'no icon in the game tables')}`);
    continue;
  }
  const key = `${source.path}|${source.crop}`;
  placed.set(cid, key);
  sources.set(key, { ...source, cell: 0 });
}

// Skill icons have no fallbacks; scripts/gen-catalog-extras.mjs already
// checked that each names a texture.
const skills = JSON.parse(readFileSync(skillsPath, 'utf8'));
const skillSlots = [...Object.values(skills.heroes).flat(), ...Object.values(skills.effects)];
for (const slot of skillSlots) {
  if (!exists(slot.iconPath)) fail(`skill icon ${slot.iconPath} is not in the export`);
  sources.set(`${slot.iconPath}|false`, { path: slot.iconPath, crop: false, cell: 0 });
}

// Cells in game-path order, so a rerun on the same export gives the same sheet.
const ordered = [...sources.keys()].sort();
for (const [index, key] of ordered.entries()) sources.get(key).cell = index + 1;
const sheetRows = Math.ceil((ordered.length + 1) / COLUMNS);

const tiles = await Promise.all(
  ordered.map(async (key) => {
    const { path, crop, cell } = sources.get(key);
    const input = await sharp(join(assetsDir, `${path}.png`))
      .resize(CELL, CELL, {
        fit: crop ? 'cover' : 'contain',
        position: 'top',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: 'lanczos3',
      })
      .png()
      .toBuffer();
    return { input, left: (cell % COLUMNS) * CELL, top: Math.floor(cell / COLUMNS) * CELL };
  }),
);

const sheet = await sharp({
  create: { width: COLUMNS * CELL, height: sheetRows * CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite(tiles)
  .webp({ quality: 90, alphaQuality: 100, effort: 6 })
  .toBuffer();
writeFileSync(spritePath, sheet);

for (const [cid, item] of [...Object.entries(catalog.items), ...Object.entries(extra.items)]) {
  const key = placed.get(cid);
  const cell = key ? sources.get(key).cell : 0;
  item.x = -(cell % COLUMNS) * CELL;
  item.y = -Math.floor(cell / COLUMNS) * CELL;
}
/** The average colour of a texture's opaque pixels, as #rrggbb. */
async function badgeColor(path) {
  const { data } = await sharp(join(assetsDir, `${path}.png`))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sum = [0, 0, 0];
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 200) continue;
    for (const channel of [0, 1, 2]) sum[channel] += data[index + channel];
    count += 1;
  }
  if (count === 0) fail(`badge ${path} has no opaque pixels`);
  return `#${sum
    .map((total) =>
      Math.round(total / count)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
for (const effect of Object.values(skills.effects)) effect.color = await badgeColor(effect.iconPath);

for (const slot of skillSlots) {
  const cell = sources.get(`${slot.iconPath}|false`).cell;
  slot.x = -(cell % COLUMNS) * CELL;
  slot.y = -Math.floor(cell / COLUMNS) * CELL;
}
writeFileSync(skillsPath, `${JSON.stringify(skills, null, 2)}\n`);
catalog.iconSize = CELL;
catalog._source =
  "Item names datamined from the game's own GameItemData/StringData (paks). Icons are the game's own textures, packed by scripts/gen-icons.mjs from the export described in docs/game-assets.md.";
writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
writeFileSync(extraPath, `${JSON.stringify(extra, null, 2)}\n`);

console.log(
  `packed ${ordered.length} icons for ${placed.size} of ${Object.keys(allItems).length} items and ${skillSlots.length} skill slots and effects into ${COLUMNS}x${sheetRows} cells of ${CELL}px (${(sheet.length / 1048576).toFixed(1)} MB)`,
);
if (missing.length > 0) {
  console.log(`${missing.length} items have no icon in the export:`);
  for (const line of missing) console.log(`  ${line}`);
}
