#!/usr/bin/env node
// Write crates/core/data/titles.json and skills.json from the game's own
// tables. (items.json, item_categories.json and recipes.json come from
// scripts/gen-catalog.mjs.)
//
// Usage: node scripts/gen-catalog-extras.mjs <extract-dir> <root-maps.json>
//
// <extract-dir> holds the game's XML tables (see scripts/gen-growth.mjs).
// <root-maps.json> is the skill-screen colour map decoded from the game's
// /Game/UI/Root/DRootIngame by tools/asset-export/decode_root.py (see
// docs/game-assets.md).
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
// strings (EFFECTS below) and draws the State_Mark_<state> badge. The disc
// colour of every IconColor, ATTACK included, is the root widget's
// MesmerizedUIColor map.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [extractDir, rootMapsPath] = process.argv.slice(2);
if (!extractDir || !rootMapsPath) {
  console.error('usage: node scripts/gen-catalog-extras.mjs <extract-dir> <root-maps.json>');
  process.exit(2);
}

function fail(message) {
  console.error(`gen-catalog-extras: ${message}`);
  process.exit(1);
}

const ENTITIES = { lt: '<', gt: '>', quot: '"', amp: '&', apos: "'" };
/** An XML attribute value with its entities decoded, so a name reads "Hero's", not "Hero&apos;s". */
function decode(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, entity) => {
    if (entity[0] !== '#') return ENTITIES[entity] ?? whole;
    const code =
      entity[1] === 'x' || entity[1] === 'X' ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return String.fromCodePoint(code);
  });
}

/** Rows of a table as attribute maps, the way gen-growth.mjs reads them, entities decoded. */
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

/** IconColor -> #rrggbb from DRootIngame's MesmerizedUIColor. */
const effectColors = new Map(
  JSON.parse(readFileSync(rootMapsPath, 'utf8')).MesmerizedUIColor.map((entry) => [
    entry.key.replace('EMesmerizedUIType::', ''),
    entry.hex.toLowerCase(),
  ]),
);
for (const key of ['ATTACK', ...Object.keys(EFFECTS)]) {
  if (!effectColors.has(key)) fail(`MesmerizedUIColor has no colour for ${key}`);
}

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
  attackColor: effectColors.get('ATTACK'),
  effects: Object.fromEntries(
    Object.entries(EFFECTS).map(([key, { string, badge }]) => {
      const name = strings.get(string);
      if (!name?.En) fail(`effect ${key} has no name (string ${string})`);
      const effect = {
        nameEn: name.En.trim(),
        nameFr: (name.Fr || name.En).trim(),
        color: effectColors.get(key),
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
