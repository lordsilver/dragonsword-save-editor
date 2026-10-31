//! The world the World map and Quests screens show: the warp points, Statues
//! of Organa, Eona's Legacy, dungeons, chests and mini-games the game places
//! on its world maps, and its quest log, read against the save's progress.
//!
//! The places come from the game's tables through `scripts/gen-world.mjs`
//! (`data/world.json`), the map images and where they sit in the world from
//! `scripts/gen-world-map.mjs` (`data/world_maps.json`). docs/game-rules.md
//! ("World") lists the tables and the save columns behind each one.

use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use rand::Rng;
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::catalog::Item;
use crate::domain::{Game, RewardGrant};
use crate::error::{Error, Result};
use crate::gamedata::Text;
use crate::growth::Growth;

const WORLD_JSON: &str = include_str!("../data/world.json");
const WORLD_MAPS_JSON: &str = include_str!("../data/world_maps.json");

/// The place a world map image covers: a square of `size` world units whose
/// corner is (`x0`, `y0`). The image shows world point (X, Y) at
/// `((y0 + size - Y) / size, (X - x0) / size)`, across and down.
#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MapPlacement {
    pub x0: f64,
    pub y0: f64,
    pub size: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorldData {
    worlds: Vec<WorldDef>,
    /// The world each open-world map (`tb_user.REGION_CID`) is in.
    field_maps: HashMap<String, i64>,
    regions: Vec<RegionDef>,
    waypoints: Vec<WaypointDef>,
    statues: Vec<StatueDef>,
    dungeons: Vec<DungeonDef>,
    chest_names: HashMap<String, Text>,
    chests: Vec<ChestDef>,
    /// What a chest gives, by its `RewardData` ID.
    loot: HashMap<String, Vec<LootDraw>>,
    minigames: Vec<MinigameDef>,
    quests: HashMap<String, QuestDef>,
    #[serde(skip)]
    maps: HashMap<i64, MapPlacement>,
}

#[derive(Debug, Deserialize)]
struct WorldDef {
    id: i64,
    name: Text,
}

#[derive(Debug, Deserialize)]
struct RegionDef {
    id: i64,
    world: i64,
    name: Text,
    missions: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct WaypointDef {
    id: i64,
    kind: String,
    world: i64,
    region: Option<i64>,
    name: Text,
    /// The `tb_switch` bit set once the waypoint is activated.
    switch: i64,
    /// What activating it gives: `[item CID, count]`.
    #[serde(default)]
    reward: Vec<[i64; 2]>,
    x: f64,
    y: f64,
}

#[derive(Debug, Deserialize)]
struct StatueDef {
    id: i64,
    waypoint: i64,
    /// The `tb_field_statue` bit of the statue whole.
    complete: i64,
    /// The `tb_field_statue` bits of its pieces.
    pieces: Vec<i64>,
}

#[derive(Debug, Deserialize)]
struct DungeonDef {
    id: i64,
    world: i64,
    region: Option<i64>,
    name: Text,
    x: f64,
    y: f64,
}

#[derive(Debug, Deserialize)]
struct ChestDef {
    /// Its `PropTreasureBoxData` ID and its bit in `tb_treasure_box`.
    id: i64,
    world: i64,
    region: Option<i64>,
    name: i64,
    grade: String,
    lock: Option<String>,
    /// Its `RewardData` ID, a key of `loot`.
    loot: Option<i64>,
    x: f64,
    y: f64,
}

/// One draw of a chest's loot: made with `chance`, it picks one entry by
/// weight. An entry is `[item CID, min count, max count, weight]`; a draw
/// with no entries gives nothing.
#[derive(Debug, Deserialize)]
struct LootDraw {
    chance: f64,
    entries: Vec<[i64; 4]>,
}

/// Rolls a chest's loot the way its `RewardData` row reads: each draw happens
/// with its chance and picks one entry by weight, with a count anywhere from
/// the entry's minimum to its maximum.
fn roll_loot(draws: &[LootDraw], rng: &mut impl Rng) -> Vec<(i64, i64)> {
    let mut items = Vec::new();
    for draw in draws {
        let total: i64 = draw.entries.iter().map(|entry| entry[3].max(0)).sum();
        if total == 0 || !rng.gen_bool(draw.chance.clamp(0.0, 1.0)) {
            continue;
        }
        let mut pick = rng.gen_range(0..total);
        for &[cid, min, max, weight] in &draw.entries {
            let weight = weight.max(0);
            if pick < weight {
                let count = if max > min {
                    rng.gen_range(min..=max)
                } else {
                    min
                };
                if count > 0 {
                    items.push((cid, count));
                }
                break;
            }
            pick -= weight;
        }
    }
    items
}

#[derive(Debug, Deserialize)]
struct MinigameDef {
    id: i64,
    region: i64,
}

#[derive(Debug, Deserialize)]
struct QuestDef {
    description: Option<Text>,
    steps: HashMap<String, Text>,
}

impl WorldData {
    fn shared() -> &'static WorldData {
        static DATA: OnceLock<WorldData> = OnceLock::new();
        DATA.get_or_init(|| {
            let mut data: WorldData =
                serde_json::from_str(WORLD_JSON).expect("bundled world.json is valid");
            let maps: HashMap<String, MapPlacement> =
                serde_json::from_str(WORLD_MAPS_JSON).expect("bundled world_maps.json is valid");
            data.maps = maps
                .into_iter()
                .map(|(id, place)| (id.parse().expect("world ids are numbers"), place))
                .collect();
            data
        })
    }

    fn statue_of(&self, waypoint: i64) -> Option<&StatueDef> {
        self.statues
            .iter()
            .find(|statue| statue.waypoint == waypoint)
    }
}

// --------------------------------------------------------------------- views

/// The world maps with every place on them and the save's progress.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldView {
    pub worlds: Vec<WorldInfo>,
    pub regions: Vec<RegionView>,
    pub waypoints: Vec<WaypointView>,
    pub dungeons: Vec<DungeonView>,
    pub chests: Vec<ChestView>,
    /// Where the player stands, when that is on a world map.
    pub player: Option<PlayerPlace>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldInfo {
    pub id: i64,
    pub name: Text,
    /// Where the map image sits; none when the editor has no image of it.
    pub map: Option<MapPlacement>,
}

/// A part of a world the game's world map counts completion in.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionView {
    pub id: i64,
    pub world: i64,
    pub name: Text,
    pub missions: Vec<MissionProgress>,
}

/// One completion count of a region, in the order the game lists them.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionProgress {
    /// TREASUREBOX_OPEN, MINIGAME, DUNGEON_FIND, WAYPOINT_OPEN,
    /// FIELDSTATUE_COMPLETE or WINDMILL_OPEN.
    pub kind: String,
    pub done: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WaypointView {
    pub id: i64,
    /// `waypoint`, `statue` (Statue of Organa), `legacy` (Eona's Legacy) or
    /// `tower` (the Tower of Trials).
    pub kind: String,
    pub world: i64,
    pub region: Option<i64>,
    pub name: Text,
    pub x: f64,
    pub y: f64,
    pub active: bool,
    pub statue: Option<StatueProgress>,
    /// What activating it gives in the game: 100 corps EXP for a warp point.
    pub reward: Vec<RewardView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RewardView {
    pub item: Item,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatueProgress {
    pub id: i64,
    pub restored: bool,
    pub pieces: i64,
    pub found: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DungeonView {
    pub id: i64,
    pub world: i64,
    pub region: Option<i64>,
    pub name: Text,
    pub x: f64,
    pub y: f64,
    pub found: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChestView {
    pub id: i64,
    pub world: i64,
    pub region: Option<i64>,
    pub name: Text,
    pub grade: String,
    /// What keeps it shut: `lock` (beat the monsters around it), `hide` (win
    /// its mini-game), `excavation` (dig it up), `lock_with_key` or
    /// `hide_with_map`; none for a chest that just opens.
    pub lock: Option<String>,
    /// Whether it gives anything; `chest_loot` lists what.
    pub loot: bool,
    pub x: f64,
    pub y: f64,
    pub released: bool,
    pub opened: bool,
}

/// One draw of a chest's loot as the World map lists it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LootDrawView {
    /// The chance the draw happens, 1 for every chest the game places.
    pub chance: f64,
    /// How many times the chest makes this same draw.
    pub times: i64,
    pub options: Vec<LootOption>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LootOption {
    pub item: Item,
    pub min: i64,
    pub max: i64,
    /// The chance this is what the draw picks.
    pub chance: f64,
}

/// What marking places done did.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldProgress {
    pub done: i64,
    /// Places asked for that were done already, which give nothing again.
    pub already_done: i64,
    pub grant: RewardGrant,
    pub levels_gained: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerPlace {
    pub world: i64,
    pub x: f64,
    pub y: f64,
}

/// One quest of the game's quest log and where the save stands on it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestEntry {
    pub id: i64,
    pub category: String,
    pub name_en: String,
    pub name_fr: String,
    pub description: Option<Text>,
    /// `done`, `active` or `open` (not started).
    pub state: String,
    /// The step the save is on, for a quest in progress.
    pub step: Option<QuestStep>,
    /// How many steps the quest has.
    pub steps: i64,
    /// Why the editor cannot complete it, for a quest in progress.
    pub blocked: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestStep {
    pub id: i64,
    /// How far into the step the save is (kills, items handed in).
    pub count: i64,
    pub text: Option<Text>,
}

// ------------------------------------------------------------------ the save

/// The kinds of place the World map edits, each kept in the save its own way.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PlaceKind {
    /// A warp point, Eona's Legacy or the Tower of Trials: activated is its
    /// `tb_switch` bit.
    Waypoint,
    /// A Statue of Organa restored: its pieces and the statue whole in
    /// `tb_field_statue`, and its warp activated.
    Statue,
    /// A dungeon found: a row of `tb_active_dungeon`.
    Dungeon,
    /// A chest opened: its `tb_treasure_box` OPENED bit, and RELEASED, as
    /// opening needs the lock open first.
    Chest,
}

impl Game<'_> {
    /// The ids set in one bit-field column of a `CATEGORY`-keyed table (bit
    /// `id % 64` of category `id / 64`); none when the save lacks the table.
    fn world_bits(&self, table: &str, column: &str) -> Result<HashSet<i64>> {
        if !self.table_exists(table)? {
            return Ok(HashSet::new());
        }
        let mut statement = self.conn().prepare(&format!(
            "SELECT CATEGORY, {column} FROM {table} WHERE USER_DBID=?"
        ))?;
        let rows = statement.query_map(params![self.user_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, Option<i64>>(1)?))
        })?;
        let mut out = HashSet::new();
        for row in rows {
            let (category, field) = row?;
            let field = field.unwrap_or(0) as u64;
            for bit in 0..64 {
                if field >> bit & 1 == 1 {
                    out.insert(category * 64 + bit);
                }
            }
        }
        Ok(out)
    }

    /// Sets or clears the bits of `ids` in one bit-field column, keeping the
    /// row's other columns.
    fn write_world_bits(&self, table: &str, column: &str, ids: &[i64], value: bool) -> Result<()> {
        if !self.table_exists(table)? {
            return Err(Error::invalid(format!("this save has no {table} table")));
        }
        let mut masks: HashMap<i64, u64> = HashMap::new();
        for id in ids {
            *masks.entry(id / 64).or_default() |= 1u64 << (id % 64);
        }
        for (category, mask) in masks {
            let current: Option<i64> = self
                .conn()
                .query_row(
                    &format!("SELECT {column} FROM {table} WHERE USER_DBID=? AND CATEGORY=?"),
                    params![self.user_id, category],
                    |row| row.get(0),
                )
                .optional()?
                .flatten();
            let current = current.unwrap_or(0) as u64;
            let field = if value {
                current | mask
            } else {
                current & !mask
            };
            self.conn().execute(
                &format!(
                    "INSERT INTO {table} (USER_DBID, CATEGORY, {column}) VALUES (?,?,?)
                     ON CONFLICT(USER_DBID, CATEGORY) DO UPDATE SET {column}=excluded.{column}"
                ),
                params![self.user_id, category, field as i64],
            )?;
        }
        Ok(())
    }

    fn found_dungeons(&self) -> Result<HashSet<i64>> {
        if !self.table_exists("tb_active_dungeon")? {
            return Ok(HashSet::new());
        }
        let mut statement = self
            .conn()
            .prepare("SELECT DUNGEON_GROUP_CID FROM tb_active_dungeon WHERE USER_DBID=?")?;
        let rows = statement.query_map(params![self.user_id], |row| row.get::<_, i64>(0))?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// Where the player stands, when that is on a world map.
    fn player_place(&self) -> Result<Option<PlayerPlace>> {
        let data = WorldData::shared();
        let place: Option<(i64, f64, f64)> = self
            .conn()
            .query_row(
                "SELECT REGION_CID, POS_X, POS_Y FROM tb_user WHERE USER_DBID=?",
                params![self.user_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;
        Ok(place.and_then(|(map, x, y)| {
            let world = *data.field_maps.get(&map.to_string())?;
            Some(PlayerPlace { world, x, y })
        }))
    }

    pub fn world(&self) -> Result<WorldView> {
        let data = WorldData::shared();
        let switches = self.world_bits("tb_switch", "BIT_FIELD")?;
        let statue_bits = self.world_bits("tb_field_statue", "BIT_FIELD")?;
        let opened = self.world_bits("tb_treasure_box", "OPENED_BIT_FIELD")?;
        let released = self.world_bits("tb_treasure_box", "RELEASED_BIT_FIELD")?;
        let minigames = self.world_bits("tb_minigame", "BIT_FIELD")?;
        let found = self.found_dungeons()?;

        let waypoints: Vec<WaypointView> = data
            .waypoints
            .iter()
            .map(|waypoint| WaypointView {
                id: waypoint.id,
                kind: waypoint.kind.clone(),
                world: waypoint.world,
                region: waypoint.region,
                name: waypoint.name.clone(),
                x: waypoint.x,
                y: waypoint.y,
                active: switches.contains(&waypoint.switch),
                reward: waypoint
                    .reward
                    .iter()
                    .map(|&[cid, count]| RewardView {
                        item: self.catalog().lookup(cid),
                        count,
                    })
                    .collect(),
                statue: data.statue_of(waypoint.id).map(|statue| StatueProgress {
                    id: statue.id,
                    restored: statue_bits.contains(&statue.complete),
                    pieces: statue.pieces.len() as i64,
                    found: statue
                        .pieces
                        .iter()
                        .filter(|piece| statue_bits.contains(piece))
                        .count() as i64,
                }),
            })
            .collect();
        let dungeons: Vec<DungeonView> = data
            .dungeons
            .iter()
            .map(|dungeon| DungeonView {
                id: dungeon.id,
                world: dungeon.world,
                region: dungeon.region,
                name: dungeon.name.clone(),
                x: dungeon.x,
                y: dungeon.y,
                found: found.contains(&dungeon.id),
            })
            .collect();
        let chests: Vec<ChestView> = data
            .chests
            .iter()
            .map(|chest| ChestView {
                id: chest.id,
                world: chest.world,
                region: chest.region,
                name: data
                    .chest_names
                    .get(&chest.name.to_string())
                    .cloned()
                    .unwrap_or_default(),
                grade: chest.grade.clone(),
                lock: chest.lock.clone(),
                loot: chest.loot.is_some(),
                x: chest.x,
                y: chest.y,
                released: released.contains(&chest.id),
                opened: opened.contains(&chest.id),
            })
            .collect();

        let regions = data
            .regions
            .iter()
            .map(|region| {
                let here = |place: Option<i64>| place == Some(region.id);
                let count = |done: usize, total: usize| (done as i64, total as i64);
                let missions = region
                    .missions
                    .iter()
                    .filter_map(|kind| {
                        let (done, total) = match kind.as_str() {
                            "TREASUREBOX_OPEN" => {
                                let chests: Vec<_> =
                                    chests.iter().filter(|c| here(c.region)).collect();
                                count(chests.iter().filter(|c| c.opened).count(), chests.len())
                            }
                            "MINIGAME" => {
                                let games: Vec<_> = data
                                    .minigames
                                    .iter()
                                    .filter(|g| g.region == region.id)
                                    .collect();
                                count(
                                    games.iter().filter(|g| minigames.contains(&g.id)).count(),
                                    games.len(),
                                )
                            }
                            "DUNGEON_FIND" => {
                                let places: Vec<_> =
                                    dungeons.iter().filter(|d| here(d.region)).collect();
                                count(places.iter().filter(|d| d.found).count(), places.len())
                            }
                            "WAYPOINT_OPEN" | "WINDMILL_OPEN" => {
                                let kind = if kind == "WAYPOINT_OPEN" {
                                    "waypoint"
                                } else {
                                    "legacy"
                                };
                                let places: Vec<_> = waypoints
                                    .iter()
                                    .filter(|w| w.kind == kind && here(w.region))
                                    .collect();
                                count(places.iter().filter(|w| w.active).count(), places.len())
                            }
                            "FIELDSTATUE_COMPLETE" => {
                                let places: Vec<_> = waypoints
                                    .iter()
                                    .filter_map(|w| w.statue.as_ref().filter(|_| here(w.region)))
                                    .collect();
                                count(places.iter().filter(|s| s.restored).count(), places.len())
                            }
                            _ => return None,
                        };
                        Some(MissionProgress {
                            kind: kind.clone(),
                            done,
                            total,
                        })
                    })
                    .collect();
                RegionView {
                    id: region.id,
                    world: region.world,
                    name: region.name.clone(),
                    missions,
                }
            })
            .collect();

        Ok(WorldView {
            worlds: data
                .worlds
                .iter()
                .map(|world| WorldInfo {
                    id: world.id,
                    name: world.name.clone(),
                    map: data.maps.get(&world.id).copied(),
                })
                .collect(),
            regions,
            waypoints,
            dungeons,
            chests,
            player: self.player_place()?,
        })
    }

    /// What a chest can give, draw by draw, with the same draws merged.
    pub fn chest_loot(&self, id: i64) -> Result<Vec<LootDrawView>> {
        let data = WorldData::shared();
        let chest = data
            .chests
            .iter()
            .find(|chest| chest.id == id)
            .ok_or_else(|| Error::invalid(format!("unknown chest {id}")))?;
        let Some(draws) = chest.loot.and_then(|loot| data.loot.get(&loot.to_string())) else {
            return Ok(Vec::new());
        };
        let mut out: Vec<(&LootDraw, i64)> = Vec::new();
        for draw in draws.iter().filter(|draw| !draw.entries.is_empty()) {
            match out.last_mut() {
                Some((last, times))
                    if last.entries == draw.entries && last.chance == draw.chance =>
                {
                    *times += 1
                }
                _ => out.push((draw, 1)),
            }
        }
        Ok(out
            .into_iter()
            .map(|(draw, times)| {
                let total: i64 = draw.entries.iter().map(|entry| entry[3].max(0)).sum();
                LootDrawView {
                    chance: draw.chance,
                    times,
                    options: draw
                        .entries
                        .iter()
                        .map(|&[cid, min, max, weight]| LootOption {
                            item: self.catalog().lookup(cid),
                            min,
                            max,
                            chance: if total > 0 {
                                weight.max(0) as f64 / total as f64
                            } else {
                                0.0
                            },
                        })
                        .collect(),
                }
            })
            .collect())
    }

    /// Marks places done the way the game does, and hands out what they give
    /// when `grant` is set: a warp point (or the Tower of Trials) its
    /// reward, 100 corps EXP; a chest its loot, rolled from its table, with
    /// gear and karma created and corps EXP levelling the corps up. A Statue
    /// of Organa gets every piece back and its warp activated, and a chest is
    /// released as well as opened. A place that is done already is counted
    /// and left alone, so nothing is handed out twice.
    pub fn complete_world_places(
        &mut self,
        kind: PlaceKind,
        ids: &[i64],
        grant: bool,
    ) -> Result<WorldProgress> {
        let data = WorldData::shared();
        let mut progress = WorldProgress::default();
        let mut items: Vec<(i64, i64)> = Vec::new();
        let mut gain = |cid: i64, count: i64| match items.iter_mut().find(|(seen, _)| *seen == cid)
        {
            Some((_, total)) => *total += count,
            None => items.push((cid, count)),
        };
        let (level_before, _) = self.corps_status()?;
        let transaction = self.conn().unchecked_transaction()?;
        match kind {
            PlaceKind::Waypoint => {
                let active = self.world_bits("tb_switch", "BIT_FIELD")?;
                let mut switches: Vec<i64> = Vec::new();
                for id in ids {
                    let waypoint = data
                        .waypoints
                        .iter()
                        .find(|waypoint| waypoint.id == *id)
                        .ok_or_else(|| Error::invalid(format!("unknown waypoint {id}")))?;
                    if active.contains(&waypoint.switch) || switches.contains(&waypoint.switch) {
                        progress.already_done += 1;
                        continue;
                    }
                    switches.push(waypoint.switch);
                    if grant {
                        for &[cid, count] in &waypoint.reward {
                            gain(cid, count);
                        }
                    }
                }
                self.write_world_bits("tb_switch", "BIT_FIELD", &switches, true)?;
                progress.done = switches.len() as i64;
            }
            PlaceKind::Statue => {
                let restored = self.world_bits("tb_field_statue", "BIT_FIELD")?;
                let mut bits: Vec<i64> = Vec::new();
                let mut switches: Vec<i64> = Vec::new();
                for id in ids {
                    let statue = data
                        .statues
                        .iter()
                        .find(|statue| statue.id == *id)
                        .ok_or_else(|| Error::invalid(format!("unknown statue {id}")))?;
                    if restored.contains(&statue.complete) || bits.contains(&statue.complete) {
                        progress.already_done += 1;
                        continue;
                    }
                    bits.push(statue.complete);
                    bits.extend(&statue.pieces);
                    if let Some(waypoint) = data.waypoints.iter().find(|w| w.id == statue.waypoint)
                    {
                        switches.push(waypoint.switch);
                    }
                    progress.done += 1;
                }
                self.write_world_bits("tb_field_statue", "BIT_FIELD", &bits, true)?;
                self.write_world_bits("tb_switch", "BIT_FIELD", &switches, true)?;
            }
            PlaceKind::Dungeon => {
                if !self.table_exists("tb_active_dungeon")? {
                    return Err(Error::invalid("this save has no tb_active_dungeon table"));
                }
                let found = self.found_dungeons()?;
                for id in ids {
                    if !data.dungeons.iter().any(|dungeon| dungeon.id == *id) {
                        return Err(Error::invalid(format!("unknown dungeon {id}")));
                    }
                    let added = !found.contains(id)
                        && self.conn().execute(
                            "INSERT OR IGNORE INTO tb_active_dungeon (USER_DBID, DUNGEON_GROUP_CID) VALUES (?,?)",
                            params![self.user_id, id],
                        )? == 1;
                    if added {
                        progress.done += 1;
                    } else {
                        progress.already_done += 1;
                    }
                }
            }
            PlaceKind::Chest => {
                let opened = self.world_bits("tb_treasure_box", "OPENED_BIT_FIELD")?;
                let mut rng = rand::thread_rng();
                let mut chosen: Vec<i64> = Vec::new();
                for id in ids {
                    let chest = data
                        .chests
                        .iter()
                        .find(|chest| chest.id == *id)
                        .ok_or_else(|| Error::invalid(format!("unknown chest {id}")))?;
                    if opened.contains(id) || chosen.contains(id) {
                        progress.already_done += 1;
                        continue;
                    }
                    if let (true, Some(loot)) = (grant, chest.loot) {
                        let draws = data.loot.get(&loot.to_string()).ok_or_else(|| {
                            Error::invalid(format!("chest {id} names missing loot {loot}"))
                        })?;
                        for (cid, count) in roll_loot(draws, &mut rng) {
                            gain(cid, count);
                        }
                    }
                    chosen.push(*id);
                }
                self.write_world_bits("tb_treasure_box", "RELEASED_BIT_FIELD", &chosen, true)?;
                self.write_world_bits("tb_treasure_box", "OPENED_BIT_FIELD", &chosen, true)?;
                progress.done = chosen.len() as i64;
            }
        }
        if !items.is_empty() {
            self.add_reward(0, &items, &mut progress.grant)?;
        }
        transaction.commit()?;
        let (level_after, _) = self.corps_status()?;
        progress.levels_gained = level_after - level_before;
        if progress.done > 0 {
            self.touch();
        }
        Ok(progress)
    }

    /// Undoes places, which the game itself never does: switches warp
    /// points off, breaks statues (their pieces, the statue whole and its
    /// warp), forgets dungeons and marks chests not opened. A chest keeps its
    /// lock open, so the game lets the player open it again. Doing a place
    /// again hands out its reward again, which is why the app allows this
    /// only when its settings say so. Returns how many places were asked for.
    pub fn undo_world_places(&mut self, kind: PlaceKind, ids: &[i64]) -> Result<i64> {
        let data = WorldData::shared();
        let transaction = self.conn().unchecked_transaction()?;
        match kind {
            PlaceKind::Waypoint => {
                let switches = ids
                    .iter()
                    .map(|id| {
                        data.waypoints
                            .iter()
                            .find(|waypoint| waypoint.id == *id)
                            .map(|waypoint| waypoint.switch)
                            .ok_or_else(|| Error::invalid(format!("unknown waypoint {id}")))
                    })
                    .collect::<Result<Vec<_>>>()?;
                self.write_world_bits("tb_switch", "BIT_FIELD", &switches, false)?;
            }
            PlaceKind::Statue => {
                let mut bits = Vec::new();
                let mut switches = Vec::new();
                for id in ids {
                    let statue = data
                        .statues
                        .iter()
                        .find(|statue| statue.id == *id)
                        .ok_or_else(|| Error::invalid(format!("unknown statue {id}")))?;
                    bits.push(statue.complete);
                    bits.extend(&statue.pieces);
                    if let Some(waypoint) = data.waypoints.iter().find(|w| w.id == statue.waypoint)
                    {
                        switches.push(waypoint.switch);
                    }
                }
                self.write_world_bits("tb_field_statue", "BIT_FIELD", &bits, false)?;
                self.write_world_bits("tb_switch", "BIT_FIELD", &switches, false)?;
            }
            PlaceKind::Dungeon => {
                if !self.table_exists("tb_active_dungeon")? {
                    return Err(Error::invalid("this save has no tb_active_dungeon table"));
                }
                for id in ids {
                    if !data.dungeons.iter().any(|dungeon| dungeon.id == *id) {
                        return Err(Error::invalid(format!("unknown dungeon {id}")));
                    }
                    self.conn().execute(
                        "DELETE FROM tb_active_dungeon WHERE USER_DBID=? AND DUNGEON_GROUP_CID=?",
                        params![self.user_id, id],
                    )?;
                }
            }
            PlaceKind::Chest => {
                if let Some(id) = ids
                    .iter()
                    .find(|id| !data.chests.iter().any(|chest| chest.id == **id))
                {
                    return Err(Error::invalid(format!("unknown chest {id}")));
                }
                self.write_world_bits("tb_treasure_box", "OPENED_BIT_FIELD", ids, false)?;
            }
        }
        transaction.commit()?;
        self.touch();
        Ok(ids.len() as i64)
    }

    /// Every quest of the game's quest log, by category and ID, and where
    /// the save stands on each.
    pub fn quest_log(&self) -> Result<Vec<QuestEntry>> {
        let growth = Growth::shared();
        let data = WorldData::shared();
        let complete: HashSet<i64> = self
            .quest_ids("tb_quest_complete", "")?
            .into_iter()
            .collect();
        let mut held: HashMap<i64, (i64, i64)> = HashMap::new();
        if self.table_exists("tb_quest_hold")? {
            let mut statement = self
                .conn()
                .prepare("SELECT QUEST_CID, STEP_ID, CNT FROM tb_quest_hold WHERE USER_DBID=?")?;
            let rows = statement.query_map(params![self.user_id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })?;
            for row in rows {
                let (id, step, count) = row?;
                held.insert(id, (step, count));
            }
        }
        let mut out = Vec::new();
        for (id, quest) in growth.quests() {
            // Unreleased quests have no name in the game's strings.
            if quest.name_en.is_empty() {
                continue;
            }
            let def = data.quests.get(&id.to_string());
            let (state, step, blocked) = if complete.contains(&id) {
                ("done", None, None)
            } else if let Some((step, count)) = held.get(&id) {
                let text = def
                    .and_then(|def| def.steps.get(&step.to_string()))
                    .cloned();
                (
                    "active",
                    Some(QuestStep {
                        id: *step,
                        count: *count,
                        text,
                    }),
                    self.completion_blocker(quest)?,
                )
            } else {
                ("open", None, None)
            };
            out.push(QuestEntry {
                id,
                category: quest.category.clone(),
                name_en: quest.name_en.clone(),
                name_fr: quest.name_fr.clone(),
                description: def.and_then(|def| def.description.clone()),
                state: state.to_string(),
                step,
                steps: def.map_or(0, |def| def.steps.len() as i64),
                blocked,
            });
        }
        out.sort_unstable_by_key(|entry| entry.id);
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_place_is_in_a_world_and_region_of_the_data() {
        let data = WorldData::shared();
        let worlds: HashSet<i64> = data.worlds.iter().map(|world| world.id).collect();
        let regions: HashSet<i64> = data.regions.iter().map(|region| region.id).collect();
        assert_eq!(worlds, HashSet::from([100, 200]));
        assert_eq!(data.regions.len(), 12);
        for waypoint in &data.waypoints {
            assert!(worlds.contains(&waypoint.world), "waypoint {}", waypoint.id);
            assert!(
                waypoint
                    .region
                    .is_none_or(|region| regions.contains(&region))
            );
        }
        for chest in &data.chests {
            assert!(worlds.contains(&chest.world), "chest {}", chest.id);
            assert!(
                data.chest_names.contains_key(&chest.name.to_string()),
                "chest {}",
                chest.id
            );
        }
        for statue in &data.statues {
            assert!(
                data.waypoints.iter().any(|w| w.id == statue.waypoint),
                "statue {}",
                statue.id
            );
        }
        let ids: HashSet<i64> = data.chests.iter().map(|chest| chest.id).collect();
        assert_eq!(ids.len(), data.chests.len(), "a chest is placed once");
    }

    #[test]
    fn orbis_has_a_map_that_covers_its_places() {
        let data = WorldData::shared();
        let map = data.maps.get(&100).expect("Orbis has a map");
        assert_eq!(
            *map,
            MapPlacement {
                x0: -165_990.0,
                y0: -151_100.0,
                size: 460_000.0
            }
        );
        // The capture stops short of Orbis's edges: a statue, a dungeon and
        // 99 chests lie up to a tenth of the map beyond it, most of them south
        // of it, and the World map screen draws them past the image.
        let place = |x: f64, y: f64| ((map.y0 + map.size - y) / map.size, (x - map.x0) / map.size);
        let inside = |(across, down): (f64, f64)| {
            (0.0..=1.0).contains(&across) && (0.0..=1.0).contains(&down)
        };
        let near = |(across, down): (f64, f64)| {
            (-0.12..=1.12).contains(&across) && (-0.12..=1.12).contains(&down)
        };
        let orbis = |world: i64| world == 100;
        let points: Vec<(f64, f64)> = data
            .waypoints
            .iter()
            .filter(|w| orbis(w.world))
            .map(|w| place(w.x, w.y))
            .chain(
                data.dungeons
                    .iter()
                    .filter(|d| orbis(d.world))
                    .map(|d| place(d.x, d.y)),
            )
            .chain(
                data.chests
                    .iter()
                    .filter(|c| orbis(c.world))
                    .map(|c| place(c.x, c.y)),
            )
            .collect();
        assert!(points.iter().all(|point| near(*point)));
        assert_eq!(points.iter().filter(|point| !inside(**point)).count(), 101);
        // Belos's map textures do not match a capture square, so it has none yet.
        assert!(!data.maps.contains_key(&200));
    }

    #[test]
    fn waypoints_use_the_cookbook_switch_table_without_overlapping_recipes() {
        let data = WorldData::shared();
        // Recipes use switches 1001 and up (scripts/gen-catalog.mjs).
        for waypoint in &data.waypoints {
            assert!(
                waypoint.switch > 0 && waypoint.switch < 1001,
                "waypoint {}",
                waypoint.id
            );
        }
    }

    #[test]
    fn every_warp_point_gives_100_corps_exp() {
        let data = WorldData::shared();
        for waypoint in &data.waypoints {
            match waypoint.kind.as_str() {
                "waypoint" | "tower" => assert_eq!(
                    waypoint.reward,
                    vec![[1_000_201, 100]],
                    "waypoint {}",
                    waypoint.id
                ),
                _ => assert!(waypoint.reward.is_empty(), "waypoint {}", waypoint.id),
            }
        }
    }

    #[test]
    fn every_chest_has_loot_the_catalog_knows() {
        let data = WorldData::shared();
        let catalog = crate::catalog::Catalog::shared();
        for chest in &data.chests {
            let loot = chest.loot.expect("every placed chest has loot");
            let draws = data.loot.get(&loot.to_string()).expect("its table");
            assert!(!draws.is_empty(), "chest {}", chest.id);
            for draw in draws {
                for &[cid, min, max, weight] in &draw.entries {
                    assert!(
                        min > 0 && max >= min && weight >= 0,
                        "chest {} item {cid}",
                        chest.id
                    );
                    assert!(
                        !catalog.lookup(cid).name_en.is_empty(),
                        "chest {} item {cid}",
                        chest.id
                    );
                }
            }
        }
    }

    #[test]
    fn a_legendary_chest_rolls_its_fixed_draws_and_one_pick_per_draw() {
        use rand::SeedableRng;

        let data = WorldData::shared();
        // Chest 11001, a Legendary Chest: 1,000 corps EXP, 30,000 gold, one
        // of two fragments, one of three books, and three weighted extras.
        let draws = data.loot.get("1501900").expect("loot 1501900");
        for seed in 0..50 {
            let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
            let items = roll_loot(draws, &mut rng);
            assert_eq!(items.len(), 7, "seed {seed}: {items:?}");
            assert_eq!(items[0], (1_000_201, 1_000));
            assert_eq!(items[1], (1_000_001, 30_000));
            assert!([1_450_403, 1_000_501].contains(&items[2].0) && items[2].1 == 25);
            assert!([1_410_005, 1_410_105, 1_410_205].contains(&items[3].0) && items[3].1 == 5);
        }
    }
}
