//! The game's own maths and texts for heroes, equipment, karma, costumes,
//! skills and items, generated into `data/game.json` by
//! `scripts/gen-game-data.mjs` from the XML tables in the game's paks.
//!
//! docs/game-rules.md ("Hero stats") gives every formula with the table it
//! comes from and the in-game screens it was checked against. In short, a
//! source of Attack, Defence or Max HP turns points into the stat through
//! `StatListData.StatValue` (14 points per Attack, 20 per Defence, 1.3 per
//! Max HP) and is floored; the hero screen then shows
//! `floor((hero + flat adds) × (1 + percent adds))`.

use std::collections::HashMap;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

const GAME_JSON: &str = include_str!("../data/game.json");

/// The key the three headline stats use in the game's tables.
pub const ATTACK: &str = "Attack";
pub const DEFENCE: &str = "Defence";
pub const MAX_HP: &str = "MAXHP";
pub const CRITICAL: &str = "Critical_Per";
pub const CRITICAL_DAMAGE: &str = "CriticalDmg_Per";

/// Floors a stat the way the game's integer stats come out, forgiving the
/// float error of an exact product (1816 × 1.15 is 2088.3999…).
fn floor(value: f64) -> i64 {
    (value + 1e-6).floor() as i64
}

/// A game string in both languages the editor speaks, rich-text tags kept.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Text {
    pub en: String,
    pub fr: String,
}

impl Text {
    fn pair(en: &str, fr: &str) -> Self {
        Self {
            en: en.to_string(),
            fr: fr.to_string(),
        }
    }

    /// Replaces `{0}` in both languages.
    pub fn with(&self, value: &str) -> Self {
        Self {
            en: self.en.replace("{0}", value),
            fr: self.fr.replace("{0}", value),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatDef {
    pub name_en: String,
    pub name_fr: String,
    pub percent: bool,
    /// Points per unit: a stat from points is `points / this`.
    pub points: f64,
    /// `Show`, `Conditional` or `Hidden` on the game's stat screens.
    pub show: String,
}

#[derive(Debug, Clone, Copy, Default, Deserialize)]
pub struct Ratios {
    pub hp: f64,
    pub attack: f64,
    pub defence: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AscendStep {
    pub points: f64,
    pub ratios: Ratios,
    #[serde(default)]
    pub stats: HashMap<String, f64>,
}

/// A trait (`CharacterAbilityType`) with the karma category's name and the
/// emblem the hero screen shows beside a hero's name.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraitInfo {
    #[serde(default)]
    pub key: String,
    pub name_en: String,
    pub name_fr: String,
    #[serde(rename(serialize = "iconX", deserialize = "x"))]
    pub icon_x: i32,
    #[serde(rename(serialize = "iconY", deserialize = "y"))]
    pub icon_y: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AwakenStep {
    pub step: i64,
    pub name_en: String,
    pub name_fr: String,
    pub desc_en: String,
    pub desc_fr: String,
    /// The material the step consumes (one of it).
    pub item: i64,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub stats: HashMap<String, f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeroData {
    pub grade: String,
    #[serde(rename = "trait")]
    pub trait_key: Option<String>,
    pub points: f64,
    pub ratios: Ratios,
    pub base: HashMap<String, f64>,
    pub ascend: Vec<AscendStep>,
    pub image: String,
    pub quote_en: String,
    pub quote_fr: String,
    pub bio_en: String,
    pub bio_fr: String,
    #[serde(default)]
    pub awaken: Vec<AwakenStep>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EquipmentData {
    pub part: String,
    pub grade: String,
    #[serde(rename = "trait", default)]
    pub trait_key: Option<String>,
    /// The main stat group and the piece's default points for it.
    pub main: (i64, f64),
    pub subs: Vec<(i64, f64)>,
    #[serde(default)]
    pub set: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnchantTable {
    pub ratio: Vec<f64>,
    pub exp: Vec<i64>,
    pub max_enchant: i64,
    pub max_subs: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetBonus {
    pub count: i64,
    pub label_en: String,
    pub label_fr: String,
    pub stats: HashMap<String, f64>,
    pub skills: Vec<Text>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetData {
    pub name_en: String,
    pub name_fr: String,
    #[serde(rename = "trait", default)]
    pub trait_key: Option<String>,
    pub bonuses: Vec<SetBonus>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LevelTable {
    pub ratio: Vec<f64>,
    pub exp: Vec<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraitEffect {
    pub stats: HashMap<String, f64>,
    pub desc_en: String,
    pub desc_fr: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KarmaData {
    pub grade: String,
    #[serde(rename = "trait")]
    pub trait_key: Option<String>,
    pub points: f64,
    pub ratios: Ratios,
    pub ascend: Vec<AscendStep>,
    /// Indexed by the karma's transcendence; a gap is null.
    pub trait_effects: Vec<Option<TraitEffect>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CostumeData {
    pub costume: i64,
    pub hero: i64,
    /// `CLOTH` or `WEAPON`.
    pub slot: String,
    pub name_en: String,
    pub name_fr: String,
    /// The hero portrait the costume switches to, when the game ships one.
    #[serde(default)]
    pub icon_path: Option<String>,
    #[serde(default)]
    pub x: i32,
    #[serde(default)]
    pub y: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SkillLevel {
    pub level: i64,
    #[serde(default)]
    pub damage: Option<i64>,
    #[serde(default)]
    pub gold: Option<i64>,
    #[serde(default)]
    pub items: Vec<(i64, i64)>,
    #[serde(default)]
    pub ascend: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SkillTree {
    /// SkillDesc_1 … _4: description, damage line, inflicted status, notes.
    pub lines: HashMap<String, Text>,
    pub levels: Vec<SkillLevel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tab {
    pub key: String,
    pub name_en: String,
    pub name_fr: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryInfo {
    #[serde(rename = "type")]
    pub kind: String,
    pub name_en: String,
    pub name_fr: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemInfo {
    #[serde(default)]
    pub category: Option<i64>,
    #[serde(default)]
    pub desc_en: Option<String>,
    #[serde(default)]
    pub desc_fr: Option<String>,
    #[serde(default)]
    pub sub_en: Option<String>,
    #[serde(default)]
    pub sub_fr: Option<String>,
    #[serde(default)]
    pub cooldown: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IconRef {
    #[serde(rename(serialize = "iconX", deserialize = "x"))]
    pub x: i32,
    #[serde(rename(serialize = "iconY", deserialize = "y"))]
    pub y: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameData {
    pub max_stamina: i64,
    pub stats: HashMap<String, StatDef>,
    pub traits: HashMap<String, TraitInfo>,
    pub level_ratio: HashMap<String, Vec<f64>>,
    pub heroes: HashMap<String, HeroData>,
    pub stat_rolls: HashMap<String, (String, f64)>,
    pub enchant: HashMap<String, EnchantTable>,
    pub equipment: HashMap<String, EquipmentData>,
    pub sets: HashMap<String, SetData>,
    pub karma_levels: HashMap<String, LevelTable>,
    pub karma: HashMap<String, KarmaData>,
    pub costumes: HashMap<String, CostumeData>,
    pub skills: HashMap<String, HashMap<String, SkillTree>>,
    pub tabs: Vec<Tab>,
    pub categories: HashMap<String, CategoryInfo>,
    pub items: HashMap<String, ItemInfo>,
    pub grade_stars: HashMap<String, i64>,
    pub star_icon: IconRef,
    pub ui: HashMap<String, Text>,
}

impl GameData {
    pub fn shared() -> &'static GameData {
        static DATA: OnceLock<GameData> = OnceLock::new();
        DATA.get_or_init(|| {
            let mut data: GameData =
                serde_json::from_str(GAME_JSON).expect("bundled game.json is valid");
            for (key, info) in &mut data.traits {
                info.key = key.clone();
            }
            data
        })
    }

    pub fn hero(&self, cid: i64) -> Option<&HeroData> {
        self.heroes.get(&cid.to_string())
    }

    pub fn trait_info(&self, key: Option<&str>) -> Option<TraitInfo> {
        key.and_then(|key| self.traits.get(key)).cloned()
    }

    pub fn stat_def(&self, key: &str) -> Option<&StatDef> {
        self.stats.get(key)
    }

    /// A stat from points, before flooring.
    fn stat_from_points(&self, key: &str, points: f64) -> f64 {
        match self.stats.get(key) {
            Some(def) if def.points > 0.0 => points / def.points,
            _ => 0.0,
        }
    }

    pub fn costume(&self, cid: i64) -> Option<&CostumeData> {
        self.costumes.get(&cid.to_string())
    }

    pub fn skill_tree(&self, hero: i64, type_value: i64) -> Option<&SkillTree> {
        self.skills
            .get(&hero.to_string())?
            .get(&type_value.to_string())
    }

    pub fn item_info(&self, cid: i64) -> Option<&ItemInfo> {
        self.items.get(&cid.to_string())
    }

    /// The category an item's card names under its title, and its inventory tab.
    pub fn category(&self, id: i64) -> Option<&CategoryInfo> {
        self.categories.get(&id.to_string())
    }

    pub fn ui(&self, key: &str) -> Text {
        self.ui.get(key).cloned().unwrap_or_default()
    }

    /// Grade stars as the game draws them on dishes, ingredients and equipment.
    pub fn stars(&self, grade: &str) -> i64 {
        self.grade_stars
            .get(&grade.to_ascii_uppercase())
            .copied()
            .unwrap_or(0)
    }
}

/// One stat with its value, named as the game names it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StatValue {
    pub key: String,
    pub name_en: String,
    pub name_fr: String,
    pub percent: bool,
    /// A flat amount, or a fraction for a percentage (0.0336 is 3.36%).
    pub value: f64,
}

impl StatValue {
    fn new(data: &GameData, key: &str, value: f64) -> Self {
        let def = data.stat_def(key);
        Self {
            key: key.to_string(),
            name_en: def.map_or(key, |def| &def.name_en).to_string(),
            name_fr: def.map_or(key, |def| &def.name_fr).to_string(),
            percent: def.is_some_and(|def| def.percent),
            value,
        }
    }
}

/// A sub stat on an equipment card: its roll, and the enchant level that opens it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubStat {
    pub stat: Option<StatValue>,
    pub unlock_at: i64,
    pub active: bool,
}

/// An equipment piece's stats at its enchant level.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EquipmentStats {
    pub part: String,
    pub grade: String,
    pub stars: i64,
    pub max_enchant: i64,
    pub main: Option<StatValue>,
    pub subs: Vec<SubStat>,
    pub set_id: Option<i64>,
}

/// The value one stat roll (a `MAIN_STAT_CID` or `SUB_STAT_CID`) gives a piece.
fn roll(data: &GameData, roll_cid: i64, points: f64, ratio: f64) -> Option<StatValue> {
    let (key, roll_ratio) = data.stat_rolls.get(&roll_cid.to_string())?;
    let value = data.stat_from_points(key, points * ratio * roll_ratio);
    Some(StatValue::new(data, key, value))
}

pub fn equipment_stats(
    data: &GameData,
    cid: i64,
    enchant: i64,
    main_cid: i64,
    sub_cids: &[i64],
) -> Option<EquipmentStats> {
    let piece = data.equipment.get(&cid.to_string())?;
    let table = data.enchant.get(&piece.grade)?;
    let level = enchant.clamp(0, table.ratio.len() as i64 - 1) as usize;
    let ratio = table.ratio[level];
    // One sub stat opens every MaxEnchant / MaxSubOption levels: +3, +6, +9 …
    let step = if table.max_subs > 0 {
        table.max_enchant / table.max_subs
    } else {
        0
    };
    let subs = piece
        .subs
        .iter()
        .enumerate()
        .filter_map(|(index, &(_, points))| {
            let cid = sub_cids.get(index).copied().unwrap_or(0);
            if cid == 0 {
                return None;
            }
            let unlock_at = step * (index as i64 + 1);
            Some(SubStat {
                stat: roll(data, cid, points, ratio),
                unlock_at,
                active: enchant >= unlock_at,
            })
        })
        .collect();
    Some(EquipmentStats {
        part: piece.part.clone(),
        grade: piece.grade.clone(),
        stars: data.stars(&piece.grade),
        max_enchant: table.max_enchant,
        main: (main_cid != 0)
            .then(|| roll(data, main_cid, piece.main.1, ratio))
            .flatten(),
        subs,
        set_id: piece.set,
    })
}

/// A set's bonuses and which of them the worn pieces turn on.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetView {
    pub id: i64,
    pub name_en: String,
    pub name_fr: String,
    pub pieces: i64,
    pub bonuses: Vec<SetBonusView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetBonusView {
    pub count: i64,
    pub label_en: String,
    pub label_fr: String,
    pub active: bool,
    pub stats: Vec<StatValue>,
    pub skills: Vec<Text>,
}

pub fn set_view(data: &GameData, id: i64, pieces: i64) -> Option<SetView> {
    let set = data.sets.get(&id.to_string())?;
    Some(SetView {
        id,
        name_en: set.name_en.clone(),
        name_fr: set.name_fr.clone(),
        pieces,
        bonuses: set
            .bonuses
            .iter()
            .map(|bonus| {
                let mut stats: Vec<StatValue> = bonus
                    .stats
                    .iter()
                    .map(|(key, value)| StatValue::new(data, key, *value))
                    .collect();
                stats.sort_by(|left, right| left.key.cmp(&right.key));
                SetBonusView {
                    count: bonus.count,
                    label_en: bonus.label_en.clone(),
                    label_fr: bonus.label_fr.clone(),
                    active: pieces >= bonus.count,
                    stats,
                    skills: bonus.skills.clone(),
                }
            })
            .collect(),
    })
}

/// Attack, Defence and Max HP from points, each floored as the game shows it.
#[derive(Debug, Clone, Copy, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CoreStats {
    pub attack: i64,
    pub defence: i64,
    pub max_hp: i64,
}

fn split(
    data: &GameData,
    level_points: f64,
    ratios: Ratios,
    ascend: Option<&AscendStep>,
) -> CoreStats {
    let part = |key: &str, ratio: f64, ascend_ratio: f64| {
        let ascend_points = ascend.map_or(0.0, |step| step.points * ascend_ratio);
        floor(data.stat_from_points(key, level_points * ratio + ascend_points))
    };
    CoreStats {
        attack: part(
            ATTACK,
            ratios.attack,
            ascend.map_or(0.0, |step| step.ratios.attack),
        ),
        defence: part(
            DEFENCE,
            ratios.defence,
            ascend.map_or(0.0, |step| step.ratios.defence),
        ),
        max_hp: part(MAX_HP, ratios.hp, ascend.map_or(0.0, |step| step.ratios.hp)),
    }
}

/// A karma's Attack, Defence and Max HP at a level and breakthrough.
pub fn karma_stats(data: &GameData, cid: i64, level: i64, ascend: i64) -> Option<CoreStats> {
    let karma = data.karma.get(&cid.to_string())?;
    let table = data.karma_levels.get(&karma.grade)?;
    let ratio = *table
        .ratio
        .get((level.max(1) - 1) as usize)
        .or(table.ratio.last())?;
    Some(split(
        data,
        karma.points * ratio,
        karma.ratios,
        karma.ascend.get(ascend.max(0) as usize),
    ))
}

/// The karma's trait effect at its transcendence.
pub fn karma_trait(data: &GameData, cid: i64, transcend: i64) -> Option<&TraitEffect> {
    let karma = data.karma.get(&cid.to_string())?;
    karma.trait_effects.get(transcend.max(0) as usize)?.as_ref()
}

/// The hero's own Attack, Defence and Max HP from level and breakthrough.
pub fn hero_core(data: &GameData, cid: i64, level: i64, ascend: i64) -> Option<CoreStats> {
    let hero = data.hero(cid)?;
    let ratios = data.level_ratio.get(&hero.grade)?;
    let ratio = *ratios.get((level.max(1) - 1) as usize).or(ratios.last())?;
    Some(split(
        data,
        hero.points * ratio,
        hero.ratios,
        hero.ascend.get(ascend.max(0) as usize),
    ))
}

/// A piece of equipment a hero wears, as the save stores it.
#[derive(Debug, Clone, Copy)]
pub struct WornPiece {
    pub cid: i64,
    pub enchant: i64,
    pub main_cid: i64,
    pub sub_cids: [i64; 5],
}

/// The karma a hero wears.
#[derive(Debug, Clone, Copy)]
pub struct WornKarma {
    pub cid: i64,
    pub level: i64,
    pub ascend: i64,
    pub transcend: i64,
}

#[derive(Debug, Clone)]
pub struct HeroInput {
    pub cid: i64,
    pub level: i64,
    pub ascend: i64,
    pub transcend: i64,
    pub pieces: Vec<WornPiece>,
    pub karma: Option<WornKarma>,
    /// `tb_user.REWARD_MAX_STAMINA`, added to the game's 240.
    pub reward_max_stamina: i64,
}

/// The hero screen's stats, and every other stat the hero has.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeroStats {
    pub attack: i64,
    pub defence: i64,
    pub max_hp: i64,
    pub critical: f64,
    pub critical_damage: f64,
    pub max_stamina: i64,
    /// The rest, for the Detailed Stats list, sorted by the game's stat order.
    pub details: Vec<StatValue>,
    /// Whether the worn karma's trait matches the hero's (the trait effect applies).
    pub karma_trait_applied: Option<bool>,
}

pub fn hero_stats(data: &GameData, input: &HeroInput) -> Option<HeroStats> {
    let hero = data.hero(input.cid)?;
    let own = hero_core(data, input.cid, input.level, input.ascend)?;
    let mut flat = CoreStats::default();
    let mut other: HashMap<String, f64> = hero.base.clone();
    let mut add = |key: &str, value: f64, flat: &mut CoreStats| match key {
        ATTACK => flat.attack += floor(value),
        DEFENCE => flat.defence += floor(value),
        MAX_HP => flat.max_hp += floor(value),
        _ => *other.entry(key.to_string()).or_default() += value,
    };
    for step in hero
        .awaken
        .iter()
        .filter(|step| step.step <= input.transcend)
    {
        for (key, value) in &step.stats {
            add(key, *value, &mut flat);
        }
    }
    let mut set_pieces: HashMap<i64, i64> = HashMap::new();
    for piece in &input.pieces {
        let Some(stats) = equipment_stats(
            data,
            piece.cid,
            piece.enchant,
            piece.main_cid,
            &piece.sub_cids,
        ) else {
            continue;
        };
        if let Some(main) = &stats.main {
            add(&main.key, main.value, &mut flat);
        }
        for sub in stats.subs.iter().filter(|sub| sub.active) {
            if let Some(stat) = &sub.stat {
                add(&stat.key, stat.value, &mut flat);
            }
        }
        if let Some(set) = stats.set_id {
            *set_pieces.entry(set).or_default() += 1;
        }
    }
    for (id, pieces) in set_pieces {
        let Some(set) = data.sets.get(&id.to_string()) else {
            continue;
        };
        for bonus in set.bonuses.iter().filter(|bonus| pieces >= bonus.count) {
            for (key, value) in &bonus.stats {
                add(key, *value, &mut flat);
            }
        }
    }
    let mut karma_trait_applied = None;
    if let Some(karma) = input.karma {
        if let Some(stats) = karma_stats(data, karma.cid, karma.level, karma.ascend) {
            flat.attack += stats.attack;
            flat.defence += stats.defence;
            flat.max_hp += stats.max_hp;
        }
        let karma_trait_key = data
            .karma
            .get(&karma.cid.to_string())
            .and_then(|data| data.trait_key.as_deref());
        let applied = karma_trait_key.is_some() && karma_trait_key == hero.trait_key.as_deref();
        karma_trait_applied = Some(applied);
        if applied && let Some(effect) = karma_trait(data, karma.cid, karma.transcend) {
            for (key, value) in &effect.stats {
                add(key, *value, &mut flat);
            }
        }
    }
    let percent = |key: &str| other.get(key).copied().unwrap_or(0.0);
    let total = |own: i64, flat: i64, key: &str| floor((own + flat) as f64 * (1.0 + percent(key)));
    let attack = total(own.attack, flat.attack, "Attack_Per");
    let defence = total(own.defence, flat.defence, "Defence_Per");
    let max_hp = total(own.max_hp, flat.max_hp, "MAXHP_Per");
    let max_stamina = data.max_stamina + input.reward_max_stamina + floor(percent("MaxStamina"));
    let mut details: Vec<StatValue> = other
        .iter()
        .filter(|(key, value)| {
            **value != 0.0
                && !matches!(
                    key.as_str(),
                    "Attack_Per" | "Defence_Per" | "MAXHP_Per" | "MaxStamina"
                )
        })
        .map(|(key, value)| StatValue::new(data, key, *value))
        .collect();
    details.sort_by(|left, right| left.key.cmp(&right.key));
    Some(HeroStats {
        attack,
        defence,
        max_hp,
        critical: percent(CRITICAL),
        critical_damage: percent(CRITICAL_DAMAGE),
        max_stamina,
        details,
        karma_trait_applied,
    })
}

/// The Skill screen's text for a slot at a level: each SkillDesc line, the
/// damage line's `{0}` filled with the level's Attack Power percentage.
pub fn skill_lines(data: &GameData, hero: i64, type_value: i64, level: i64) -> Vec<(String, Text)> {
    let Some(tree) = data.skill_tree(hero, type_value) else {
        return Vec::new();
    };
    let damage = tree
        .levels
        .get((level.max(1) - 1) as usize)
        .and_then(|level| level.damage);
    let mut lines: Vec<(String, Text)> = tree
        .lines
        .iter()
        .filter_map(|(index, line)| {
            if line.en.contains("{0}") {
                let damage = damage?;
                Some((index.clone(), line.with(&damage.to_string())))
            } else {
                Some((index.clone(), line.clone()))
            }
        })
        .collect();
    lines.sort_by(|left, right| left.0.cmp(&right.0));
    lines
}

/// The label the Skill screen shows above an active or signal slot.
pub fn skill_label(data: &GameData, order: i64, master: bool) -> Option<Text> {
    let key = match (order, master) {
        (_, true) => "master",
        (5, _) => "active1",
        (6, _) => "active2",
        (7, _) => "signalA",
        (8, _) => "signalB",
        _ => return None,
    };
    data.ui.get(key).cloned()
}

/// What an item's card shows in the game's inventory.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemCard {
    /// The inventory tab: the category's `CategoryType` (`COOK`, `EQUIP`,
    /// `KARMA`, `GEM`, `GROW_MATERIAL`, `NORMAL_MATERIAL`, `VALUABLE`, `QUEST`).
    pub tab: Option<String>,
    /// The category the card names under the title ("Grilling", "Meat" …).
    pub subtitle: Option<Text>,
    pub desc: Option<Text>,
    /// A second text, such as a karma's quote.
    pub sub: Option<Text>,
    /// Grade stars, on the tabs whose tiles show them.
    pub stars: i64,
    /// A dish's cooldown in seconds.
    pub cooldown: Option<f64>,
}

pub fn item_card(cid: i64, grade: &str) -> ItemCard {
    let data = GameData::shared();
    let Some(info) = data.item_info(cid) else {
        return ItemCard::default();
    };
    let category = info.category.and_then(|id| data.category(id));
    let tab = category.map(|category| category.kind.clone());
    let pair = |en: &Option<String>, fr: &Option<String>| {
        en.as_ref().map(|en| Text {
            en: en.clone(),
            fr: fr.clone().unwrap_or_else(|| en.clone()),
        })
    };
    // The bag draws stars on dishes, ingredients and equipment only.
    let stars = match tab.as_deref() {
        Some("COOK" | "NORMAL_MATERIAL" | "EQUIP") => data.stars(grade),
        _ => 0,
    };
    ItemCard {
        subtitle: category
            .filter(|category| !category.name_en.is_empty())
            .map(|category| Text::pair(&category.name_en, &category.name_fr)),
        tab,
        desc: pair(&info.desc_en, &info.desc_fr),
        sub: pair(&info.sub_en, &info.sub_fr),
        stars,
        cooldown: info.cooldown,
    }
}

/// The game's own labels the editor's screens use, the inventory's tabs and
/// the grade star.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameUi {
    pub tabs: Vec<Tab>,
    pub strings: HashMap<String, Text>,
    pub star_icon: IconRef,
    pub max_stamina: i64,
}

pub fn game_ui() -> GameUi {
    let data = GameData::shared();
    let mut strings = data.ui.clone();
    for key in [
        ATTACK,
        DEFENCE,
        MAX_HP,
        CRITICAL,
        CRITICAL_DAMAGE,
        "MaxStamina",
    ] {
        if let Some(def) = data.stat_def(key) {
            strings.insert(
                format!("stat.{key}"),
                Text::pair(&def.name_en, &def.name_fr),
            );
        }
    }
    GameUi {
        tabs: data.tabs.clone(),
        strings,
        star_icon: data.star_icon.clone(),
        max_stamina: data.max_stamina,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn data() -> &'static GameData {
        GameData::shared()
    }

    #[test]
    fn lute_at_level_one_matches_the_hero_screen() {
        // Screenshot 2026-10-26 23:59:49: Attack 71, Defense 20, Max HP 461,
        // Critical Rate 5%, Critical Damage 50%, Max Stamina 240.
        let stats = hero_stats(
            data(),
            &HeroInput {
                cid: 10002,
                level: 1,
                ascend: 0,
                transcend: 0,
                pieces: Vec::new(),
                karma: None,
                reward_max_stamina: 0,
            },
        )
        .unwrap();
        assert_eq!((stats.attack, stats.defence, stats.max_hp), (71, 20, 461));
        assert!((stats.critical - 0.05).abs() < 1e-9);
        assert!((stats.critical_damage - 0.5).abs() < 1e-9);
        assert_eq!(stats.max_stamina, 240);
        assert_eq!(stats.karma_trait_applied, None);
    }

    #[test]
    fn karma_at_level_five_matches_its_card() {
        // Screenshot 2026-10-27 03:21:28: Destruction Is the Mother of
        // Creation, Lv. 5: Attack 93, Defense 26, Max HP 601.
        let stats = karma_stats(data(), 1701501, 5, 0).unwrap();
        assert_eq!(
            stats,
            CoreStats {
                attack: 93,
                defence: 26,
                max_hp: 601
            }
        );
        let effect = karma_trait(data(), 1701501, 0).unwrap();
        assert!(effect.desc_en.contains("325"));
    }

    #[test]
    fn equipment_main_stat_matches_the_item_card() {
        // Screenshot 2026-10-27 11:39:26: Ballad of Life Helmet +0, Critical
        // Hit Resistance 3.36%; sub stats open at +3, +6 and +9.
        let stats = equipment_stats(data(), 1370121, 0, 3308, &[32115, 32206, 32322]).unwrap();
        let main = stats.main.unwrap();
        assert_eq!(main.key, "CriticalResist_Per");
        assert_eq!((main.value * 10000.0).floor() / 100.0, 3.36);
        let unlocks: Vec<i64> = stats.subs.iter().map(|sub| sub.unlock_at).collect();
        assert_eq!(unlocks, [3, 6, 9]);
        assert!(stats.subs.iter().all(|sub| !sub.active));
        assert_eq!(stats.stars, 3);
    }

    #[test]
    fn reina_with_gear_and_karma_matches_the_hero_screen() {
        // Screenshot 2026-10-27 03:21:21: Reina Lv. 20, Attack 281, Defense
        // 80, Max HP 2088, Critical Rate 6.36%, Critical Damage 50%, wearing
        // the Ballad of Life set (rolls from the save's tb_equipment rows
        // created before the screenshot) and the karma above, whose Breaker
        // trait does not match her Gale and is not applied.
        let piece = |cid, main_cid| WornPiece {
            cid,
            enchant: 0,
            main_cid,
            sub_cids: [0; 5],
        };
        let stats = hero_stats(
            data(),
            &HeroInput {
                cid: 10004,
                level: 20,
                ascend: 0,
                transcend: 0,
                pieces: vec![
                    piece(1370121, 3308),
                    piece(1370122, 3108),
                    piece(1370123, 3209),
                    piece(1370124, 3505),
                    piece(1370125, 3406),
                ],
                karma: Some(WornKarma {
                    cid: 1701501,
                    level: 5,
                    ascend: 0,
                    transcend: 0,
                }),
                reward_max_stamina: 0,
            },
        )
        .unwrap();
        assert_eq!((stats.attack, stats.defence, stats.max_hp), (281, 80, 2088));
        assert_eq!((stats.critical * 10000.0).floor() / 100.0, 6.36);
        assert!((stats.critical_damage - 0.5).abs() < 1e-9);
        assert_eq!(stats.karma_trait_applied, Some(false));
    }

    #[test]
    fn skill_damage_matches_the_skill_screens() {
        // Screenshots 2026-10-26/27: Sword Slash Lv. 1 367%, Wild Blow Lv. 1
        // 392%, Upper Blow Lv. 1 944%, Wind Sword Lv. 3 420%, Tempest Lv. 2
        // 909%, Judgment Spiral Lv. 1 355%.
        for (hero, type_value, level, damage) in [
            (10002, 6, 1, "367"),
            (10003, 6, 1, "392"),
            (10003, 4, 1, "944"),
            (10004, 6, 3, "420"),
            (10004, 3, 2, "909"),
            (10022, 6, 1, "355"),
        ] {
            let lines = skill_lines(data(), hero, type_value, level);
            let line = lines
                .iter()
                .find(|(index, _)| index == "2")
                .unwrap_or_else(|| panic!("hero {hero} skill {type_value} has no damage line"));
            assert!(
                line.1.en.contains(&format!("{damage}%")),
                "hero {hero} skill {type_value} Lv. {level}: {}",
                line.1.en
            );
        }
        // Wind Sword Lv. 3 -> 4 costs three skill books, one 1450815 and 10,000 gold.
        let next = &data().skill_tree(10004, 6).unwrap().levels[3];
        assert_eq!(next.items, [(1450811, 3), (1450815, 1)]);
        assert_eq!(next.gold, Some(10000));
    }

    #[test]
    fn a_swimsuit_switches_reinas_portrait() {
        let costume = data().costume(9990030).unwrap();
        assert_eq!((costume.hero, costume.slot.as_str()), (10004, "CLOTH"));
        assert_eq!(
            costume.icon_path.as_deref(),
            Some("Art/UI/InGame/Icon_Character/Icon_Character_Reina_Unique_01")
        );
        assert!(costume.x != 0 || costume.y != 0, "the portrait is packed");
    }

    #[test]
    fn text_pair_fills_its_value() {
        assert_eq!(
            Text::pair("+{0} needed", "+{0} requis").with("3"),
            Text::pair("+3 needed", "+3 requis")
        );
    }
}
