#!/usr/bin/env node
// Build the world the editor's World screen shows from the game's own tables:
// crates/core/data/world.json.
//
// Usage: node scripts/gen-world.mjs <extract-dir>
//
// <extract-dir> is the GameData folder of the XML tables export with its
// folders kept (docs/exports/xml/README.txt): the chests are placed per map
// in ExportSectionTreasureBoxData/<map>/. Run scripts/gen-world-map.mjs for
// the map images and their placement.
//
// world.json:
// - worlds: the WorldCompleteControlData rows, 100 Orbis and 200 Belos, the
//   map groups the waypoints, dungeons and chests are placed in;
// - fieldMaps: the world each open-world map (MapBaseData TOWN or FIELD) is
//   in, for tb_user.REGION_CID, the map the player stands in;
// - regions: the WorldCompleteGroupData rows, the parts of a world the game's
//   world map counts completion in. Each is a fog section, which the other
//   tables name as FogSectionID, and lists the missions it counts
//   (WorldCompleteMissionData): TREASUREBOX_OPEN, MINIGAME, DUNGEON_FIND,
//   WAYPOINT_OPEN, FIELDSTATUE_COMPLETE and WINDMILL_OPEN;
// - waypoints: every WayPointData row with a place on a world map
//   (WarpPositionData): warp points (WAYPOINT), Statues of Organa (STATUE),
//   Eona's Legacy (WINDMILL) and the Tower of Trials (TRIALTOWER). `switch` is
//   the row's SwitchID, the tb_switch bit set once it is activated (category
//   = switch / 64, bit = switch % 64), as the cookbook's recipes are.
//   `reward` is what activating it gives, from its RewardID (a STATIC_REWARD
//   bundle): `[item, count]` pairs, 100 corps EXP for every warp point. The
//   world map's card for it (UI/Layer/LayerWorldMapInfoPopup) shows `area`, the
//   map section it is in (WorldMapSectionID), `description`, and once it is
//   activated `descriptionDone` (Use_Description) where it has one, over the
//   `picture` its MapInfoImgName names (World_MapInfo_<picture>);
// - statues: the FieldStatueData rows on a waypoint. A statue is restored
//   piece by piece: each FieldStatuePartsData row is a bit of tb_field_statue
//   (category = id / 64), and the `Complete` part is the statue whole;
// - dungeons: the MapDungeonGroupData rows with an entrance on a world map
//   (WarpPositionData DUNGEON), with their card's `description` (Desc) and
//   `picture`. tb_active_dungeon lists the ones found;
// - labels: the names the world map writes on Orbis (MapPointIconData; Belos
//   has none): the 12 regions' names (CHAPTERNAME, the ID is the string),
//   shown zoomed out, and 38 area names (AREANAME, the ID is a MapSectionData
//   row), shown zoomed in. Eight AREANAME rows name no section and show
//   nothing in the game; they are left out;
// - chests: every chest placed on a world map, by its PropTreasureBoxData ID,
//   which is also its bit in tb_treasure_box (category = id / 64). The save
//   keeps three bits per chest: RELEASED (its lock is open: the monsters are
//   beaten, the mini-game won, the key used), OPENED and REGISTERED_MAP (shown
//   on the map by a treasure map). `lock` is the TreasureBoxLockType, `loot`
//   the chest's ItemRewardID, a key of `loot`;
// - loot: what a chest gives, by its RewardData ID: draws, each with its
//   chance and the [item, min count, max count, weight] entries it picks one
//   of by weight;
// - minigames: the MiniGameData rows of a region; tb_minigame bits;
// - quests: per QuestMainData row its order in the quest log, its
//   description and the text of each step (StringQuestData). Names, rewards
//   and prerequisites are in growth.json (scripts/gen-growth.mjs). `marks`
//   is where the world map marks each step, `[world, x, y, mark]`: mark is the
//   NN of the step's Icon_Mark_QuestMark_NN (MapButtonDesign, or the
//   category's own where the row names none). See questMark below.
//
// Positions are the game's world coordinates (PosX, PosY).

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [extractDir] = process.argv.slice(2);
if (!extractDir) {
  console.error('usage: node scripts/gen-world.mjs <extract-dir>');
  process.exit(2);
}

function fail(message) {
  console.error(`gen-world: ${message}`);
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

/** Rows of a table (a path under the extract dir, without .xml), entities decoded. */
function rows(table) {
  const path = join(extractDir, `${table}.xml`);
  if (!existsSync(path)) fail(`${path} is missing`);
  const out = [];
  for (const element of readFileSync(path, 'utf8').matchAll(/<[\w-]+:\w+\s([^<>]*?)\/>/g)) {
    const row = {};
    for (const attribute of element[1].matchAll(/[\w-]+:(\w+)="([^"]*)"/g)) row[attribute[1]] = decode(attribute[2]);
    out.push(row);
  }
  if (out.length === 0) fail(`${table} has no rows`);
  return out;
}

function stringTable(table) {
  const map = new Map(rows(table).map((row) => [row.ID, row]));
  /** A string in English and French (French falls back to English), or null. */
  return (id) => {
    const row = map.get(String(id ?? ''));
    const en = row?.En?.trim();
    if (!en) return null;
    return { en, fr: row.Fr?.trim() || en };
  };
}
const text = stringTable('StringData');
const questText = stringTable('StringQuestData');

const number = (value) => (value === undefined || value === '' ? null : Number(value));
const byId = (list) => new Map(list.map((row) => [row.ID, row]));

// ----------------------------------------------------------------- rewards

const rewards = new Map();
for (const row of rows('RewardData')) {
  if (!rewards.has(row.ID)) rewards.set(row.ID, []);
  rewards.get(row.ID).push(row);
}
const randomItems = new Map();
for (const row of rows('RewardRandomData')) {
  if (!randomItems.has(row.ID)) randomItems.set(row.ID, []);
  randomItems.get(row.ID).push(row);
}
const gameItems = new Set(rows('GameItemData').map((row) => row.ID));

/** A STATIC_REWARD bundle's items, `[item, count]`: every entry of every draw, at its fixed count. */
function staticReward(id, what) {
  const bundles = rewards.get(id) ?? fail(`${what} names missing reward ${id}`);
  if (bundles.length !== 1) fail(`${what} reward ${id} has ${bundles.length} rows`);
  const [bundle] = bundles;
  if (bundle.ContentsType !== 'STATIC_REWARD') fail(`${what} reward ${id} is ${bundle.ContentsType}`);
  const items = [];
  for (let slot = 1; slot <= 10; slot += 1) {
    const group = bundle[`RandomID${slot}`];
    if (!group) continue;
    for (const entry of randomItems.get(group) ?? fail(`${what} reward ${id} names missing ${group}`)) {
      if (!gameItems.has(entry.ItemID)) fail(`${what} reward ${id} names missing item ${entry.ItemID}`);
      if (entry.Min_ItemCount !== entry.Max_ItemCount) fail(`${what} reward ${id} has a random count`);
      items.push([Number(entry.ItemID), Number(entry.Min_ItemCount)]);
    }
  }
  return items;
}

// ------------------------------------------------------------------ worlds

const worlds = rows('WorldCompleteControlData').map((row) => {
  const name = text(row.WorldName);
  if (!name) fail(`world ${row.ID} has no name`);
  return { id: Number(row.ID), name };
});
const worldIds = new Set(worlds.map((world) => world.id));

// A WarpPositionData MapID is a world's map group, or a MapBaseData row in one.
const mapBase = byId(rows('MapBaseData'));
function worldOf(mapId) {
  const id = Number(mapId);
  if (worldIds.has(id)) return id;
  const group = Number(mapBase.get(String(mapId))?.MapGroupID);
  return worldIds.has(group) ? group : null;
}

// The open-world maps (TOWN, FIELD) by MapBaseData ID, as tb_user.REGION_CID
// names the map the player stands in; positions there are world coordinates.
const fieldMaps = {};
for (const row of mapBase.values()) {
  const world = Number(row.MapGroupID);
  if ((row.MapType === 'TOWN' || row.MapType === 'FIELD') && worldIds.has(world)) fieldMaps[row.ID] = world;
}

// ----------------------------------------------------------------- regions

const missions = new Map();
for (const row of rows('WorldCompleteMissionData')) {
  if (!missions.has(row.GroupID)) missions.set(row.GroupID, []);
  missions.get(row.GroupID).push(row.MapCompleteMissionType);
}
const regions = rows('WorldCompleteGroupData').map((row) => {
  const world = Number(row.MapGroupID);
  if (!worldIds.has(world)) fail(`region ${row.ID} is in unknown world ${row.MapGroupID}`);
  const name = text(row.FogSectionName);
  if (!name) fail(`region ${row.ID} has no name`);
  return { id: Number(row.ID), world, name, missions: missions.get(row.ID) ?? [] };
});
const regionIds = new Set(regions.map((region) => region.id));
/** A FogSectionID as a region, or null outside every counted region. */
const regionOf = (fog) => (regionIds.has(Number(fog)) ? Number(fog) : null);

// --------------------------------------------------------------- waypoints

const KINDS = { WAYPOINT: 'waypoint', STATUE: 'statue', WINDMILL: 'legacy', TRIALTOWER: 'tower' };
const sections = byId(rows('MapSectionData'));
/** A MapSectionData row's name, or null. */
const sectionName = (id) => text(sections.get(String(id ?? ''))?.SectionName);
/** The World_MapInfo_* picture a MapInfoImgName names, as the editor's asset name (map-info-<name>). */
function picture(path, what) {
  if (!path) return null;
  const name = path.match(/\/World_MapInfo_(\w+?)(?:_Sprite)?\./)?.[1];
  if (!name) fail(`${what} has picture ${path}`);
  return name.toLowerCase();
}
const positions = byId(rows('WarpPositionData'));
const waypoints = [];
for (const row of rows('WayPointData')) {
  const kind = KINDS[row.WayPointType];
  if (!kind) fail(`waypoint ${row.ID} has type ${row.WayPointType}`);
  const place = positions.get(row.ID);
  // One statue (100111) has no place in the game's tables; nothing can show it.
  if (!place) continue;
  const world = worldOf(place.MapID);
  if (world === null) fail(`waypoint ${row.ID} is on map ${place.MapID}, in no world`);
  const name = text(row.Name);
  if (!name) fail(`waypoint ${row.ID} has no name`);
  if (!row.SwitchID) fail(`waypoint ${row.ID} has no switch`);
  waypoints.push({
    id: Number(row.ID),
    kind,
    world,
    region: regionOf(row.FogSectionID),
    name,
    switch: Number(row.SwitchID),
    ...(row.RewardID && { reward: staticReward(row.RewardID, `waypoint ${row.ID}`) }),
    ...card(row, `waypoint ${row.ID}`),
    x: Number(place.PosX),
    y: Number(place.PosY),
  });
}
const waypointIds = new Set(waypoints.map((waypoint) => waypoint.id));

/** What the world map's card for a waypoint shows besides its name. */
function card(row, what) {
  const out = {};
  const area = sectionName(row.WorldMapSectionID);
  if (area) out.area = area;
  const description = text(row.Description);
  if (description) out.description = description;
  const done = text(row.Use_Description);
  if (done) out.descriptionDone = done;
  const image = picture(row.MapInfoImgName, what);
  if (image) out.picture = image;
  return out;
}

// ----------------------------------------------------------------- statues

const parts = new Map();
for (const row of rows('FieldStatuePartsData')) {
  if (!parts.has(row.Statue_ID)) parts.set(row.Statue_ID, { complete: null, pieces: [] });
  if (row.Parts_Type === 'Complete') parts.get(row.Statue_ID).complete = Number(row.ID);
  else parts.get(row.Statue_ID).pieces.push(Number(row.ID));
}
const statues = [];
for (const row of rows('FieldStatueData')) {
  const waypoint = number(row.WayPointID);
  if (waypoint === null || !waypointIds.has(waypoint)) continue;
  const statueParts = parts.get(row.ID);
  if (!statueParts?.complete) fail(`statue ${row.ID} has no Complete part`);
  statues.push({
    id: Number(row.ID),
    waypoint,
    region: regionOf(row.FogSectionID),
    complete: statueParts.complete,
    pieces: statueParts.pieces,
  });
}

// ---------------------------------------------------------------- dungeons

const dungeons = [];
for (const row of rows('MapDungeonGroupData')) {
  const place = positions.get(row.ID);
  const image = picture(row.MapInfoImgName, `dungeon ${row.ID}`);
  if (place?.MapInfoType !== 'DUNGEON') continue;
  const world = worldOf(place.MapID);
  if (world === null) fail(`dungeon ${row.ID} is on map ${place.MapID}, in no world`);
  const name = text(row.Name);
  if (!name) fail(`dungeon ${row.ID} has no name`);
  dungeons.push({
    id: Number(row.ID),
    world,
    region: regionOf(row.FogSectionID),
    name,
    ...(text(row.Desc) && { description: text(row.Desc) }),
    ...(image && { picture: image }),
    x: Number(place.PosX),
    y: Number(place.PosY),
  });
}

// ------------------------------------------------------------------ labels

const LABELS = { CHAPTERNAME: 'region', AREANAME: 'area' };
const labels = [];
for (const row of rows('MapPointIconData')) {
  const kind = LABELS[row.MapInfoType];
  if (!kind) continue;
  const world = worldOf(row.MapID);
  if (world === null) fail(`label ${row.ID} is on map ${row.MapID}, in no world`);
  const name = kind === 'region' ? text(row.ID) : sectionName(row.ID);
  if (!name) {
    if (kind === 'region') fail(`region label ${row.ID} has no name`);
    continue;
  }
  labels.push({ world, kind, name, x: Number(row.PosX), y: Number(row.PosY) });
}

// ------------------------------------------------------------------ chests

const props = byId(rows('PropTreasureBoxData'));
const GRADES = { NORMAL: 'normal', SUPERIOR: 'superior', RARE: 'rare', EPIC: 'epic', LEGENDARY: 'legendary' };
const loot = {};
const chestNames = {};
const chests = [];
const chestIds = new Set();
// Each world's map is a MapBaseData map file whose name is also its export
// folder (world_01_main_WP, world_02_main_wp); the other folders are dungeons.
const placements = 'ExportSectionTreasureBoxData';
const folders = new Map(readdirSync(join(extractDir, placements)).map((name) => [name.toLowerCase(), name]));
const mapFolders = new Map();
for (const row of mapBase.values()) {
  const file = row.MapFile?.match(/\/([^/.']+)\.[^/']+'$/)?.[1]?.toLowerCase();
  const world = Number(row.MapGroupID);
  if (file && folders.has(file) && worldIds.has(world) && row.MapType !== 'INSIDE') {
    mapFolders.set(folders.get(file), world);
  }
}
if (mapFolders.size !== worlds.length) fail(`found the chests of ${mapFolders.size} worlds, not ${worlds.length}`);
for (const [folder, world] of mapFolders) {
  for (const row of rows(`${placements}/${folder}/SectionTreasureBoxData`)) {
    const prop = props.get(row.CID);
    if (!prop) fail(`chest ${row.CID} has no PropTreasureBoxData row`);
    if (chestIds.has(row.CID)) fail(`chest ${row.CID} is placed twice`);
    chestIds.add(row.CID);
    const grade = GRADES[prop.Grade];
    if (!grade) fail(`chest ${row.CID} has grade ${prop.Grade}`);
    if (!chestNames[prop.Name]) {
      const name = text(prop.Name);
      if (!name) fail(`chest ${row.CID} has no name`);
      chestNames[prop.Name] = name;
    }
    if (prop.ItemRewardID) lootTable(prop.ItemRewardID, row.CID);
    chests.push({
      id: Number(row.CID),
      world,
      region: regionOf(prop.FogSectionID),
      name: Number(prop.Name),
      grade,
      ...(prop.TreasureBoxLockType && { lock: prop.TreasureBoxLockType.toLowerCase() }),
      ...(prop.ItemRewardID && { loot: Number(prop.ItemRewardID) }),
      x: Number(row.PosX),
      y: Number(row.PosY),
    });
  }
}

/**
 * Adds a chest's RewardData row to `loot`: its draws, each made with chance
 * RandomRate and picking one RewardRandomData entry of its group by
 * ItemWeight, with a count from Min_ItemCount to Max_ItemCount. Every chest
 * reward is a single RANDOM_REWARD row with every draw at chance 1; an empty
 * group draws nothing.
 */
function lootTable(id, chest) {
  if (loot[id]) return;
  const bundles = rewards.get(id) ?? fail(`chest ${chest} names missing reward ${id}`);
  if (bundles.length !== 1) fail(`chest reward ${id} has ${bundles.length} rows`);
  const [bundle] = bundles;
  if (bundle.ContentsType !== 'RANDOM_REWARD') fail(`chest reward ${id} is ${bundle.ContentsType}`);
  const draws = [];
  for (let slot = 1; slot <= 10; slot += 1) {
    const group = bundle[`RandomID${slot}`];
    if (!group) continue;
    const chance = Number(bundle[`RandomRate${slot}`]);
    if (!(chance > 0 && chance <= 1)) fail(`chest reward ${id} draws with chance ${bundle[`RandomRate${slot}`]}`);
    const entries = (randomItems.get(group) ?? []).map((entry) => {
      if (!gameItems.has(entry.ItemID)) fail(`chest reward ${id} names missing item ${entry.ItemID}`);
      return [entry.ItemID, entry.Min_ItemCount, entry.Max_ItemCount, entry.ItemWeight].map(Number);
    });
    draws.push({ chance, entries });
  }
  loot[id] = draws;
}

// --------------------------------------------------------------- minigames

const minigames = rows('MiniGameData')
  .filter((row) => regionOf(row.FogSectionID) !== null)
  .map((row) => ({ id: Number(row.ID), region: Number(row.FogSectionID) }));

// ------------------------------------------------------------------ quests

const steps = new Map();
for (const row of rows('QuestStepData')) {
  const description = questText(row.StepDesc);
  if (!steps.has(row.ID)) steps.set(row.ID, {});
  if (description) steps.get(row.ID)[row.StepID] = description;
}

// Where the world map marks a step. A step names its target actor
// (StepPosition), whose place is in ActorPositionData; a TALK_TO_NPC step
// without one names the NPC (StepValue1), as actor NPC<id> or a SectionNpcData
// spawn. A target indoors or in a dungeon is not on the world map, so its
// StepPositionGroupID lists, per map the player may be on, another actor to
// point at instead: the door or the entrance. The world map uses the row for
// its own world. Checked against a save's three quests in progress and the
// marks the game drew for them (docs/exports/map-labels-quests). Both step
// tables are read; QuestStepData, the one the game loads, wins where both have
// a step.
const actors = new Map();
for (const row of rows('ActorPositionData')) {
  if (!actors.has(row.Name)) actors.set(row.Name, []);
  actors.get(row.Name).push({ map: row.MapGroupID, x: Number(row.PosX), y: Number(row.PosY) });
}
/** An actor's place, on the first of `maps` it is on, else wherever it is. */
function actor(name, maps) {
  const found = actors.get(name) ?? [];
  for (const map of maps) {
    const hit = found.find((place) => place.map === map);
    if (hit) return hit;
  }
  return found[0] ?? null;
}
const mapFileWorlds = new Map();
for (const row of mapBase.values()) {
  const file = row.MapFile?.match(/\/([^/.']+)\.[^/']+'$/)?.[1]?.toLowerCase();
  if (file && worldIds.has(Number(row.MapGroupID)) && row.MapType !== 'INSIDE') {
    mapFileWorlds.set(file, row.MapGroupID);
  }
}
const npcs = new Map();
const npcFolder = 'ExportSectionNpcData';
for (const folder of readdirSync(join(extractDir, npcFolder))) {
  const map = mapFileWorlds.get(folder.toLowerCase()) ?? folder;
  if (!existsSync(join(extractDir, npcFolder, folder, 'SectionNpcData.xml'))) continue;
  for (const row of rows(`${npcFolder}/${folder}/SectionNpcData`)) {
    if (row.CID && !npcs.has(row.CID)) npcs.set(row.CID, { map, x: Number(row.PosX), y: Number(row.PosY) });
  }
}
const redirects = new Map();
for (const row of rows('QuestStepPositionGroupData')) {
  if (!redirects.has(row.ID)) redirects.set(row.ID, new Map());
  redirects.get(row.ID).set(row.StepPositionMapID, row.StepPosition);
}
/** The mark each category's steps carry where a row names none: its `?`. */
const CATEGORY_MARK = { MAIN: 2, EPIC: 4, SUB: 4, CHARACTER: 6, ADVENT_GRADE: 10 };
const category = new Map(rows('QuestMainData').map((row) => [row.ID, row.Category]));
/** A step's `[world, x, y, mark]`, or null when the world map does not mark it. */
function questMark(step) {
  const maps = [step.IconMapGroupID, step.MapID2, step.StepPositionMapID, '100', '200', '1'].filter(
    (map) => map && map !== '0',
  );
  let target = step.StepPosition ? actor(step.StepPosition, maps) : null;
  if (!target && step.StepType?.startsWith('TALK_TO_NPC') && step.StepValue1) {
    target = actor(`NPC${step.StepValue1}`, maps) ?? npcs.get(step.StepValue1) ?? null;
  }
  // The world the mark is on: the target's, or the one the step's map (1, the
  // castle town, is a part of Orbis) is in.
  const home =
    target && worldIds.has(Number(target.map)) ? target.map : String(worldOf(step.IconMapGroupID || '100') ?? '');
  const redirect = redirects.get(step.StepPositionGroupID)?.get(home);
  const place = redirect ? actor(redirect, [home]) : target?.map === home ? target : null;
  if (!place || !worldIds.has(Number(home))) return null;
  const mark =
    Number(step.MapButtonDesign?.match(/Icon_Mark_QuestMark_(\d+)/)?.[1]) || CATEGORY_MARK[category.get(step.ID)];
  if (!mark) return null;
  return [Number(home), place.x, place.y, mark];
}
const marks = new Map();
for (const table of ['QuestStepData', 'QuestStepData_Export']) {
  for (const row of rows(table)) {
    if (!marks.has(row.ID)) marks.set(row.ID, {});
    const quest = marks.get(row.ID);
    if (row.StepID in quest) continue;
    quest[row.StepID] = questMark(row);
  }
}

const quests = {};
for (const row of rows('QuestMainData')) {
  const questMarks = Object.fromEntries(Object.entries(marks.get(row.ID) ?? {}).filter(([, mark]) => mark));
  quests[row.ID] = {
    order: Number(row.Order ?? 0),
    ...(questText(row.QuestDesc) && { description: questText(row.QuestDesc) }),
    steps: steps.get(row.ID) ?? {},
    ...(Object.keys(questMarks).length > 0 && { marks: questMarks }),
  };
}

// ---------------------------------------------------------------- write

const world = {
  worlds,
  fieldMaps,
  regions,
  labels,
  waypoints,
  statues,
  dungeons,
  chestNames,
  chests,
  loot,
  minigames,
  quests,
};
writeFileSync(new URL('../crates/core/data/world.json', import.meta.url), `${JSON.stringify(world)}\n`);
console.log(
  `worlds ${worlds.length}, regions ${regions.length}, waypoints ${waypoints.length}, statues ${statues.length}, ` +
    `dungeons ${dungeons.length}, chests ${chests.length}, minigames ${minigames.length}, labels ${labels.length}, ` +
    `quests ${Object.keys(quests).length} (steps marked ${Object.values(quests).reduce((n, q) => n + Object.keys(q.marks ?? {}).length, 0)})`,
);
