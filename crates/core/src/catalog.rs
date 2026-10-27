//! Bilingual item/recipe/title catalog bundled with the app.
//!
//! Names and grades are derived from DragonSword Awakening's own data tables. Icons are
//! the game's own textures, packed into the desktop app's sprite sheet by
//! `scripts/gen-icons.mjs`; this module only carries the cell offsets.

use std::collections::HashMap;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use crate::error::Result;

const ITEMS_JSON: &str = include_str!("../data/items.json");
const ITEMS_EXTRA_JSON: &str = include_str!("../data/items_extra.json");
const CATEGORIES_JSON: &str = include_str!("../data/item_categories.json");
const RECIPES_JSON: &str = include_str!("../data/recipes.json");
const TITLES_JSON: &str = include_str!("../data/titles.json");
const SKILLS_JSON: &str = include_str!("../data/skills.json");

/// A resolved catalog entry. Names are kept in both languages so the UI can
/// switch without another round trip.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub cid: i64,
    pub name_fr: String,
    pub name_en: String,
    pub category: String,
    /// The game's own `ItemType` (`KARMA`, `GEM`, `COOKING`, …), when known.
    pub kind: String,
    pub grade: String,
    /// The game's functional item-category id, when known.
    pub group: String,
    pub icon_path: String,
    pub icon_x: i32,
    pub icon_y: i32,
    pub known: bool,
    pub icon: bool,
}

impl Item {
    pub fn fallback(cid: i64, category: &str) -> Self {
        let label = match category {
            "currency" => "Currency",
            "character" => "Character",
            "gear" => "Equipment",
            "food" => "Dish",
            "costume" => "Costume",
            "mount" => "Mount",
            "title" => "Title",
            "material" => "Item",
            _ => "Unknown",
        };
        let name = format!("{label} #{cid}");
        Self {
            cid,
            name_fr: name.clone(),
            name_en: name,
            category: category.to_string(),
            kind: String::new(),
            grade: String::new(),
            group: String::new(),
            icon_path: String::new(),
            icon_x: 0,
            icon_y: 0,
            known: false,
            icon: false,
        }
    }

    pub fn name(&self, language: &str) -> &str {
        if language == "fr" && !self.name_fr.is_empty() {
            &self.name_fr
        } else {
            &self.name_en
        }
    }

    /// Whether the game stores this item as a row in `tb_stackable_item`.
    /// Karma, titles, gems and character souls live in their own tables even
    /// though the catalog files them under `material`; food is cooked into
    /// instances instead.
    pub fn is_stackable(&self) -> bool {
        self.category == "material"
            && !matches!(
                self.kind.as_str(),
                "KARMA" | "ACCOUNT_TITLE" | "GEM" | "CHARACTER_SOUL"
            )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub key: String,
    pub label_fr: String,
    pub label_en: String,
    pub color: String,
    pub group: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectText {
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub fr: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub en: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RecipeIngredientSeed {
    pub kind: String,
    pub id: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RecipeSeed {
    pub key: i64,
    pub tool: String,
    #[serde(default)]
    pub ingredients: Vec<RecipeIngredientSeed>,
    #[serde(default)]
    pub dishes: Vec<i64>,
    #[serde(rename = "effectName", default)]
    pub effect_name: Option<EffectText>,
    #[serde(default)]
    pub effects: Vec<EffectText>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TitleStat {
    #[serde(rename = "type")]
    pub kind: String,
    /// A flat amount, or a fraction for `*_Per` stats (0.023 is 2.3%).
    pub value: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TitleSeed {
    pub id: i64,
    #[serde(rename = "nameFr", default)]
    pub name_fr: String,
    #[serde(rename = "nameEn", default)]
    pub name_en: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub stats: Vec<TitleStat>,
}

/// One slot of a hero's skill tree, as the game's Skill screen shows it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSeed {
    /// `tb_skill_growth.TYPE_VALUE`.
    #[serde(rename = "type")]
    pub type_value: i64,
    /// The game's `SlotOrder`: 1–4 the left column, 5–8 the right, 9 the
    /// master skill.
    pub order: i64,
    pub master: bool,
    pub name_en: String,
    pub name_fr: String,
    pub desc_en: String,
    pub desc_fr: String,
    /// The effect the skill applies (a `SkillEffect` key such as `BLEED`),
    /// or none for a plain attack.
    #[serde(default)]
    pub effect: Option<String>,
    #[serde(rename(serialize = "iconX", deserialize = "x"))]
    pub icon_x: i32,
    #[serde(rename(serialize = "iconY", deserialize = "y"))]
    pub icon_y: i32,
}

/// A skill effect as the game's Skill screen names it, with its badge icon.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillEffect {
    /// The game's `IconColor`: `AIR`, `BLEED`, `STUN`, …
    #[serde(default)]
    pub key: String,
    pub name_en: String,
    pub name_fr: String,
    #[serde(rename(serialize = "iconX", deserialize = "x"))]
    pub icon_x: i32,
    #[serde(rename(serialize = "iconY", deserialize = "y"))]
    pub icon_y: i32,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct SeedItem {
    #[serde(default)]
    fr: String,
    #[serde(default)]
    en: String,
    #[serde(default)]
    category: String,
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    grade: String,
    #[serde(default)]
    group: String,
    #[serde(rename = "iconPath", default)]
    icon_path: String,
    #[serde(default)]
    x: i32,
    #[serde(default)]
    y: i32,
}

#[derive(Debug, Deserialize, Default)]
struct SeedFile {
    #[serde(rename = "iconSize", default)]
    icon_size: u32,
    #[serde(default)]
    items: HashMap<String, SeedItem>,
}

#[derive(Debug, Deserialize)]
struct RecipeFile {
    #[serde(default)]
    recipes: Vec<RecipeSeed>,
    #[serde(rename = "ingredientTypeIcons", default)]
    ingredient_type_icons: HashMap<String, i64>,
}

#[derive(Debug, Deserialize)]
struct TitleFile {
    #[serde(default)]
    titles: Vec<TitleSeed>,
}

#[derive(Debug, Deserialize)]
struct SkillFile {
    effects: HashMap<String, SkillEffect>,
    heroes: HashMap<String, Vec<SkillSeed>>,
}

#[derive(Debug, Deserialize)]
struct CategoryFile {
    #[serde(default)]
    categories: Vec<Category>,
}

/// The embedded catalog, parsed once.
pub struct Catalog {
    items: HashMap<i64, SeedItem>,
    categories: Vec<Category>,
    recipes: Vec<RecipeSeed>,
    titles: Vec<TitleSeed>,
    skills: HashMap<i64, Vec<SkillSeed>>,
    skill_effects: HashMap<String, SkillEffect>,
    ingredient_icons: HashMap<i64, i64>,
    icon_size: u32,
}

impl Catalog {
    pub fn load() -> Result<Self> {
        let seed: SeedFile = serde_json::from_str(ITEMS_JSON)?;
        let mut items: HashMap<i64, SeedItem> = seed
            .items
            .into_iter()
            .filter_map(|(cid, entry)| cid.parse::<i64>().ok().map(|cid| (cid, entry)))
            .collect();
        if let Ok(extra) = serde_json::from_str::<SeedFile>(ITEMS_EXTRA_JSON) {
            for (cid, entry) in extra.items {
                if let Ok(cid) = cid.parse::<i64>() {
                    items.entry(cid).or_insert(entry);
                }
            }
        }
        let categories: CategoryFile = serde_json::from_str(CATEGORIES_JSON)?;
        let recipes: RecipeFile = serde_json::from_str(RECIPES_JSON)?;
        let titles: TitleFile = serde_json::from_str(TITLES_JSON)?;
        let skills: SkillFile = serde_json::from_str(SKILLS_JSON)?;
        let ingredient_icons = recipes
            .ingredient_type_icons
            .into_iter()
            .filter_map(|(key, cid)| key.parse::<i64>().ok().map(|key| (key, cid)))
            .collect();
        Ok(Self {
            items,
            categories: categories.categories,
            recipes: recipes.recipes,
            titles: titles.titles,
            skills: skills
                .heroes
                .into_iter()
                .filter_map(|(cid, slots)| cid.parse::<i64>().ok().map(|cid| (cid, slots)))
                .collect(),
            skill_effects: skills
                .effects
                .into_iter()
                .map(|(key, effect)| {
                    let effect = SkillEffect {
                        key: key.clone(),
                        ..effect
                    };
                    (key, effect)
                })
                .collect(),
            ingredient_icons,
            icon_size: if seed.icon_size == 0 {
                64
            } else {
                seed.icon_size
            },
        })
    }

    /// The process-wide catalog. Embedded data is validated by the crate's tests.
    pub fn shared() -> &'static Self {
        static CATALOG: OnceLock<Catalog> = OnceLock::new();
        CATALOG.get_or_init(|| Catalog::load().expect("embedded catalog is valid JSON"))
    }

    pub fn icon_size(&self) -> u32 {
        self.icon_size
    }

    pub fn categories(&self) -> &[Category] {
        &self.categories
    }

    pub fn category(&self, key: &str) -> Option<&Category> {
        self.categories.iter().find(|category| category.key == key)
    }

    pub fn recipes(&self) -> &[RecipeSeed] {
        &self.recipes
    }

    pub fn recipe(&self, key: i64) -> Option<&RecipeSeed> {
        self.recipes.iter().find(|recipe| recipe.key == key)
    }

    pub fn titles(&self) -> &[TitleSeed] {
        &self.titles
    }

    /// A hero's skill slots in the game's order, or none for an unknown hero.
    pub fn hero_skills(&self, cid: i64) -> &[SkillSeed] {
        self.skills.get(&cid).map_or(&[], Vec::as_slice)
    }

    pub fn skill_effect(&self, key: &str) -> Option<&SkillEffect> {
        self.skill_effects.get(key)
    }

    pub fn ingredient_icon(&self, group: i64) -> Option<i64> {
        self.ingredient_icons.get(&group).copied()
    }

    pub fn lookup(&self, cid: i64) -> Item {
        self.lookup_hint(cid, "")
    }

    /// Resolve a CID, letting the caller assert a category it knows from the
    /// table it came from (a `tb_currency` row is a currency regardless of CID).
    pub fn lookup_hint(&self, cid: i64, hint: &str) -> Item {
        let seed = self.items.get(&cid);
        let category = match seed {
            Some(seed) if !seed.category.is_empty() => seed.category.clone(),
            _ if !hint.is_empty() => hint.to_string(),
            _ => infer_category(cid).to_string(),
        };
        let (name_fr, name_en, kind, grade, group, icon_path, x, y) = match seed {
            Some(seed) => (
                seed.fr.clone(),
                seed.en.clone(),
                seed.kind.clone(),
                seed.grade.clone(),
                seed.group.clone(),
                seed.icon_path.clone(),
                seed.x,
                seed.y,
            ),
            None => (
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                0,
                0,
            ),
        };
        let fallback = Item::fallback(cid, &category);
        let known = !name_fr.is_empty() || !name_en.is_empty();
        Item {
            cid,
            name_fr: if name_fr.is_empty() {
                fallback.name_fr
            } else {
                name_fr
            },
            name_en: if name_en.is_empty() {
                fallback.name_en
            } else {
                name_en
            },
            category,
            kind,
            grade,
            group,
            icon_path,
            icon_x: x,
            icon_y: y,
            known,
            icon: x != 0 || y != 0,
        }
    }

    /// Every seeded item, sorted by CID, for pickers.
    pub fn entries(&self) -> Vec<Item> {
        let mut items: Vec<Item> = self.items.keys().map(|cid| self.lookup(*cid)).collect();
        items.sort_by_key(|item| item.cid);
        items
    }

    /// Items in one catalog category (used by costume/mount unlock pickers).
    pub fn entries_in(&self, category: &str) -> Vec<Item> {
        let mut items: Vec<Item> = self
            .items
            .iter()
            .filter(|(_, seed)| seed.category == category)
            .map(|(cid, _)| self.lookup(*cid))
            .collect();
        items.sort_by_key(|item| item.cid);
        items
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }
}

fn infer_category(cid: i64) -> &'static str {
    match cid {
        10_000..=10_999 => "character",
        1_000_000..=1_000_999 => "currency",
        1_320_000..=1_329_999 => "mount",
        1_360_000..=1_399_999 => "gear",
        1_420_000..=1_429_999 => "food",
        2_100_000..=2_199_999 => "title",
        9_990_000..=9_999_999 => "costume",
        _ => "material",
    }
}

/// Stat names observed in the game's equipment UI. Stat CIDs encode a type and
/// a value; the exact type mapping is not published, so the editor exposes the
/// raw CID and shows this list as a reference only.
pub const STAT_NAMES: &[&str] = &[
    "Attack",
    "Max HP",
    "Defence",
    "Attack %",
    "Max HP %",
    "Defence %",
    "Crit Rate %",
    "Crit Damage %",
    "Crit Resist %",
    "Crit Defence %",
    "Stun Damage",
    "Air Damage",
    "Down Damage",
    "Bleed Damage",
    "Fire Damage",
    "Ice Damage",
    "Shock Damage",
    "Poison Damage",
    "Break Damage",
    "All Damage",
    "Defence Penetrate",
    "Defence Negation %",
];

pub fn load_shared() -> Result<Catalog> {
    Catalog::load()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_loads_and_resolves_names() {
        let catalog = Catalog::shared();
        assert_eq!(catalog.icon_size(), 128);
        assert!(catalog.len() > 1200);
        assert_eq!(catalog.lookup(1_000_001).name_en, "Gold");
        assert_eq!(catalog.lookup(10_001).category, "character");
        assert_eq!(catalog.lookup(1_320_000).category, "mount");
        assert_eq!(catalog.lookup(9_990_008).category, "costume");
        assert_eq!(catalog.lookup(1_420_101).category, "food");
        assert_eq!(catalog.recipes().len(), 1025);
        assert_eq!(catalog.titles().len(), 109);
        assert_eq!(catalog.categories().len(), 51);
    }

    #[test]
    fn heroes_have_the_game_s_skill_tree() {
        let catalog = Catalog::shared();
        let lute = catalog.hero_skills(10_002);
        let names: Vec<_> = lute
            .iter()
            .map(|slot| (slot.type_value, slot.name_en.as_str()))
            .collect();
        assert_eq!(
            names,
            [
                (6, "Sword Slash"),
                (5, "Dropkick"),
                (8, "Dodge"),
                (7, "Kick Combo"),
                (1, "Stun Slash"),
                (2, "Healing Circle"),
                (3, "Swordgrab"),
                (4, "Relic Fall"),
                (801, "A Young Boy's Choice"),
            ]
        );
        assert!(lute[8].master);
        let effects: Vec<_> = lute.iter().map(|slot| slot.effect.as_deref()).collect();
        assert_eq!(
            effects,
            [
                None,
                None,
                None,
                None,
                Some("STUN"),
                Some("HEAL"),
                Some("DOWN"),
                None,
                None
            ]
        );
        assert_eq!(catalog.skill_effect("BLEED").unwrap().name_en, "Bleed");
        assert_eq!(catalog.skill_effect("AIR").unwrap().name_fr, "En l'air");
        assert!(lute.iter().all(|slot| slot.icon_x != 0 || slot.icon_y != 0));
        assert!(catalog.hero_skills(1).is_empty());
    }

    #[test]
    fn unknown_cids_still_get_a_usable_name() {
        let catalog = Catalog::shared();
        let item = catalog.lookup(999_999_999);
        assert!(!item.known);
        assert!(item.name_en.contains("999999999"));
    }

    #[test]
    fn gems_and_character_souls_are_not_stackable() {
        let catalog = Catalog::shared();
        assert_eq!(catalog.lookup(1_310_001).kind, "GEM");
        assert!(!catalog.lookup(1_310_001).is_stackable());
        assert_eq!(catalog.lookup(1_120_001).kind, "CHARACTER_SOUL");
        assert!(!catalog.lookup(1_120_001).is_stackable());
        assert!(catalog.lookup(1_000_501).is_stackable());
    }
}
