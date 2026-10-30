#!/usr/bin/env node
// Build the editor's catalog from the game's own tables: every item, hero and
// familiar (crates/core/data/items.json), the item categories
// (item_categories.json) and every cooking recipe (recipes.json).
//
// Usage: node scripts/gen-catalog.mjs <extract-dir>
//
// <extract-dir> holds the game's XML tables (see docs/game-rules.md). Run
// scripts/gen-icons.mjs afterwards: it packs each entry's icon and writes the
// sprite offsets (`x`, `y`) back into items.json.
//
// items.json, keyed by CID:
// - every GameItemData row: its English and French name (StringData), its
//   ItemType (`type`), grade, category (`group`, a GameItemCategoryData row)
//   and icon (`iconPath`, the IconName's game path). The editor files it under
//   one of its own catalog categories by ItemType: PAY_* and PLAY_POINT_* are
//   currencies, CHARACTER a hero item, VEHICLE a familiar, EQUIPMENT gear,
//   COOKING a dish, COSTUME a costume, and everything else a material. The
//   few test and system items whose Name string the game does not ship (master
//   buff dishes, placeholder coins, an unreleased hero's items) keep no name:
//   the editor names them by category and CID and counts them as unknown;
// - every playable hero (PCCharacterData, IsUserCharacter, CIDs 10000-10999),
//   by its CID as tb_character stores it. Four unreleased heroes share the
//   name Lyn and two share Kalien; those whose art (ImageType) differs from
//   the name get it in brackets, so the lists can tell them apart;
// - every familiar without a GameItemData row (VehicleCharacterData), under
//   the only name the game has for it, its Korean Name.
//
// item_categories.json: every GameItemCategoryData row an item or a recipe
// uses, named from StringData; `group` is its CategoryType, which is also the
// game's inventory tab.
//
// recipes.json: every CookRecipeData row. `key` is its CookBook_SwitchData,
// the tb_switch bit the save sets when the recipe is learned (category =
// key / 64, bit = key % 64); `tool` its ToolType; `ingredients` its up to
// three IngredientCond: an INGREDIENT_ID names an item, an INGREDIENT_TYPE a
// category of ingredients; `dishes` the five Cook_ID dishes from normal to
// legendary. A dish's Value1 is its ContentsBuffData row: the row's Name is
// the effect's name ("Recovery"), its Desc the effect at that grade
// ("[Team] Immediately restores 850 HP."). An ingredient category is drawn
// with the icon of its lowest-grade ingredient (lowest CID on a tie).

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [extractDir] = process.argv.slice(2);
if (!extractDir) {
  console.error('usage: node scripts/gen-catalog.mjs <extract-dir>');
  process.exit(2);
}

function fail(message) {
  console.error(`gen-catalog: ${message}`);
  process.exit(1);
}

const ENTITIES = { lt: '<', gt: '>', quot: '"', amp: '&', apos: "'" };
/** An XML attribute value with its entities decoded. */
function decode(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, entity) => {
    if (entity[0] !== '#') return ENTITIES[entity] ?? whole;
    const code =
      entity[1] === 'x' || entity[1] === 'X' ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return String.fromCodePoint(code);
  });
}

/** Rows of a table as attribute maps, entities decoded. */
function rows(table) {
  const text = readFileSync(join(extractDir, `${table}.xml`), 'utf8');
  const out = [];
  for (const element of text.matchAll(/<[\w-]+:\w+\s([^<>]*?)\/>/g)) {
    const row = {};
    for (const attribute of element[1].matchAll(/[\w-]+:(\w+)="([^"]*)"/g)) row[attribute[1]] = decode(attribute[2]);
    out.push(row);
  }
  if (out.length === 0) fail(`${table} has no rows`);
  return out;
}

const strings = new Map(rows('StringData').map((row) => [row.ID, row]));
/** A string in English and French (French falls back to English), or null. */
function text(id) {
  const row = strings.get(String(id ?? ''));
  const en = row?.En?.trim();
  if (!en) return null;
  return { en, fr: row.Fr?.trim() || en };
}

const GRADES = { NORMAL: 1, SUPERIOR: 2, RARE: 3, EPIC: 4, LEGENDARY: 5 };

/** The editor's catalog category for a GameItemData ItemType. */
function catalogCategory(type) {
  if (/^(PAY_|PLAY_POINT_)/.test(type)) return 'currency';
  return (
    { CHARACTER: 'character', VEHICLE: 'mount', EQUIPMENT: 'gear', COOKING: 'food', COSTUME: 'costume' }[type] ??
    'material'
  );
}

// ------------------------------------------------------------------- items

const gameItems = rows('GameItemData');
const items = {};
for (const row of gameItems) {
  if (!row.ItemType) fail(`item ${row.ID} has no ItemType`);
  if (!GRADES[row.Grade]) fail(`item ${row.ID} has grade ${row.Grade}`);
  const name = text(row.Name);
  // IconName looks like /Script/Engine.Texture2D'/Game/Art/X/Y.Y'.
  const icon = row.IconName?.match(/'\/Game\/([^.']+)/)?.[1];
  items[row.ID] = {
    ...(name && { fr: name.fr, en: name.en }),
    category: catalogCategory(row.ItemType),
    type: row.ItemType,
    grade: row.Grade.toLowerCase(),
    ...(row.Category && { group: row.Category }),
    ...(icon && { iconPath: icon }),
    x: 0,
    y: 0,
  };
}

// Playable heroes by their CID; a name several heroes share gets the art's name.
const heroes = rows('PCCharacterData').filter(
  (row) => row.IsUserCharacter === 'true' && Number(row.ID) >= 10000 && Number(row.ID) < 11000,
);
// Two string IDs can hold the same name (Kalien is 720420 and 730031), so count names by text.
const nameUses = new Map();
for (const row of heroes) {
  const en = text(row.Name)?.en;
  nameUses.set(en, (nameUses.get(en) ?? 0) + 1);
}
for (const row of heroes) {
  if (items[row.ID]) fail(`hero ${row.ID} is also an item CID`);
  const name = text(row.Name);
  if (!name) fail(`hero ${row.ID} has no name (string ${row.Name})`);
  const shared = nameUses.get(name.en) > 1 && row.ImageType && row.ImageType !== name.en;
  items[row.ID] = {
    fr: shared ? `${name.fr} (${row.ImageType})` : name.fr,
    en: shared ? `${name.en} (${row.ImageType})` : name.en,
    category: 'character',
    x: 0,
    y: 0,
  };
}

// Familiars the game has no item row for.
for (const row of rows('VehicleCharacterData')) {
  if (items[row.ID]) continue;
  if (!row.Name) fail(`familiar ${row.ID} has no name`);
  items[row.ID] = { fr: row.Name, en: row.Name, category: 'mount', x: 0, y: 0 };
}

// --------------------------------------------------------------- recipes

const dishBuffs = new Map(rows('ContentsBuffData').map((row) => [row.ID, row]));
const itemRows = new Map(gameItems.map((row) => [row.ID, row]));
const recipes = [];
const typeCategories = new Set();
for (const row of rows('CookRecipeData')) {
  const key = Number(row.CookBook_SwitchData);
  if (!key) fail(`recipe ${row.ID} has no CookBook_SwitchData`);
  const ingredients = [];
  for (const index of [1, 2, 3]) {
    const type = row[`IngredientCond${index}_Type`];
    const value = Number(row[`IngredientCond${index}_Value`]);
    if (!type) continue;
    if (type === 'INGREDIENT_ID') {
      if (!items[value]) fail(`recipe ${row.ID} needs item ${value}, which GameItemData lacks`);
      ingredients.push({ kind: 'item', id: value });
    } else if (type === 'INGREDIENT_TYPE') {
      typeCategories.add(String(value));
      ingredients.push({ kind: 'type', id: value });
    } else {
      fail(`recipe ${row.ID} has ingredient type ${type}`);
    }
  }
  const dishes = [1, 2, 3, 4, 5].map((index) => Number(row[`Cook_ID${index}`]));
  for (const dish of dishes) {
    if (items[dish]?.category !== 'food') fail(`recipe ${row.ID} makes ${dish}, which is not a dish`);
  }
  const buffs = dishes.map((dish) => dishBuffs.get(itemRows.get(String(dish))?.Value1 ?? ''));
  const effectName = buffs[0] ? text(buffs[0].Name) : null;
  const effects = buffs.map((buff) => (buff ? text(buff.Desc) : null)).filter(Boolean);
  recipes.push({
    key,
    tool: row.ToolType,
    ingredients,
    dishes,
    ...(effectName && { effectName: { fr: effectName.fr, en: effectName.en } }),
    effects: effects.map((effect) => ({ fr: effect.fr, en: effect.en })),
  });
}
recipes.sort((left, right) => left.key - right.key);
const keys = new Set(recipes.map((recipe) => recipe.key));
if (keys.size !== recipes.length) fail('two recipes share a CookBook_SwitchData key');

const tools = rows('CookToolData').map((row) => {
  const name = text(row.Name);
  if (!name) fail(`cooking tool ${row.ToolType} has no name`);
  return { type: row.ToolType, labelFr: name.fr, labelEn: name.en };
});

// Each ingredient category's icon: its lowest-grade ingredient, lowest CID on a tie.
const ingredientTypeIcons = {};
for (const category of [...typeCategories].sort()) {
  const [first] = gameItems
    .filter((row) => row.ItemType === 'COOKING_INGREDIENT' && row.Category === category)
    .sort((left, right) => GRADES[left.Grade] - GRADES[right.Grade] || Number(left.ID) - Number(right.ID));
  if (!first) fail(`ingredient category ${category} has no ingredient`);
  ingredientTypeIcons[category] = Number(first.ID);
}

// ----------------------------------------------------------- categories

const usedCategories = new Set([
  ...typeCategories,
  ...Object.values(items)
    .map((item) => item.group)
    .filter(Boolean),
]);
const categories = [];
for (const row of rows('GameItemCategoryData')) {
  if (!usedCategories.has(row.ID)) continue;
  const name = text(row.Name);
  if (!name) fail(`category ${row.ID} has no name (string ${row.Name})`);
  categories.push({ key: row.ID, labelFr: name.fr, labelEn: name.en, group: row.CategoryType });
}
for (const id of usedCategories) {
  if (!categories.some((category) => category.key === id))
    fail(`category ${id} is used but GameItemCategoryData lacks it`);
}

// ---------------------------------------------------------------- write

const data = (file) => new URL(`../crates/core/data/${file}`, import.meta.url);
const SOURCE = "from the game's own XML tables (DS/Content/__GeneratedGameData__/Server/XML/GameData in the paks)";
writeFileSync(
  data('items.json'),
  `${JSON.stringify(
    {
      _source: `Every item (GameItemData), playable hero (PCCharacterData) and familiar (VehicleCharacterData) ${SOURCE}, named from StringData, written by scripts/gen-catalog.mjs; icons are the game's own textures, packed by scripts/gen-icons.mjs from the export described in docs/game-assets.md.`,
      iconSize: 128,
      items,
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  data('item_categories.json'),
  `${JSON.stringify(
    {
      _source: `Every item category an item or a recipe uses (GameItemCategoryData) ${SOURCE}, named from StringData, written by scripts/gen-catalog.mjs. group is the category's CategoryType, the game's inventory tab.`,
      categories,
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  data('recipes.json'),
  `${JSON.stringify(
    {
      _source: `Cooking recipes (CookRecipeData, CookToolData) and dish effects (ContentsBuffData) ${SOURCE}, written by scripts/gen-catalog.mjs. key is CookBook_SwitchData: tb_switch category = key/64, bit = key%64.`,
      tools,
      ingredientTypeIcons,
      recipes,
    },
    null,
    2,
  )}\n`,
);
const counts = {};
for (const item of Object.values(items)) counts[item.category] = (counts[item.category] ?? 0) + 1;
console.log(
  `wrote ${Object.keys(items).length} catalog entries (${Object.entries(counts)
    .map(([category, count]) => `${count} ${category}`)
    .join(', ')}), ${categories.length} categories, ${recipes.length} recipes`,
);
const unnamed = Object.entries(items).filter(([, item]) => !item.en);
if (unnamed.length > 0) console.log(`no name in the game's strings: ${unnamed.map(([cid]) => cid).join(', ')}`);
