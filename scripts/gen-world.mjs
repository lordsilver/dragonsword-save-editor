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
//   = switch / 64, bit = switch % 64), as the cookbook's recipes are;
// - statues: the FieldStatueData rows on a waypoint. A statue is restored
//   piece by piece: each FieldStatuePartsData row is a bit of tb_field_statue
//   (category = id / 64), and the `Complete` part is the statue whole;
// - dungeons: the MapDungeonGroupData rows with an entrance on a world map
//   (WarpPositionData DUNGEON). tb_active_dungeon lists the ones found;
// - chests: every chest placed on a world map, by its PropTreasureBoxData ID,
//   which is also its bit in tb_treasure_box (category = id / 64). The save
//   keeps three bits per chest: RELEASED (its lock is open: the monsters are
//   beaten, the mini-game won, the key used), OPENED and REGISTERED_MAP (shown
//   on the map by a treasure map). `lock` is the TreasureBoxLockType;
// - minigames: the MiniGameData rows of a region; tb_minigame bits;
// - quests: per QuestMainData row its order in the quest log, its
//   description and the text of each step (StringQuestData). Names, rewards
//   and prerequisites are in growth.json (scripts/gen-growth.mjs).
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
    x: Number(place.PosX),
    y: Number(place.PosY),
  });
}
const waypointIds = new Set(waypoints.map((waypoint) => waypoint.id));

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
    x: Number(place.PosX),
    y: Number(place.PosY),
  });
}

// ------------------------------------------------------------------ chests

const props = byId(rows('PropTreasureBoxData'));
const GRADES = { NORMAL: 'normal', SUPERIOR: 'superior', RARE: 'rare', EPIC: 'epic', LEGENDARY: 'legendary' };
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
    chests.push({
      id: Number(row.CID),
      world,
      region: regionOf(prop.FogSectionID),
      name: Number(prop.Name),
      grade,
      ...(prop.TreasureBoxLockType && { lock: prop.TreasureBoxLockType.toLowerCase() }),
      x: Number(row.PosX),
      y: Number(row.PosY),
    });
  }
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
const quests = {};
for (const row of rows('QuestMainData')) {
  quests[row.ID] = {
    order: Number(row.Order ?? 0),
    ...(questText(row.QuestDesc) && { description: questText(row.QuestDesc) }),
    steps: steps.get(row.ID) ?? {},
  };
}

// ---------------------------------------------------------------- write

const world = { worlds, fieldMaps, regions, waypoints, statues, dungeons, chestNames, chests, minigames, quests };
writeFileSync(new URL('../crates/core/data/world.json', import.meta.url), `${JSON.stringify(world)}\n`);
console.log(
  `worlds ${worlds.length}, regions ${regions.length}, waypoints ${waypoints.length}, statues ${statues.length}, ` +
    `dungeons ${dungeons.length}, chests ${chests.length}, minigames ${minigames.length}, quests ${Object.keys(quests).length}`,
);
