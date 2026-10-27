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
//
// skills.json is rebuilt whole from PCSkillGrowthData: each hero's skill
// slots as the game's Skill screen shows them. TypeValue is the save's
// tb_skill_growth TYPE_VALUE; SlotOrder 1-4 is the left column (attack, jump
// attack, dodge, roll attack), 5-8 the right column (two actives, two
// signals) and 9 the master skill. The icon is a texture or a Paper2D
// sprite; the export has each sprite's texture as a PNG without the _Sprite
// suffix, and scripts/gen-icons.mjs packs it and writes the offsets.
//
// A skill's effect (the coloured disc and corner badge in the game) is the
// IconColor of its first combo step: PCCharacterData.ComboTableID names the
// hero's rows in PCComboData, and GroupIndex is the skill's TypeValue. ATTACK
// is a plain skill. The game's Skill screen names each effect with fixed UI
// strings (EFFECTS below) and draws the State_Mark_<state> badge.

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

/** Each IconColor's name string (the Skill screen's own) and badge texture. */
const EFFECTS = {
  STUN: { string: '800037', badge: 'STUN' },
  AIR: { string: '800038', badge: 'AIR' },
  DOWN: { string: '800039', badge: 'DOWN' },
  BLEED: { string: '800040', badge: 'BLEEDING' },
  SHOCK: { string: '800041', badge: 'SHOCK' },
  FIRE: { string: '800042', badge: 'FIRE' },
  POISON: { string: '800043', badge: 'POISON' },
  ICE: { string: '800044', badge: 'ICE' },
  HEAL: { string: '800051', badge: 'HEAL' },
};

const comboTables = new Map(rows('PCCharacterData').map((row) => [row.ID, row.ComboTableID]));
/** "comboTable:group" -> IconColor of the group's first combo step. */
const comboColors = new Map();
for (const row of rows('PCComboData').sort((left, right) => Number(left.SubGroupIndex) - Number(right.SubGroupIndex))) {
  const key = `${row.ID}:${row.GroupIndex}`;
  if (!comboColors.has(key)) comboColors.set(key, row.IconColor);
}

/** A StringData text without the game's colour tags (<LightOrange>…</>). */
function plain(text) {
  return text.replace(/<[^<>]*>/g, '').trim();
}

const heroSkills = {};
for (const row of rows('PCSkillGrowthData')) {
  const cid = row.CharacterID;
  const type = Number(row.TypeValue);
  heroSkills[cid] ??= {};
  // Every level of a slot names the same skill; keep the first row.
  if (heroSkills[cid][type]) continue;
  const name = strings.get(row.Name);
  if (!name?.En) fail(`hero ${cid} skill ${type} has no English name (string ${row.Name})`);
  const desc = strings.get(row.SkillDesc_1 || row.SkillDesc);
  const color = comboColors.get(`${comboTables.get(cid)}:${row.TypeValue}`);
  if (color && color !== 'ATTACK' && !EFFECTS[color]) fail(`hero ${cid} skill ${type} has unknown effect ${color}`);
  const icon = row.Icon.match(/'\/Game\/([^.']+?)(?:_Sprite)?\./)?.[1];
  if (!icon) fail(`hero ${cid} skill ${type} has no sprite icon: ${row.Icon}`);
  heroSkills[cid][type] = {
    type,
    order: Number(row.SlotOrder),
    master: row.SkllType === 'MASTER',
    // SlotType 3: the two signal skills, which the game draws as diamonds.
    signal: row.SlotType === '3',
    nameEn: name.En.trim(),
    nameFr: (name.Fr || name.En).trim(),
    descEn: desc?.En ? plain(desc.En) : '',
    descFr: desc ? plain(desc.Fr || desc.En) : '',
    iconPath: icon,
    ...(EFFECTS[color] && { effect: color }),
    x: 0,
    y: 0,
  };
}
const skillsPath = new URL('../crates/core/data/skills.json', import.meta.url);
const skillFile = {
  _source:
    "Each hero's skill slots from the game's own PCSkillGrowthData/StringData, written by scripts/gen-catalog-extras.mjs; icon offsets come from scripts/gen-icons.mjs. type = tb_skill_growth TYPE_VALUE, order = the game's SlotOrder.",
  effects: Object.fromEntries(
    Object.entries(EFFECTS).map(([key, { string, badge }]) => {
      const name = strings.get(string);
      if (!name?.En) fail(`effect ${key} has no name (string ${string})`);
      const effect = {
        nameEn: name.En.trim(),
        nameFr: (name.Fr || name.En).trim(),
        iconPath: `Art/UI/InGame/Common/State/State_Mark_${badge}`,
        x: 0,
        y: 0,
      };
      return [key, effect];
    }),
  ),
  heroes: Object.fromEntries(
    Object.entries(heroSkills).map(([cid, slots]) => [
      cid,
      Object.values(slots).sort((left, right) => left.order - right.order),
    ]),
  ),
};
for (const [cid, slots] of Object.entries(skillFile.heroes)) {
  const orders = slots.map((slot) => slot.order).join(',');
  if (orders !== '1,2,3,4,5,6,7,8,9') fail(`hero ${cid} has skill slots ${orders}, not 1-9`);
}
writeFileSync(skillsPath, `${JSON.stringify(skillFile, null, 2)}\n`);
console.log(`wrote skills for ${Object.keys(skillFile.heroes).length} heroes`);
