//! Bilingual item/recipe/title catalog bundled with the app.
//!
//! Names, grades and icons are derived from DragonSword Awakening's own data tables.
//! The sprite sheet lives in the desktop app; this module only carries the cell offsets.

use std::collections::HashMap;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use crate::error::Result;

const ITEMS_JSON: &str = include_str!("../data/items.json");
const ITEMS_EXTRA_JSON: &str = include_str!("../data/items_extra.json");
const CATEGORIES_JSON: &str = include_str!("../data/item_categories.json");
const RECIPES_JSON: &str = include_str!("../data/recipes.json");
const TITLES_JSON: &str = include_str!("../data/titles.json");

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
    /// Karma and titles live in their own tables even though the catalog files
    /// them under `material`; food is cooked into instances instead.
    pub fn is_stackable(&self) -> bool {
        self.category == "material" && !matches!(self.kind.as_str(), "KARMA" | "ACCOUNT_TITLE")
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
    pub value: i64,
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
        assert_eq!(catalog.icon_size(), 64);
        assert!(catalog.len() > 1200);
        assert_eq!(catalog.lookup(1_000_001).name_en, "Gold");
        assert_eq!(catalog.lookup(10_001).category, "character");
        assert_eq!(catalog.lookup(1_320_000).category, "mount");
        assert_eq!(catalog.lookup(9_990_008).category, "costume");
        assert_eq!(catalog.lookup(1_420_101).category, "food");
        assert_eq!(catalog.recipes().len(), 1025);
        assert_eq!(catalog.titles().len(), 108);
        assert_eq!(catalog.categories().len(), 51);
    }

    #[test]
    fn unknown_cids_still_get_a_usable_name() {
        let catalog = Catalog::shared();
        let item = catalog.lookup(999_999_999);
        assert!(!item.known);
        assert!(item.name_en.contains("999999999"));
    }
}
