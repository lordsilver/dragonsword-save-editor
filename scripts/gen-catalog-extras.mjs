#!/usr/bin/env node
// Add the game's items that the bundled catalog lacks to
// crates/core/data/items_extra.json, named from the game's own tables, and
// write crates/core/data/titles.json from the game's title table.
//
// Usage: node scripts/gen-catalog-extras.mjs <extract-dir>
//
// <extract-dir> holds the game's XML tables (see scripts/gen-growth.mjs).
// GameItemData lists every item; StringData has its names. items.json is
// left alone apart from icon offsets; every
// GameItemData row it does not have is written here instead, and the catalog
// merges these entries for CIDs items.json lacks. Run scripts/gen-icons.mjs
// afterwards to give them icons.
//
// titles.json is rebuilt whole from AccountTitleData: every title with its
// name, colour and stat bonuses (a *_Per value is a fraction, 0.023 = 2.3%).

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [extractDir] = process.argv.slice(2);
if (!extractDir) {
  console.error('usage: node scripts/gen-catalog-extras.mjs <extract-dir>');
  process.exit(2);
}

function fail(message) {
  console.error(`gen-catalog-extras: ${message}`);
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

// The catalog's category for each item type this script knows. A new type
// stops the script, so its category is chosen on purpose.
const CATEGORIES = {
  COSTUME: 'costume',
  // items.json files title items under material.
  ACCOUNT_TITLE: 'material',
};

const catalogPath = new URL('../crates/core/data/items.json', import.meta.url);
const extraPath = new URL('../crates/core/data/items_extra.json', import.meta.url);
const known = new Set(Object.keys(JSON.parse(readFileSync(catalogPath, 'utf8')).items));
const strings = new Map(rows('StringData').map((row) => [row.ID, row]));

const items = {};
for (const row of rows('GameItemData')) {
  if (known.has(row.ID)) continue;
  const category = CATEGORIES[row.ItemType];
  if (!category) fail(`item ${row.ID} has type ${row.ItemType}, which has no catalog category yet`);
  const name = strings.get(row.Name);
  if (!name?.En) fail(`item ${row.ID} has no English name (string ${row.Name})`);
  // IconName looks like /Script/Engine.Texture2D'/Game/Art/X/Y.Y'.
  const icon = row.IconName.match(/'\/Game\/([^.']+)/)?.[1];
  items[row.ID] = {
    fr: name.Fr || name.En,
    en: name.En.trim(),
    category,
    type: row.ItemType,
    grade: row.Grade.toLowerCase(),
    ...(icon && { iconPath: icon }),
    x: 0,
    y: 0,
  };
}

const extra = JSON.parse(readFileSync(extraPath, 'utf8'));
extra._note =
  "Items GameItemData has and items.json lacks, named from the game's StringData by scripts/gen-catalog-extras.mjs; icon offsets come from scripts/gen-icons.mjs. Merged into the catalog only for CIDs absent from items.json.";
extra.items = items;
writeFileSync(extraPath, `${JSON.stringify(extra, null, 2)}\n`);
console.log(`wrote ${Object.keys(items).length} items the catalog lacks: ${Object.keys(items).join(', ')}`);

const titles = rows('AccountTitleData')
  .map((row) => {
    const name = strings.get(row.Name);
    if (!name?.En) fail(`title ${row.ID} has no English name (string ${row.Name})`);
    const stats = [];
    for (const slot of [1, 2, 3]) {
      const type = row[`StatType${slot}`];
      if (!type) continue;
      const value = Number(row[`StatValue${slot}`]);
      if (!Number.isFinite(value)) fail(`title ${row.ID} stat ${slot} is not a number`);
      stats.push({ type, value });
    }
    return {
      id: Number(row.ID),
      nameFr: name.Fr || name.En,
      nameEn: name.En.trim(),
      color: row.FontColor,
      ...(stats.length > 0 && { stats }),
    };
  })
  .sort((left, right) => left.id - right.id);
const titlesPath = new URL('../crates/core/data/titles.json', import.meta.url);
const titleFile = {
  _source:
    "Titles from the game's own AccountTitleData/StringData, written by scripts/gen-catalog-extras.mjs. id/64 = tb_title CATEGORY, id%64 = bit.",
  titles,
};
writeFileSync(titlesPath, `${JSON.stringify(titleFile, null, 2)}\n`);
console.log(`wrote ${titles.length} titles, ${titles.filter((title) => title.stats).length} with stat bonuses`);
