#!/usr/bin/env node
// Write crates/core/data/game.json: the game's own maths and texts for heroes,
// equipment, karma, costumes, skills and items, from the XML tables in its paks.
//
// Usage: node scripts/gen-game-data.mjs <extract-dir>
//
// <extract-dir> holds the game's XML tables (see scripts/gen-growth.mjs). Run
// scripts/gen-icons.mjs afterwards: it packs every `iconPath` this file names
// into the sprite and writes the cell offsets back (`x`, `y`).
//
// Stats (docs/game-rules.md, "Hero stats", has the checks against the game):
// - A "Dynamic" hero turns points into stats: points = Default_Value ×
//   CharacterRatio_<grade>(level), and a stat = points × its *_Value_Ratio /
//   StatListData.StatValue (14 points per Attack, 20 per Defence, 1.3 per Max
//   HP). StatDefaultData gives the hero's base Critical Rate and Damage; its
//   flat HP/Attack/Defence are not used by Dynamic heroes.
// - A breakthrough adds StatAscendData points, split by its own ratios.
// - Equipment: a main or sub stat is the piece's default points ×
//   EquipmentLevelData.StatRatio(grade, enchant) × the roll's StatRatio /
//   StatValue. Sub stats open one per MaxEnchant / MaxSubOption levels (+3,
//   +6, +9 …), as the item card's "+{0} needed" shows.
// - Karma: points = Default_Value × KarmaRatio(grade, level), split like a
//   hero's; its KarmaTranscendData trait applies only to a hero of the same
//   CharacterAbilityType.
// - Sets: EquipmentSetData bonuses for 2 and 3 pieces of one SetID.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [extractDir] = process.argv.slice(2);
if (!extractDir) {
  console.error('usage: node scripts/gen-game-data.mjs <extract-dir>');
  process.exit(2);
}

function fail(message) {
  console.error(`gen-game-data: ${message}`);
  process.exit(1);
}

const ENTITIES = { lt: '<', gt: '>', quot: '"', amp: '&', apos: "'" };
/** An XML attribute value with its entities decoded (the tables escape <, >, " and newlines). */
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

const num = (value) => (value === undefined || value === '' ? 0 : Number(value));
/** "/Script/Engine.Texture2D'/Game/Art/X/Y.Y'" (or a _Sprite) -> "Art/X/Y". */
function gamePath(reference) {
  const path =
    reference?.match(/'\/Game\/([^.']+?)(?:_Sprite)?\./)?.[1] ??
    reference?.match(/^\/Game\/([^.']+?)(?:_Sprite)?\./)?.[1];
  return path ?? null;
}

const strings = new Map(rows('StringData').map((row) => [row.ID, row]));
/** A string in English and French; the game's rich-text tags are kept. */
function text(id) {
  const row = strings.get(String(id));
  if (!row?.En) return null;
  return { en: row.En.trim(), fr: (row.Fr || row.En).trim() };
}
function requireText(id, what) {
  const found = text(id);
  if (!found) fail(`${what} has no string ${id}`);
  return found;
}
/** Fill {0}, {1} … from a "#"-separated StringVarArr. */
function fill(found, vars) {
  if (!found) return null;
  const values = vars ? String(vars).split('#') : [];
  const apply = (s) => s.replace(/\{(\d+)\}/g, (whole, index) => values[Number(index)] ?? whole);
  return { en: apply(found.en), fr: apply(found.fr) };
}

// ------------------------------------------------------------------- stats

const statRows = rows('StatListData');
const statKeys = new Map(statRows.map((row) => [row.StatKey.toLowerCase(), row.StatKey]));
/** The StatListData key for a stat name; the equipment tables write MaxHP for MAXHP. */
function stat(key, where) {
  const canonical = statKeys.get(String(key).toLowerCase());
  if (!canonical) fail(`${where} names stat ${key}, which StatListData lacks`);
  return canonical;
}
const stats = {};
for (const row of statRows) {
  const name = text(row.Name);
  stats[row.StatKey] = {
    nameEn: name?.en ?? row.StatKey,
    nameFr: name?.fr ?? row.StatKey,
    percent: row.IsPercentage === 'true',
    points: num(row.StatValue),
    show: row.StatVisibility || 'Hidden',
  };
}
for (const key of ['Attack', 'Defence', 'MAXHP', 'Critical_Per', 'CriticalDmg_Per']) {
  if (!stats[key]?.points) fail(`stat ${key} has no point value`);
}

// ------------------------------------------------------------------ traits

// A hero's or karma's CharacterAbilityType is its trait. Its name is the
// karma inventory category of the same trait (1400-1408), found through the
// karma items, and its emblem Common/Icon_CharacterAbility_<Type> (the game
// spells Hemorrhage "Hemorrahage" there).
const items = new Map(rows('GameItemData').map((row) => [row.ID, row]));
const categories = new Map(rows('GameItemCategoryData').map((row) => [row.ID, row]));
const karmaRows = rows('KarmaData');
const traitCategory = new Map();
for (const karma of karmaRows) {
  const item = items.get(karma.ID);
  if (!item || !karma.CharacterAbilityType) continue;
  const known = traitCategory.get(karma.CharacterAbilityType);
  if (known && known !== item.Category)
    fail(`trait ${karma.CharacterAbilityType} is in karma categories ${known} and ${item.Category}`);
  traitCategory.set(karma.CharacterAbilityType, item.Category);
}
const EMBLEMS = { HEMORRHAGE: 'Hemorrahage' };
const traits = {};
for (const [key, category] of [...traitCategory].sort()) {
  const name = requireText(categories.get(category)?.Name, `trait ${key}`);
  const emblem = EMBLEMS[key] ?? key[0] + key.slice(1).toLowerCase();
  traits[key] = {
    nameEn: name.en,
    nameFr: name.fr,
    iconPath: `Art/UI/InGame/Common/Icon_CharacterAbility_${emblem}`,
    x: 0,
    y: 0,
  };
}

// ------------------------------------------------------------------ heroes

const levelRatio = { EPIC: [], LEGENDARY: [] };
for (const row of rows('PCCharacterLevelData').sort((a, b) => num(a.CharacterLevel) - num(b.CharacterLevel))) {
  levelRatio.EPIC.push(num(row.CharacterRatio_EPIC));
  levelRatio.LEGENDARY.push(num(row.CharacterRatio_LEGENDARY));
}
const statDefaults = new Map(rows('StatDefaultData').map((row) => [row.ID, row]));
const statAscends = new Map();
for (const row of rows('StatAscendData')) {
  if (!statAscends.has(row.ID)) statAscends.set(row.ID, []);
  statAscends.get(row.ID)[num(row.Ascend)] = row;
}
/** "StatList1" / "StatListValue1" style extras as { stat: value }. */
function extras(row, keyColumn, valueColumn, where) {
  const out = {};
  for (let index = 1; index <= 5; index += 1) {
    const key = row[keyColumn(index)];
    if (!key || key === 'NONE' || key === 'None') continue;
    out[stat(key, where)] = (out[stat(key, where)] ?? 0) + num(row[valueColumn(index)]);
  }
  return out;
}
function ascendSteps(id, where) {
  const steps = statAscends.get(String(id)) ?? [];
  return steps.map((row, ascend) => {
    if (!row) fail(`${where} skips breakthrough ${ascend} in StatAscendData ${id}`);
    return {
      points: num(row.Default_Value),
      ratios: {
        hp: num(row.AscendHP_Value_Ratio),
        attack: num(row.AscendAttack_Value_Ratio),
        defence: num(row.AscendDefence_Value_Ratio),
      },
      stats: extras(
        row,
        (i) => `StatList${i}`,
        (i) => `StatList${i}_Value_Ratio`,
        where,
      ),
    };
  });
}

const transcendSteps = new Map();
for (const row of rows('TranscendData')) {
  if (!transcendSteps.has(row.CharacterID)) transcendSteps.set(row.CharacterID, []);
  const statsOf = {};
  for (let index = 1; index <= 5; index += 1) {
    const key = row[`AddStatID${index}`];
    if (key && key !== '0' && statKeys.has(key.toLowerCase()))
      statsOf[stat(key, `TranscendData ${row.ID}`)] = num(row[`StatValue${index}`]);
  }
  const name = text(row.Name);
  const desc = text(row.Description);
  transcendSteps.get(row.CharacterID).push({
    step: num(row.TranscendStep),
    nameEn: name?.en ?? '',
    nameFr: name?.fr ?? '',
    descEn: desc?.en ?? '',
    descFr: desc?.fr ?? '',
    item: num(row.NeedItem),
    ...(Object.keys(statsOf).length > 0 && { stats: statsOf }),
  });
}

/** Max Stamina: GlobalControlData 12203, the most stamina natural recovery fills. */
const globals = new Map(rows('GlobalControlData').map((row) => [row.ID, row]));
const maxStamina = num(globals.get('12203')?.Value);
if (maxStamina !== 240) fail(`GlobalControlData 12203 (max stamina) is ${maxStamina}, expected 240`);

const comboTables = new Map();
const heroes = {};
for (const row of rows('PCCharacterData')) {
  comboTables.set(row.ID, row.ComboTableID);
  if (row.IsUserCharacter !== 'true' || row.Stat_Type !== 'Dynamic') continue;
  const where = `hero ${row.ID}`;
  const grade = row.Grade === 'LEGEND' ? 'LEGENDARY' : row.Grade;
  if (!levelRatio[grade]) fail(`${where} has grade ${row.Grade}, which PCCharacterLevelData has no ratio for`);
  const defaults = statDefaults.get(row.StatDefault_ID);
  if (!defaults) fail(`${where} has no StatDefaultData ${row.StatDefault_ID}`);
  const base = {
    Critical_Per: num(defaults.Default_Critical_Per),
    CriticalDmg_Per: num(defaults.Default_CriticalDmg_Per),
    CriticalResist_Per: num(defaults.Default_CriticalResist_Per),
    CriticalDefence_Per: num(defaults.Default_CriticalDefence_Per),
  };
  for (const [key, value] of Object.entries(
    extras(
      defaults,
      (i) => `StatList${i}`,
      (i) => `StatListValue${i}`,
      where,
    ),
  )) {
    base[key] = (base[key] ?? 0) + value;
  }
  // The hero's Desc is the Information screen's quote and story, split by a blank line.
  const desc = text(row.Desc);
  const [quoteEn, ...bioEn] = (desc?.en ?? '').split(/\n\s*\n/);
  const [quoteFr, ...bioFr] = (desc?.fr ?? '').split(/\n\s*\n/);
  heroes[row.ID] = {
    grade,
    trait: row.CharacterAbilityType || null,
    points: num(row.Default_Value),
    ratios: { hp: num(row.HP_Value_Ratio), attack: num(row.Attack_Value_Ratio), defence: num(row.Defence_Value_Ratio) },
    base,
    ascend: ascendSteps(row.StatAscend_ID, where),
    image: row.ImageType,
    quoteEn: quoteEn?.trim() ?? '',
    quoteFr: quoteFr?.trim() ?? '',
    bioEn: bioEn.join('\n\n').trim(),
    bioFr: bioFr.join('\n\n').trim(),
    awaken: (transcendSteps.get(row.ID) ?? []).sort((a, b) => a.step - b.step),
  };
}

// --------------------------------------------------------------- equipment

const statRolls = {};
for (const table of ['EquipmentMainStatData', 'EquipmentSubStatData']) {
  for (const row of rows(table)) {
    if (statRolls[row.ID]) fail(`stat roll ${row.ID} is in two tables`);
    statRolls[row.ID] = [stat(row.StatList, `${table} ${row.ID}`), num(row.StatRatio)];
  }
}
const enchant = {};
for (const row of rows('EquipmentLevelData')) {
  enchant[row.Grade] ??= { ratio: [], exp: [], maxEnchant: 0, maxSubs: 0 };
  enchant[row.Grade].ratio[num(row.EnchantLevel)] = num(row.StatRatio);
  enchant[row.Grade].exp[num(row.EnchantLevel)] = num(row.LevelMaxExp);
}
for (const row of rows('EquipmentSettingData')) {
  if (!enchant[row.Grade]) fail(`EquipmentSettingData grade ${row.Grade} has no EquipmentLevelData rows`);
  enchant[row.Grade].maxEnchant = num(row.MaxEnchant);
  enchant[row.Grade].maxSubs = num(row.MaxSubOption);
  if (enchant[row.Grade].ratio.length !== num(row.MaxEnchant) + 1)
    fail(`grade ${row.Grade} has ${enchant[row.Grade].ratio.length} enchant ratios for max +${row.MaxEnchant}`);
}
const equipment = {};
for (const row of rows('EquipmentData')) {
  const subs = [];
  for (let index = 1; index <= 5; index += 1) {
    if (num(row[`Sub${index}_Stat_GroupID`]))
      subs.push([num(row[`Sub${index}_Stat_GroupID`]), num(row[`Sub${index}_Default_Value`])]);
  }
  const grade = items.get(row.ItemID)?.Grade;
  if (!grade) fail(`equipment ${row.ItemID} has no GameItemData grade`);
  equipment[row.ItemID] = {
    part: row.PartsType,
    grade,
    ...(row.CharacterAbilityType && { trait: row.CharacterAbilityType }),
    main: [num(row.Main_Stat_GroupID), num(row.Main_Default_Value)],
    subs,
    ...(num(row.SetID) && { set: num(row.SetID) }),
  };
}

const equipmentSkills = new Map(rows('EquipmentSkillData').map((row) => [row.ID, row]));
const setLabel = requireText('102502', 'the set label');
const sets = {};
for (const row of rows('EquipmentSetData')) {
  const name = requireText(row.Name, `set ${row.ID}`);
  sets[row.ID] ??= {
    nameEn: name.en,
    nameFr: name.fr,
    ...(row.CharacterAbilityType && { trait: row.CharacterAbilityType }),
    bonuses: [],
  };
  const skills = [];
  for (let index = 1; index <= 3; index += 1) {
    const skill = equipmentSkills.get(row[`SkillID${index}`]);
    const desc = skill && num(skill.DescStringID) ? text(skill.DescStringID) : null;
    if (desc) skills.push({ en: desc.en, fr: desc.fr });
  }
  const statsOf = extras(
    row,
    (i) => `StatList${i}`,
    (i) => `StatList${i}Value`,
    `set ${row.ID}`,
  );
  sets[row.ID].bonuses.push({
    count: num(row.Set),
    labelEn: setLabel.en.replace('{0}', row.Set),
    labelFr: setLabel.fr.replace('{0}', row.Set),
    stats: statsOf,
    skills,
  });
}
for (const set of Object.values(sets)) set.bonuses.sort((a, b) => a.count - b.count);

// ------------------------------------------------------------------- karma

const karmaLevels = {};
for (const row of rows('KarmaLevelData').sort((a, b) => num(a.Level) - num(b.Level))) {
  karmaLevels[row.Grade] ??= { ratio: [], exp: [] };
  karmaLevels[row.Grade].ratio.push(num(row.KarmaRatio));
  karmaLevels[row.Grade].exp.push(num(row.LevelExp));
}
const karmaTraits = new Map();
for (const row of rows('KarmaTranscendData')) {
  if (!karmaTraits.has(row.KarmaID)) karmaTraits.set(row.KarmaID, []);
  const desc = fill(text(row.AbilityDescription), row.StringVarArr);
  const own = fill(text(row.PrivateDescription), row.StringVarArr2);
  karmaTraits.get(row.KarmaID)[num(row.Transcend)] = {
    stats: extras(
      row,
      (i) => `StatList${i}`,
      (i) => `StatList${i}Value`,
      `KarmaTranscendData ${row.ID}`,
    ),
    descEn: desc?.en ?? '',
    descFr: desc?.fr ?? '',
    ...(own && { ownEn: own.en, ownFr: own.fr }),
  };
}
const karma = {};
for (const row of karmaRows) {
  const where = `karma ${row.ID}`;
  if (!karmaLevels[row.Grade]) fail(`${where} has grade ${row.Grade}, which KarmaLevelData lacks`);
  karma[row.ID] = {
    grade: row.Grade,
    trait: row.CharacterAbilityType || null,
    points: num(row.Default_Value),
    ratios: { hp: num(row.HP_Value_Ratio), attack: num(row.Attack_Value_Ratio), defence: num(row.Defence_Value_Ratio) },
    ascend: ascendSteps(row.StatAscend_ID, where),
    traitEffects: karmaTraits.get(row.ID) ?? [],
    ...(gamePath(row.Image) && { cardPath: gamePath(row.Image) }),
  };
}

// ---------------------------------------------------------------- costumes

// A costume item's Value1 is its CostumeData row. Wearing a CLOTH costume
// switches the hero's portrait (SwitchIconChrPath) and team icon
// (SwitchIconTeamSettingPath); the WEAPON row of the same set names the same
// images.
const costumeRows = new Map(rows('CostumeData').map((row) => [row.ID, row]));
const costumes = {};
for (const [id, item] of items) {
  if (item.ItemType !== 'COSTUME') continue;
  const row = costumeRows.get(item.Value1);
  if (!row) {
    // 9990023, Kalien's Great Spirit's Vestment Weapon, names a row the game never shipped.
    console.warn(`costume item ${id} names CostumeData ${item.Value1}, which is missing; skipped`);
    continue;
  }
  const name = text(row.NameStringId) ?? text(item.Name);
  costumes[id] = {
    costume: num(row.ID),
    hero: num(row.EquipCharacterId),
    slot: row.CostumeEquipType,
    set: num(row.SetId),
    nameEn: name?.en ?? '',
    nameFr: name?.fr ?? '',
    ...(gamePath(row.CosImgPath) && { cardPath: gamePath(row.CosImgPath) }),
    ...(gamePath(row.SwitchIconChrPath) && { iconPath: gamePath(row.SwitchIconChrPath), x: 0, y: 0 }),
    ...(gamePath(row.SwitchIconTeamSettingPath) && { teamPath: gamePath(row.SwitchIconTeamSettingPath) }),
  };
}

// ------------------------------------------------------------------ skills

// Per hero and skill slot (TYPE_VALUE), the Skill screen's text and each
// level's numbers. SkillDesc_1 is the description, _2 the damage line (its
// {0} is the PCComboLevelData AttackWeight × 100 of the slot's first combo
// step at that level), _3 the status effect it inflicts and _4 the notes,
// such as Activation Conditions. A level's row lists what raising the skill
// TO that level costs, and the breakthrough it needs.
const comboLevels = new Map();
for (const row of rows('PCComboLevelData')) {
  const key = `${row.ComboID}:${row.GroupIndex}:${row.Level}`;
  const known = comboLevels.get(key);
  if (!known || num(row.SubGroupIndex) < num(known.SubGroupIndex)) comboLevels.set(key, row);
}
const skills = {};
for (const row of rows('PCSkillGrowthData')) {
  const hero = row.CharacterID;
  skills[hero] ??= {};
  skills[hero][row.TypeValue] ??= { lines: {}, levels: [] };
  const slot = skills[hero][row.TypeValue];
  for (const index of [1, 2, 3, 4]) {
    const line = text(row[`SkillDesc_${index}`]);
    if (line && !slot.lines[index]) slot.lines[index] = line;
  }
  const level = num(row.SlotLevel);
  const combo = comboLevels.get(`${comboTables.get(hero)}:${row.TypeValue}:${level}`);
  const need = [];
  for (let index = 1; index <= 4; index += 1) {
    if (num(row[`NeedItemID${index}`])) need.push([num(row[`NeedItemID${index}`]), num(row[`NeedItemCount${index}`])]);
  }
  slot.levels[level - 1] = {
    level,
    ...(combo && num(combo.AttackWeight) > 0 && { damage: Math.round(num(combo.AttackWeight) * 100) }),
    ...(num(row.Gold) && { gold: num(row.Gold) }),
    ...(need.length > 0 && { items: need }),
    ...(num(row.AscendValue) && { ascend: num(row.AscendValue) }),
    ...(row.UpdateTarget && { content: row.UpdateTarget }),
  };
}
for (const [hero, slots] of Object.entries(skills)) {
  for (const [type, slot] of Object.entries(slots)) {
    // A sparse array's holes are invisible to some(), so walk every index.
    for (let index = 0; index < slot.levels.length; index += 1) {
      if (!slot.levels[index]) fail(`hero ${hero} skill ${type} skips level ${index + 1}`);
    }
  }
}

// ------------------------------------------------------------------- items

// The inventory's tabs are the item categories' CategoryType, in the game's
// order, named by the Inventory screen's own strings; an item card's subtitle
// is its category's name ("Grilling", "Head", "Breaker", "Meat" …).
const TABS = [
  ['COOK', '100015'],
  ['EQUIP', '100012'],
  ['KARMA', '100011'],
  ['GEM', '100051'],
  ['GROW_MATERIAL', '70000003'],
  ['NORMAL_MATERIAL', '113202'],
  ['VALUABLE', '100017'],
  ['QUEST', '100018'],
];
const tabs = TABS.map(([key, string]) => {
  const name = requireText(string, `inventory tab ${key}`);
  return { key, nameEn: name.en, nameFr: name.fr };
});
const categoryInfo = {};
for (const [id, row] of categories) {
  const name = text(row.Name);
  categoryInfo[id] = { type: row.CategoryType, nameEn: name?.en ?? '', nameFr: name?.fr ?? '' };
}
const itemInfo = {};
for (const [id, row] of items) {
  const desc = text(row.Desc);
  const sub = text(row.Desc_sub);
  const entry = {
    ...(row.Category && { category: num(row.Category) }),
    ...(desc && desc.en !== '0' && { descEn: desc.en, descFr: desc.fr }),
    ...(sub && sub.en !== '0' && { subEn: sub.en, subFr: sub.fr }),
    ...(num(row.CoolTime) && { cooldown: num(row.CoolTime) }),
  };
  if (Object.keys(entry).length > 0) itemInfo[id] = entry;
}

const ui = {};
for (const [key, id] of Object.entries({
  needed: '109501',
  owned: '100603',
  equippedBy: '101114',
  setEffect: '102503',
  noSetEffect: '101036',
  traitEffect: '107310',
  notApplied: '107316',
  noKarma: '107301',
  requiredMaterials: '671',
  required: '101431',
  detailedStats: '612',
  mainSources: '636',
  cooldown: '',
})) {
  if (!id) continue;
  const found = requireText(id, `UI string ${key}`);
  ui[key] = found;
}
for (const [key, id] of Object.entries({
  active1: '800033',
  active2: '800034',
  signalA: '800035',
  signalB: '800036',
  master: '800050',
  modeSwitch: '800045',
})) {
  ui[key] = requireText(id, `skill label ${key}`);
}

const gradeStars = { NORMAL: 1, SUPERIOR: 2, RARE: 3, EPIC: 4, LEGENDARY: 5 };

const out = {
  _source:
    "The game's own maths and texts from its XML tables (DS/Content/__GeneratedGameData__/Server/XML/GameData in the paks), written by scripts/gen-game-data.mjs; icon offsets come from scripts/gen-icons.mjs. docs/game-rules.md explains every formula and how it was checked against the game.",
  maxStamina,
  stats,
  traits,
  levelRatio,
  heroes,
  statRolls,
  enchant,
  equipment,
  sets,
  karmaLevels,
  karma,
  costumes,
  skills,
  tabs,
  categories: categoryInfo,
  items: itemInfo,
  gradeStars,
  starIcon: { iconPath: 'Art/UI/InGame/Common/Icon_Grade_Star_01', x: 0, y: 0 },
  ui,
};
const path = new URL('../crates/core/data/game.json', import.meta.url);
writeFileSync(path, `${JSON.stringify(out)}\n`);
console.log(
  `wrote ${Object.keys(heroes).length} heroes, ${Object.keys(equipment).length} equipment, ${Object.keys(sets).length} sets, ` +
    `${Object.keys(karma).length} karma, ${Object.keys(costumes).length} costumes, ${Object.keys(skills).length} skill trees, ` +
    `${Object.keys(itemInfo).length} item texts`,
);
