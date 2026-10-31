//! Record what the desktop commands return for one save, for the browser
//! preview (`pnpm preview:ui`, see docs/development.md).
//!
//! `cargo run -p dsa-core --example preview_fixture -- <copy of a save.db> <out.json>`
//!
//! Only read commands are recorded; the save is opened and never written.
//! Keys are the Tauri command names, and commands that take a hero CID store
//! one answer per CID.

use std::collections::BTreeMap;

use dsa_core::catalog::STAT_NAMES;
use dsa_core::{Catalog, SaveSession};
use serde_json::{Value, json};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [save, out] = args.as_slice() else {
        return Err("usage: preview_fixture <save.db> <out.json>".into());
    };
    let mut session = SaveSession::open(save)?;
    let catalog = Catalog::shared();
    let mut fixture: BTreeMap<&str, Value> = BTreeMap::new();

    fixture.insert(
        "save_current",
        json!({
            "path": session.path().to_string_lossy(),
            "accountId": session.account_id(),
            "slot": session.slot(),
            "userId": session.user_id(),
            "dirty": false,
            "warnings": session.warnings(),
            "consistency": session.consistency(),
        }),
    );
    fixture.insert("raw_tables", serde_json::to_value(session.raw_tables()?)?);
    fixture.insert(
        "game_ui",
        serde_json::to_value(dsa_core::gamedata::game_ui())?,
    );
    fixture.insert(
        "app_info",
        json!({
            "version": env!("CARGO_PKG_VERSION"),
            "platform": "preview",
            "dataDir": "",
            "settingsPath": "",
            "suggestedRoots": [],
            "catalog": {
                "items": catalog.len(),
                "recipes": catalog.recipes().len(),
                "titles": catalog.titles().len(),
                "categories": catalog.categories().len(),
            },
            "statNames": STAT_NAMES,
        }),
    );

    let game = session.catalog_game(catalog);
    let characters = game.characters()?;
    let mut skills = serde_json::Map::new();
    let mut loadouts = serde_json::Map::new();
    for character in &characters {
        let cid = character.cid.to_string();
        skills.insert(
            cid.clone(),
            serde_json::to_value(game.skills(character.cid)?)?,
        );
        loadouts.insert(cid, serde_json::to_value(game.loadout(character.cid)?)?);
    }
    fixture.insert("characters_get", serde_json::to_value(&characters)?);
    fixture.insert("skills_get", Value::Object(skills));
    fixture.insert("loadout_get", Value::Object(loadouts));
    fixture.insert("overview_get", serde_json::to_value(game.overview()?)?);
    fixture.insert("currencies_get", serde_json::to_value(game.currencies()?)?);
    fixture.insert("inventory_get", serde_json::to_value(game.inventory()?)?);
    fixture.insert(
        "stackable_catalog",
        serde_json::to_value(game.stackable_catalog())?,
    );
    fixture.insert("teams_get", serde_json::to_value(game.teams()?)?);
    fixture.insert("equipment_get", serde_json::to_value(game.equipment()?)?);
    fixture.insert("gems_get", serde_json::to_value(game.gems()?)?);
    fixture.insert("karma_get", serde_json::to_value(game.karma()?)?);
    fixture.insert("costumes_get", serde_json::to_value(game.costumes()?)?);
    fixture.insert(
        "costume_catalog",
        serde_json::to_value(game.costume_catalog()?)?,
    );
    fixture.insert("mounts_get", serde_json::to_value(game.mounts()?)?);
    fixture.insert(
        "mount_catalog",
        serde_json::to_value(game.mount_catalog()?)?,
    );
    fixture.insert("titles_get", serde_json::to_value(game.titles()?)?);
    fixture.insert("recipes_get", serde_json::to_value(game.recipes()?)?);
    fixture.insert(
        "quest_rewards_get",
        serde_json::to_value(game.quest_rewards()?)?,
    );
    fixture.insert(
        "quests_in_progress_get",
        serde_json::to_value(game.quests_in_progress()?)?,
    );
    fixture.insert(
        "heroes_recruitable",
        serde_json::to_value(game.recruitable_heroes()?)?,
    );
    fixture.insert("world_get", serde_json::to_value(game.world()?)?);
    fixture.insert("quest_log_get", serde_json::to_value(game.quest_log()?)?);

    std::fs::write(out, serde_json::to_string(&fixture)?)?;
    println!("wrote {out}");
    Ok(())
}
