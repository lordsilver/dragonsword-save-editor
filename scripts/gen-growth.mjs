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
  'QuestStepData',
  'QuestActionData',
  'RewardData',
  'RewardRandomData',
  'GameItemData',
  'PCCharacterData',
  'BMGoodsData_KOR',
  'BMGoodsData_AMERICA',
  'BMGoodsData_EUROPE',
  'BMGoodsData_ASIA',
  'EquipmentData',
  'EquipmentMainStatData',
  'EquipmentSubStatData',
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
    items: [1, 2, 3, 4, 5]
      .filter((slot) => row[`ItemID0${slot}`] !== '')
      .map((slot) => [int(row[`ItemID0${slot}`], 'grade item'), int(row[`ItemCnt0${slot}`], 'grade item count')]),
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

// Everything completing a quest touches. The save's CATEGORY codes come
// from saves the game wrote: main 1, epic 3, promotion 7, tutorial 12,
// character 14. A quest of any other category gets no code, and the editor
// will not complete it.
const SAVE_CATEGORY = { MAIN: 1, EPIC: 3, ADVENT_GRADE: 7, TUTORIAL: 12, CHARACTER: 14 };
// Quest actions with a lasting effect. The rest (scenario teams, retry
// steps, tutorial pop-ups) only matter while the quest is played.
const LASTING_ACTIONS = new Set(['TEAMSETTING_CHARACTER', 'TUTORIAL_DLG_COMPLITE', 'DELETE_ITEM']);
const firstStep = {};
for (const row of rows('QuestStepData')) {
  const step = int(row.StepID, 'step');
  firstStep[row.ID] = Math.min(firstStep[row.ID] ?? step, step);
}
const actions = {};
for (const row of rows('QuestActionData')) {
  if (row.TimingType === 'FAILED' || !LASTING_ACTIONS.has(row.ActionType)) continue;
  actions[row.ID] ??= [];
  actions[row.ID].push([row.ActionType, int(row.ActionValue1, 'action value')]);
}
// No quest uses a reward bundle (RewardID) today; the editor relies on that,
// so one appearing stops the generator.
const quests = {};
for (const row of questRows) {
  if (row.RewardID !== '') fail(`quest ${row.ID} uses reward bundle ${row.RewardID}`);
  const items = [];
  for (let slot = 1; slot <= 5; slot += 1) {
    if (row[`ItemID${slot}`] === '') continue;
    items.push([int(row[`ItemID${slot}`], 'reward item'), int(row[`ItemCnt${slot}`], 'reward count')]);
  }
  const name = questNames[row.QuestName];
  quests[row.ID] = {
    category: row.Category,
    saveCategory: SAVE_CATEGORY[row.Category] ?? null,
    nameEn: name?.En || `Quest ${row.ID}`,
    nameFr: name?.Fr || name?.En || `Quest ${row.ID}`,
    requires: row.PreQuestID === '' ? [] : row.PreQuestID.split('#').map((id) => int(id, 'prerequisite')),
    autoAccept: row.AcceptType === 'AUTO_ACCEPT' && row.AcceptCondition === 'TYPE_NONE',
    advLevel: row.AdvLevel === '' ? null : int(row.AdvLevel, 'corps level'),
    firstStep: firstStep[row.ID] ?? null,
    actions: actions[row.ID] ?? [],
    gold: row.Gold === '' ? 0 : int(row.Gold, 'reward gold'),
    advExp: row.AdvExp === '' ? 0 : int(row.AdvExp, 'reward corps exp'),
    items,
  };
}

// What reaching each corps level hands out. Every level reward is a static
// bundle with fixed counts; anything random stops the generator.
const rewardBundles = Object.fromEntries(rows('RewardData').map((row) => [row.ID, row]));
const randomItems = {};
for (const row of rows('RewardRandomData')) {
  randomItems[row.ID] ??= [];
  randomItems[row.ID].push(row);
}
function staticReward(id, what) {
  if (id === '') return [];
  const bundle = rewardBundles[id];
  if (!bundle || bundle.ContentsType !== 'STATIC_REWARD') fail(`${what} reward ${id} is not a static bundle`);
  const items = [];
  for (let slot = 1; slot <= 10; slot += 1) {
    const random = bundle[`RandomID${slot}`];
    if (!random) continue;
    for (const entry of randomItems[random] ?? fail(`${what} reward ${id} names missing ${random}`)) {
      if (entry.Min_ItemCount !== entry.Max_ItemCount) fail(`${what} reward ${id} has a random count`);
      items.push([int(entry.ItemID, 'reward item'), int(entry.Min_ItemCount, 'reward count')]);
    }
  }
  return items;
}
const adventLevelRewards = advent.map((row) => staticReward(row.RewardId, `corps level ${row.AdvReferenceKey}`));

// Heroes. A hero item (ItemType CHARACTER) names its hero in Value1; the
// shop sells hero items, quests hand them out, and redeeming one is how a
// hero joins. The roster is every hero a hero item reaches that the game
// marks as a playable, shipped character.
const characterRows = Object.fromEntries(rows('PCCharacterData').map((row) => [row.ID, row]));
const heroItems = {};
const heroes = {};
for (const row of rows('GameItemData')) {
  if (row.ItemType !== 'CHARACTER') continue;
  const hero = characterRows[row.Value1];
  // A few CHARACTER items name something that is not a hero row.
  if (!hero || hero.IsUserCharacter !== 'true' || hero.IsIncludePak !== 'true') continue;
  heroItems[row.ID] = int(row.Value1, 'hero');
  if (!heroes[row.Value1]) {
    heroes[row.Value1] = { id: int(row.Value1, 'hero'), item: int(row.ID, 'hero item') };
  }
}

// Where each hero comes from: the shop (goods paid with Fate's Invitation,
// item 1000500), a quest reward, or a quest in which the hero joins the team.
// A hero with none of these is not offered: nothing in the game hands it out.
const FATES_INVITATION = '1000500';
const sources = {};
const addSource = (hero, source) => {
  if (!heroes[hero]) return;
  sources[hero] ??= new Set();
  sources[hero].add(source);
};
// The hero goods live in the per-region shop tables, not the base one.
const regionGoods = ['KOR', 'AMERICA', 'EUROPE', 'ASIA'].flatMap((region) => rows(`BMGoodsData_${region}`));
for (const goods of regionGoods) {
  if (goods.PaymentItemId !== FATES_INVITATION || goods.GoodsRewardId === '') continue;
  // Random bundles (summons) do not name one hero.
  if (rewardBundles[goods.GoodsRewardId]?.ContentsType !== 'STATIC_REWARD') continue;
  for (const [item] of staticReward(goods.GoodsRewardId, `goods ${goods.ID}`)) {
    if (heroItems[item]) addSource(heroItems[item], 'shop');
  }
}
for (const [id, quest] of Object.entries(quests)) {
  for (const [item] of quest.items) {
    if (heroItems[item]) addSource(heroItems[item], `quest:${id}`);
  }
  for (const [action, value] of quest.actions) {
    if (action === 'TEAMSETTING_CHARACTER') addSource(value, `joins:${id}`);
  }
}
for (const id of Object.keys(heroes)) {
  if (!sources[id]) delete heroes[id];
  else heroes[id].sources = [...sources[id]].sort();
}
for (const [item, hero] of Object.entries(heroItems)) {
  if (!heroes[hero]) delete heroItems[item];
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

// Equipment the game creates. Each item names a main-stat group and up to five
// sub-stat groups; a new piece stores one row ID from each, picked by weight
// (the save's MAIN_STAT_CID and SUB_STAT_CID1..5). Main and sub groups share
// one map, so their IDs must not collide.
const equipmentStats = {};
for (const [table, kind] of [
  ['EquipmentMainStatData', 'main'],
  ['EquipmentSubStatData', 'sub'],
]) {
  for (const row of rows(table)) {
    const id = int(row.ID, `${table} ID`);
    const weight = int(row.Weight, `${table} ${id} Weight`);
    if (weight <= 0) fail(`${table} ${id} has weight ${weight}`);
    if (!row.StatList) fail(`${table} ${id} names no stat`);
    equipmentStats[row.GroupID] ??= { kind, choices: [] };
    const group = equipmentStats[row.GroupID];
    if (group.kind !== kind) fail(`stat group ${row.GroupID} is both a main and a sub group`);
    group.choices.push([id, weight, row.StatList.toLowerCase()]);
  }
}
const equipment = {};
for (const row of rows('EquipmentData')) {
  const id = int(row.ItemID, 'EquipmentData ItemID');
  const groups = [row.Main_Stat_GroupID, ...[1, 2, 3, 4, 5].map((slot) => row[`Sub${slot}_Stat_GroupID`])];
  const [main, ...subs] = groups.map((group) => (group ? group : null));
  if (!main) fail(`equipment ${id} has no main-stat group`);
  if (equipmentStats[main]?.kind !== 'main') fail(`equipment ${id} names a missing main-stat group ${main}`);
  const subGroups = [];
  let gap = false;
  for (const group of subs) {
    if (group === null) {
      gap = true;
      continue;
    }
    if (gap) fail(`equipment ${id} skips a sub-stat slot`);
    if (equipmentStats[group]?.kind !== 'sub') fail(`equipment ${id} names a missing sub-stat group ${group}`);
    subGroups.push(int(group, 'sub-stat group'));
  }
  equipment[id] = { main: int(main, 'main-stat group'), subs: subGroups };
}
for (const group of Object.values(equipmentStats)) delete group.kind;

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
      'equipmentStats maps a stat group to [row ID, weight, stat] choices; a new piece stores one row ID per group.',
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
  quests,
  adventLevelRewards,
  heroes: Object.values(heroes).sort((left, right) => left.id - right.id),
  heroItems,
  equipment,
  equipmentStats: Object.fromEntries(Object.entries(equipmentStats).map(([group, { choices }]) => [group, choices])),
  regions: { KOR: korea, GLOBAL: global },
};

const target = new URL('../crates/core/data/growth.json', import.meta.url);
writeFileSync(target, `${JSON.stringify(growth, null, 2)}\n`);
console.log(`wrote ${target.pathname}`);
