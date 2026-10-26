#!/usr/bin/env node
// Generate crates/core/data/growth.json from the game's own rule tables.
//
// Usage: node scripts/gen-growth.mjs <extract-dir> [game-version]
//
// <extract-dir> holds the XML tables extracted from the game's paks
// (DS/Content/__GeneratedGameData__/Server/XML/GameData/). The extracted
// files are game data, not part of this repository: never commit them.
//
// The script reads the tables as text and only keeps the numbers the editor
// needs. It fails loudly when a table breaks an assumption the editor relies
// on, so a game update cannot quietly change the rules.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [extractDir, gameVersion = 'unknown'] = process.argv.slice(2);
if (!extractDir) {
  console.error('usage: node scripts/gen-growth.mjs <extract-dir> [game-version]');
  process.exit(2);
}

const TABLES = [
  'PCCharacterLevelData',
  'KarmaLevelData',
  'KarmaData',
  'PCSkillGrowthData',
  'AdventLevelData',
  'AdventGradeData',
  'LocalizingControlData_KOR',
  'LocalizingControlData_AMERICA',
  'LocalizingControlData_EUROPE',
  'LocalizingControlData_ASIA',
  'LocalizingVersionData',
  'PCCharacterTranscendData',
  'KarmaTranscendData',
  'StringData',
  'QuestMainData',
  'StringQuestData',
];

/** Every row of a table, as attribute maps with the namespace prefix removed. */
function rows(table) {
  const text = readFileSync(join(extractDir, `${table}.xml`), 'utf8');
  const out = [];
  for (const element of text.matchAll(/<[\w-]+:(\w+)\s([^<>]*?)\/>/g)) {
    const row = {};
    for (const attribute of element[2].matchAll(/[\w-]+:(\w+)="([^"]*)"/g)) {
      row[attribute[1]] = attribute[2];
    }
    out.push(row);
  }
  if (out.length === 0) fail(`${table} has no rows`);
  return out;
}

function fail(message) {
  console.error(`gen-growth: ${message}`);
  process.exit(1);
}

function int(value, what) {
  const number = Number(value);
  if (!Number.isInteger(number)) fail(`${what} is not an integer: ${JSON.stringify(value)}`);
  return number;
}

/** Content versions look like M11_2; compare them numerically. */
function versionKey(version) {
  const match = /^M(\d+)(?:_(\d+))?$/.exec(version);
  if (!match) fail(`unknown content version ${version}`);
  return Number(match[1]) * 1000 + Number(match[2] ?? 0);
}

// Hero levels. CharacterExp at level N is the running-total EXP that ends
// level N, so level N starts at the entry for N − 1. EPIC and LEGENDARY heroes
// share one table today; the editor relies on that.
const heroRows = rows('PCCharacterLevelData').sort(
  (left, right) => int(left.CharacterLevel, 'level') - int(right.CharacterLevel, 'level'),
);
heroRows.forEach((row, index) => {
  if (int(row.CharacterLevel, 'level') !== index + 1) fail('hero levels are not 1..n');
  if (row.CharacterExp_EPIC !== row.CharacterExp_LEGENDARY) fail(`hero level ${index + 1} differs by rarity`);
});
const heroLevelStartExp = [0, ...heroRows.slice(0, -1).map((row) => int(row.CharacterExp_LEGENDARY, 'hero exp'))];

// Karma levels, one table per rarity, with the same running-total meaning.
const karmaLevelStartExp = {};
for (const row of rows('KarmaLevelData')) {
  karmaLevelStartExp[row.Grade] ??= [];
  karmaLevelStartExp[row.Grade].push(row);
}
for (const [rarity, list] of Object.entries(karmaLevelStartExp)) {
  list.sort((left, right) => int(left.Level, 'level') - int(right.Level, 'level'));
  list.forEach((row, index) => {
    if (int(row.Level, 'level') !== index + 1) fail(`${rarity} karma levels are not 1..n`);
  });
  karmaLevelStartExp[rarity] = [0, ...list.slice(0, -1).map((row) => int(row.LevelExp, 'karma exp'))];
}
const karmaRarity = {};
for (const row of rows('KarmaData')) {
  if (!karmaLevelStartExp[row.Grade]) fail(`karma ${row.ID} has rarity ${row.Grade} with no level table`);
  karmaRarity[row.ID] = row.Grade;
}

// Skills. For each skill type, the breakthrough each slot level needs and the
// content version that added it. Every hero must follow the same rows.
const skillLevels = {};
const perHero = {};
for (const row of rows('PCSkillGrowthData')) {
  const key = `${row.TypeValue}:${row.SlotLevel}`;
  const entry = { ascend: row.AscendValue === '' ? 0 : int(row.AscendValue, 'AscendValue'), version: row.UpdateTarget };
  versionKey(entry.version);
  const seen = skillLevels[key];
  if (seen && (seen.ascend !== entry.ascend || seen.version !== entry.version)) {
    fail(`skill type ${row.TypeValue} level ${row.SlotLevel} differs between heroes`);
  }
  skillLevels[key] = entry;
  perHero[row.TypeValue] ??= {};
  perHero[row.TypeValue][row.CharacterID] = (perHero[row.TypeValue][row.CharacterID] ?? 0) + 1;
}
const skills = {};
for (const type of Object.keys(perHero).sort((left, right) => Number(left) - Number(right))) {
  const counts = new Set(Object.values(perHero[type]));
  if (counts.size !== 1) fail(`skill type ${type} has a different level count per hero`);
  const levels = [...counts][0];
  skills[type] = [];
  for (let level = 1; level <= levels; level += 1) {
    const entry = skillLevels[`${type}:${level}`];
    if (!entry) fail(`skill type ${type} is missing level ${level}`);
    skills[type].push(entry);
  }
}

// Mercenary Corps. NeedAdvExp is the running-total EXP that starts a level.
const advent = rows('AdventLevelData').sort(
  (left, right) => int(left.AdvReferenceKey, 'level') - int(right.AdvReferenceKey, 'level'),
);
advent.forEach((row, index) => {
  if (int(row.AdvReferenceKey, 'level') !== index + 1) fail('corps levels are not 1..n');
});
const adventLevelStartExp = advent.map((row) => int(row.NeedAdvExp, 'corps exp'));

// Only the rank names are needed from the 10 MB string table.
const gradeRows = rows('AdventGradeData');
const nameIds = new Set(gradeRows.map((row) => row.Name));
const names = Object.fromEntries(
  rows('StringData')
    .filter((row) => nameIds.has(row.ID))
    .map((row) => [row.ID, row]),
);
const adventGrades = gradeRows
  .map((row) => ({
    grade: int(row.AdvGrade, 'grade'),
    nameEn: names[row.Name]?.En || fail(`grade ${row.AdvGrade} has no English name`),
    nameFr: names[row.Name]?.Fr || fail(`grade ${row.AdvGrade} has no French name`),
    promotionQuest: row.AscendQuestID === '' ? null : int(row.AscendQuestID, 'quest'),
    characterAscend: int(row.CharacterAscendExpand, 'character ascend'),
    karmaAscend: int(row.KarmaAscendExpand, 'karma ascend'),
    titleItem: row.ItemID01 === '' ? null : int(row.ItemID01, 'title'),
  }))
  .sort((left, right) => left.grade - right.grade);
adventGrades.forEach((grade, index) => {
  if (grade.grade !== index + 1) fail('corps grades are not 1..n');
  if (grade.characterAscend !== index || grade.karmaAscend !== index) {
    fail(`grade ${grade.grade} does not unlock breakthrough ${index}`);
  }
});

// The main story, in the order the game numbers it ("20. The Hero's Quest"),
// and the main quest each promotion exam waits for. Quest IDs skip numbers
// between chapters, so the editor needs the number from the name.
const questRows = rows('QuestMainData');
const questNames = Object.fromEntries(rows('StringQuestData').map((row) => [row.ID, row]));
const mainQuests = questRows
  .filter((row) => row.Category === 'MAIN')
  .map((row) => {
    const name = questNames[row.QuestName];
    const match = /^(\d+)\.\s*(.*)$/.exec(name?.En ?? '');
    if (!match) return null;
    return {
      id: int(row.ID, 'quest'),
      number: Number(match[1]),
      nameEn: match[2],
      nameFr: (name.Fr ?? '').replace(/^\d+\.\s*/, '') || match[2],
    };
  })
  .filter(Boolean)
  .sort((left, right) => left.number - right.number);
mainQuests.forEach((quest, index) => {
  if (quest.number !== index + 1) fail(`main quest numbers are not 1..n (found ${quest.number} at ${index + 1})`);
});
const mainQuestIds = new Set(mainQuests.map((quest) => quest.id));
for (const grade of adventGrades) {
  if (grade.promotionQuest === null) {
    grade.requiresMainQuest = null;
    continue;
  }
  const row = questRows.find((quest) => int(quest.ID, 'quest') === grade.promotionQuest);
  if (row?.Category !== 'ADVENT_GRADE') {
    fail(`grade ${grade.grade} promotion quest is not an ADVENT_GRADE quest`);
  }
  const story = row.PreQuestID.split('#')
    .map((id) => int(id, 'prerequisite'))
    .filter((id) => mainQuestIds.has(id));
  if (story.length !== 1) fail(`grade ${grade.grade} promotion does not wait for exactly one main quest`);
  grade.requiresMainQuest = story[0];
}

// What each quest hands out on completion: gold, Mercenary Corps EXP and up
// to five items. No quest uses a reward bundle (RewardID) today; the editor
// relies on that, so one appearing stops the generator.
const questRewards = {};
for (const row of questRows) {
  if (row.RewardID !== '') fail(`quest ${row.ID} uses reward bundle ${row.RewardID}`);
  const items = [];
  for (let slot = 1; slot <= 5; slot += 1) {
    if (row[`ItemID${slot}`] === '') continue;
    items.push([int(row[`ItemID${slot}`], 'reward item'), int(row[`ItemCnt${slot}`], 'reward count')]);
  }
  const gold = row.Gold === '' ? 0 : int(row.Gold, 'reward gold');
  const advExp = row.AdvExp === '' ? 0 : int(row.AdvExp, 'reward corps exp');
  if (gold === 0 && advExp === 0 && items.length === 0) continue;
  const name = questNames[row.QuestName];
  questRewards[row.ID] = {
    category: row.Category,
    nameEn: name?.En || `Quest ${row.ID}`,
    nameFr: name?.Fr || name?.En || `Quest ${row.ID}`,
    gold,
    advExp,
    items,
  };
}

// Per-region limits on the live servers. America, Europe and Asia must agree,
// because the editor treats them as one "global" profile.
const liveVersion = Object.fromEntries(
  rows('LocalizingVersionData')
    .filter((row) => row.InternalServerType === 'LIVE')
    .flatMap((row) => ['KOR', 'ASIA', 'EUROPE', 'AMERICA'].map((region) => [region, row[region]])),
);
function regionLimits(region) {
  const control = Object.fromEntries(rows(`LocalizingControlData_${region}`).map((row) => [row.ControlType, row]));
  const live = (key) => {
    if (!control[key]) fail(`${region} has no ${key}`);
    return int(control[key].LIVE, `${region} ${key}`);
  };
  return {
    contentVersion: liveVersion[region],
    maxCharacterLevel: live('MAX_CHARACTER_LEVEL'),
    maxCharacterAscend: live('MAX_CHARACTER_ASCEND'),
    maxKarmaLevel: live('MAX_KARMA_LEVEL'),
    maxKarmaAscend: live('MAX_KARMA_ASCEND'),
    maxAdventLevel: live('MAX_ADVENT_LEVEL'),
    maxAdventGrade: live('MAX_ADVENT_GRADE'),
    maxAdventDifficulty: live('MAX_ADVENT_DIFFICULTY'),
  };
}
const korea = regionLimits('KOR');
const global = regionLimits('AMERICA');
for (const region of ['EUROPE', 'ASIA']) {
  if (JSON.stringify(regionLimits(region)) !== JSON.stringify(global)) fail(`${region} differs from AMERICA`);
}

// No table holds the level cap per breakthrough. The editor derives it as
// 20 + 10 × stage, which every region's live maximum has to agree with.
const LEVEL_CAP_BASE = 20;
const LEVEL_CAP_STEP = 10;
for (const [name, limits] of [
  ['KOR', korea],
  ['GLOBAL', global],
]) {
  if (limits.maxAdventGrade - 1 !== limits.maxCharacterAscend) fail(`${name} grade and breakthrough limits disagree`);
  for (const [level, ascend] of [
    [limits.maxCharacterLevel, limits.maxCharacterAscend],
    [limits.maxKarmaLevel, limits.maxKarmaAscend],
  ]) {
    if (level !== LEVEL_CAP_BASE + LEVEL_CAP_STEP * ascend)
      fail(`${name} level cap ${level} breaks 20 + 10 × ${ascend}`);
  }
  if (limits.maxAdventGrade > adventGrades.length) fail(`${name} allows a grade with no row`);
  if (limits.maxAdventLevel > adventLevelStartExp.length) fail(`${name} allows a corps level with no row`);
  if (limits.maxCharacterLevel > heroLevelStartExp.length) fail(`${name} allows a hero level with no row`);
  for (const table of Object.values(karmaLevelStartExp)) {
    if (limits.maxKarmaLevel > table.length) fail(`${name} allows a karma level with no row`);
  }
}

function maxStep(table, column) {
  return Math.max(...rows(table).map((row) => int(row[column], `${table} ${column}`)));
}

const growth = {
  _source: {
    game: `DragonSword Awakening, ${gameVersion}`,
    extracted: 'DS/Content/__GeneratedGameData__/Server/XML/GameData/ from the game paks',
    tables: TABLES,
    generator: 'scripts/gen-growth.mjs',
    notes: [
      'Every *StartExp array is a running total: index N − 1 is the EXP at which level N starts.',
      'No table holds the level cap per breakthrough; levelCapBase + levelCapStep × stage matches every live maximum.',
    ],
  },
  levelCapBase: LEVEL_CAP_BASE,
  levelCapStep: LEVEL_CAP_STEP,
  maxCharacterTranscend: maxStep('PCCharacterTranscendData', 'Transcend'),
  maxKarmaTranscend: maxStep('KarmaTranscendData', 'Transcend'),
  heroLevelStartExp,
  karmaLevelStartExp,
  karmaRarity,
  skills,
  adventLevelStartExp,
  adventGrades,
  mainQuests,
  questRewards,
  regions: { KOR: korea, GLOBAL: global },
};

const target = new URL('../crates/core/data/growth.json', import.meta.url);
writeFileSync(target, `${JSON.stringify(growth, null, 2)}\n`);
console.log(`wrote ${target.pathname}`);
