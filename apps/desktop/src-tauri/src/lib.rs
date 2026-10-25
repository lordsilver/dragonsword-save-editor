//! Tauri shell around `dsa-core`: one open save at a time, typed commands for
//! every screen, and a tiny settings store.

mod settings;

use std::path::PathBuf;
use std::sync::{Mutex, PoisonError};

use dsa_core::catalog::STAT_NAMES;
use dsa_core::domain::{
    CatalogEntry, Character, Costume, Currency, Equipment, Game, Gem, Karma, Loadout, Overview,
    Recipe, Skill, Stack, TeamPage, TitleEntry, Vehicle,
};
use dsa_core::raw::{RawPage, RawTable, RawValue};
use dsa_core::{Catalog, Error, SaveSession, SlotInfo, WriteReport};
use serde::Serialize;
use tauri::{Manager, State};

use settings::{Settings, SettingsStore};

pub struct AppState {
    session: Mutex<Option<SaveSession>>,
    settings: Mutex<SettingsStore>,
}

impl AppState {
    fn new(settings: SettingsStore) -> Self {
        Self {
            session: Mutex::new(None),
            settings: Mutex::new(settings),
        }
    }

    fn session(&self) -> std::sync::MutexGuard<'_, Option<SaveSession>> {
        self.session.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn settings(&self) -> std::sync::MutexGuard<'_, SettingsStore> {
        self.settings.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// A command failure as the webview sees it: a stable kind plus a message.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    kind: String,
    message: String,
}

impl From<Error> for CommandError {
    fn from(error: Error) -> Self {
        Self {
            kind: error.kind().to_string(),
            message: error.to_string(),
        }
    }
}

impl From<String> for CommandError {
    fn from(message: String) -> Self {
        Self {
            kind: "failed".into(),
            message,
        }
    }
}

type CommandResult<T> = std::result::Result<T, CommandError>;

/// Parse a 64-bit instance id that the webview sends as a decimal string.
///
/// JavaScript numbers lose precision above 2^53, and several DragonSword
/// tables use 17-digit `ITEM_DBID` values, so ids cross the IPC boundary as
/// strings and are parsed here.
fn instance_id(raw: &str, what: &str) -> CommandResult<i64> {
    raw.trim()
        .parse::<i64>()
        .map_err(|_| Error::invalid(format!("{what} is not a valid 64-bit id: {raw:?}")).into())
}

fn game<T>(
    state: &AppState,
    run: impl FnOnce(&mut Game<'_>) -> dsa_core::Result<T>,
) -> CommandResult<T> {
    let mut guard = state.session();
    let session = guard.as_mut().ok_or(Error::NotOpen)?;
    let mut game = session.catalog_game(Catalog::shared());
    run(&mut game).map_err(Into::into)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CatalogInfo {
    items: usize,
    recipes: usize,
    titles: usize,
    categories: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    platform: String,
    data_dir: String,
    settings_path: String,
    suggested_roots: Vec<String>,
    catalog: CatalogInfo,
    stat_names: &'static [&'static str],
}

#[tauri::command]
fn app_info(app: tauri::AppHandle) -> CommandResult<AppInfo> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| CommandError::from(error.to_string()))?;
    let catalog = Catalog::shared();
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        platform: std::env::consts::OS.to_string(),
        data_dir: data_dir.to_string_lossy().to_string(),
        settings_path: data_dir.join("settings.json").to_string_lossy().to_string(),
        suggested_roots: dsa_core::save::suggest_roots()
            .into_iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect(),
        catalog: CatalogInfo {
            items: catalog.len(),
            recipes: catalog.recipes().len(),
            titles: catalog.titles().len(),
            categories: catalog.categories().len(),
        },
        stat_names: STAT_NAMES,
    })
}

#[tauri::command]
fn settings_get(state: State<'_, AppState>) -> Settings {
    state.settings().current().clone()
}

#[tauri::command]
fn settings_set(state: State<'_, AppState>, settings: Settings) -> CommandResult<Settings> {
    state.settings().replace(settings).map_err(Into::into)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanResult {
    /// Folders that were searched, whether they existed or not.
    roots: Vec<String>,
    slots: Vec<SlotInfo>,
}

#[tauri::command]
fn slots_scan(path: Option<String>) -> CommandResult<ScanResult> {
    let mut roots: Vec<PathBuf> = match path {
        Some(path) if !path.trim().is_empty() => vec![PathBuf::from(path)],
        _ => dsa_core::save::suggest_roots(),
    };
    if roots.is_empty() {
        roots = dsa_core::save::suggest_roots();
    }
    let mut slots: Vec<SlotInfo> = Vec::new();
    for root in &roots {
        if !root.exists() {
            continue;
        }
        for slot in dsa_core::save::discover(root)? {
            if !slots.iter().any(|known| known.path == slot.path) {
                slots.push(slot);
            }
        }
    }
    slots.sort_by(|left, right| {
        right
            .modified_ms
            .cmp(&left.modified_ms)
            .then_with(|| left.path.cmp(&right.path))
    });
    Ok(ScanResult {
        roots: roots
            .into_iter()
            .map(|root| root.to_string_lossy().to_string())
            .collect(),
        slots,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveHandle {
    path: String,
    account_id: String,
    slot: i64,
    user_id: i64,
    dirty: bool,
    /// Problems noticed at open, e.g. a journal the game left behind.
    warnings: Vec<String>,
}

fn handle(session: &SaveSession) -> SaveHandle {
    SaveHandle {
        path: session.path().to_string_lossy().to_string(),
        account_id: session.account_id(),
        slot: session.slot(),
        user_id: session.user_id(),
        dirty: session.dirty(),
        warnings: session.warnings().to_vec(),
    }
}

#[tauri::command]
fn save_open(state: State<'_, AppState>, path: String) -> CommandResult<SaveHandle> {
    let mut guard = state.session();
    guard.take();
    let session = SaveSession::open(path)?;
    let handle = handle(&session);
    *guard = Some(session);
    Ok(handle)
}

#[tauri::command]
fn save_current(state: State<'_, AppState>) -> Option<SaveHandle> {
    let guard = state.session();
    guard.as_ref().map(handle)
}

#[tauri::command]
fn save_close(state: State<'_, AppState>) {
    state.session().take();
}

#[tauri::command]
fn save_write(state: State<'_, AppState>) -> CommandResult<WriteReport> {
    let mut guard = state.session();
    let session = guard.as_mut().ok_or(Error::NotOpen)?;
    Ok(session.write()?)
}

#[tauri::command]
fn save_backup(state: State<'_, AppState>) -> CommandResult<String> {
    let mut guard = state.session();
    let session = guard.as_mut().ok_or(Error::NotOpen)?;
    Ok(session.backup_now()?)
}

// ------------------------------------------------------------------ gameplay

#[tauri::command]
fn overview_get(state: State<'_, AppState>) -> CommandResult<Overview> {
    game(&state, |game| game.overview())
}

#[tauri::command]
fn player_name_set(state: State<'_, AppState>, name: String) -> CommandResult<()> {
    game(&state, |game| game.set_player_name(&name))
}

#[tauri::command]
fn adventure_set(state: State<'_, AppState>, field: String, value: i64) -> CommandResult<()> {
    game(&state, |game| game.set_adventure(&field, value))
}

#[tauri::command]
fn currencies_get(state: State<'_, AppState>) -> CommandResult<Vec<Currency>> {
    game(&state, |game| game.currencies())
}

#[tauri::command]
fn currency_set(state: State<'_, AppState>, cid: i64, amount: i64) -> CommandResult<()> {
    game(&state, |game| game.set_currency(cid, amount))
}

#[tauri::command]
fn inventory_get(state: State<'_, AppState>) -> CommandResult<Vec<Stack>> {
    game(&state, |game| game.inventory())
}

#[tauri::command]
fn stack_set(
    state: State<'_, AppState>,
    kind: String,
    id: String,
    count: i64,
) -> CommandResult<()> {
    let id = instance_id(&id, "stack id")?;
    game(&state, |game| game.set_stack(&kind, id, count))
}

#[tauri::command]
fn stack_add(state: State<'_, AppState>, cid: i64, count: i64) -> CommandResult<()> {
    game(&state, |game| game.add_stackable(cid, count))
}

#[tauri::command]
fn stackable_catalog(state: State<'_, AppState>) -> CommandResult<Vec<dsa_core::Item>> {
    game(&state, |game| Ok(game.stackable_catalog()))
}

#[tauri::command]
fn stacks_fill(state: State<'_, AppState>, count: i64) -> CommandResult<()> {
    game(&state, |game| game.fill_stackables(count))
}

#[tauri::command]
fn characters_get(state: State<'_, AppState>) -> CommandResult<Vec<Character>> {
    game(&state, |game| game.characters())
}

#[tauri::command]
fn character_set(
    state: State<'_, AppState>,
    cid: i64,
    field: String,
    value: i64,
) -> CommandResult<()> {
    game(&state, |game| game.set_character(cid, &field, value))
}

#[tauri::command]
fn character_add(state: State<'_, AppState>, cid: i64) -> CommandResult<bool> {
    game(&state, |game| game.add_character(cid))
}

#[tauri::command]
fn character_remove(state: State<'_, AppState>, cid: i64) -> CommandResult<()> {
    game(&state, |game| game.remove_character(cid))
}

#[tauri::command]
fn characters_unlock_all(state: State<'_, AppState>) -> CommandResult<i64> {
    game(&state, |game| game.unlock_all_characters())
}

#[tauri::command]
fn character_catalog(state: State<'_, AppState>) -> CommandResult<Vec<CatalogEntry>> {
    game(&state, |game| game.character_catalog())
}

#[tauri::command]
fn skills_get(state: State<'_, AppState>, cid: i64) -> CommandResult<Vec<Skill>> {
    game(&state, |game| game.skills(cid))
}

#[tauri::command]
fn skill_set(
    state: State<'_, AppState>,
    cid: i64,
    type_value: i64,
    level: i64,
) -> CommandResult<()> {
    game(&state, |game| game.set_skill(cid, type_value, level))
}

#[tauri::command]
fn skill_remove(state: State<'_, AppState>, cid: i64, type_value: i64) -> CommandResult<()> {
    game(&state, |game| game.remove_skill(cid, type_value))
}

#[tauri::command]
fn teams_get(state: State<'_, AppState>) -> CommandResult<Vec<TeamPage>> {
    game(&state, |game| game.teams())
}

#[tauri::command]
fn team_slot_set(
    state: State<'_, AppState>,
    page_id: i64,
    slot: i64,
    cid: i64,
) -> CommandResult<()> {
    game(&state, |game| game.set_team_slot(page_id, slot, cid))
}

#[tauri::command]
fn loadout_get(state: State<'_, AppState>, cid: i64) -> CommandResult<Loadout> {
    game(&state, |game| game.loadout(cid))
}

#[tauri::command]
fn equipment_get(state: State<'_, AppState>) -> CommandResult<Vec<Equipment>> {
    game(&state, |game| game.equipment())
}

#[tauri::command]
fn equipment_set(
    state: State<'_, AppState>,
    dbid: String,
    field: String,
    value: i64,
) -> CommandResult<()> {
    let dbid = instance_id(&dbid, "equipment id")?;
    game(&state, |game| game.set_equipment(dbid, &field, value))
}

#[tauri::command]
fn equipment_gem_set(
    state: State<'_, AppState>,
    dbid: String,
    gem_dbid: String,
) -> CommandResult<()> {
    let dbid = instance_id(&dbid, "equipment id")?;
    let gem_dbid = instance_id(&gem_dbid, "gem id")?;
    game(&state, |game| game.set_equipment_gem(dbid, gem_dbid))
}

#[tauri::command]
fn gems_get(state: State<'_, AppState>) -> CommandResult<Vec<Gem>> {
    game(&state, |game| game.gems())
}

#[tauri::command]
fn gem_set(
    state: State<'_, AppState>,
    dbid: String,
    field: String,
    value: i64,
) -> CommandResult<()> {
    let dbid = instance_id(&dbid, "gem id")?;
    game(&state, |game| game.set_gem(dbid, &field, value))
}

#[tauri::command]
fn karma_get(state: State<'_, AppState>) -> CommandResult<Vec<Karma>> {
    game(&state, |game| game.karma())
}

#[tauri::command]
fn karma_set(
    state: State<'_, AppState>,
    dbid: String,
    field: String,
    value: i64,
) -> CommandResult<()> {
    let dbid = instance_id(&dbid, "karma id")?;
    game(&state, |game| game.set_karma(dbid, &field, value))
}

#[tauri::command]
fn karma_equip(state: State<'_, AppState>, character_cid: i64, dbid: String) -> CommandResult<()> {
    let dbid = instance_id(&dbid, "karma id")?;
    game(&state, |game| game.equip_karma(character_cid, dbid))
}

#[tauri::command]
fn costumes_get(state: State<'_, AppState>) -> CommandResult<Vec<Costume>> {
    game(&state, |game| game.costumes())
}

#[tauri::command]
fn costume_catalog(state: State<'_, AppState>) -> CommandResult<Vec<CatalogEntry>> {
    game(&state, |game| game.costume_catalog())
}

#[tauri::command]
fn costume_unlock(state: State<'_, AppState>, cid: i64) -> CommandResult<bool> {
    game(&state, |game| game.unlock_costume(cid))
}

#[tauri::command]
fn costume_equip(
    state: State<'_, AppState>,
    dbid: String,
    character_cid: i64,
) -> CommandResult<()> {
    let dbid = instance_id(&dbid, "costume id")?;
    game(&state, |game| game.equip_costume(dbid, character_cid))
}

#[tauri::command]
fn mounts_get(state: State<'_, AppState>) -> CommandResult<Vec<Vehicle>> {
    game(&state, |game| game.mounts())
}

#[tauri::command]
fn mount_catalog(state: State<'_, AppState>) -> CommandResult<Vec<CatalogEntry>> {
    game(&state, |game| game.mount_catalog())
}

#[tauri::command]
fn mount_unlock(state: State<'_, AppState>, cid: i64) -> CommandResult<bool> {
    game(&state, |game| game.unlock_mount(cid))
}

#[tauri::command]
fn mount_equip(state: State<'_, AppState>, character_cid: i64, dbid: String) -> CommandResult<()> {
    let dbid = instance_id(&dbid, "mount id")?;
    game(&state, |game| game.equip_mount(character_cid, dbid))
}

#[tauri::command]
fn titles_get(state: State<'_, AppState>) -> CommandResult<Vec<TitleEntry>> {
    game(&state, |game| game.titles())
}

#[tauri::command]
fn title_set(state: State<'_, AppState>, id: i64, unlocked: bool) -> CommandResult<()> {
    game(&state, |game| game.set_title_unlocked(id, unlocked))
}

#[tauri::command]
fn titles_unlock_all(state: State<'_, AppState>) -> CommandResult<i64> {
    game(&state, |game| game.unlock_all_titles())
}

#[tauri::command]
fn recipes_get(state: State<'_, AppState>) -> CommandResult<Vec<Recipe>> {
    game(&state, |game| game.recipes())
}

#[tauri::command]
fn recipe_set(state: State<'_, AppState>, key: i64, known: bool) -> CommandResult<()> {
    game(&state, |game| game.set_recipe_known(key, known))
}

#[tauri::command]
fn recipes_unlock_all(state: State<'_, AppState>) -> CommandResult<i64> {
    game(&state, |game| game.unlock_all_recipes())
}

// ---------------------------------------------------------------- raw tables

#[tauri::command]
fn raw_tables(state: State<'_, AppState>) -> CommandResult<Vec<RawTable>> {
    let guard = state.session();
    let session = guard.as_ref().ok_or(Error::NotOpen)?;
    Ok(session.raw_tables()?)
}

#[tauri::command]
fn raw_page(
    state: State<'_, AppState>,
    table: String,
    offset: i64,
    limit: i64,
    search: Option<String>,
) -> CommandResult<RawPage> {
    let guard = state.session();
    let session = guard.as_ref().ok_or(Error::NotOpen)?;
    Ok(session.raw_page(&table, offset, limit, search.as_deref())?)
}

#[tauri::command]
fn raw_update(
    state: State<'_, AppState>,
    table: String,
    rowid: String,
    column: String,
    value: RawValue,
    advanced: bool,
) -> CommandResult<()> {
    let rowid = instance_id(&rowid, "row id")?;
    let mut guard = state.session();
    let session = guard.as_mut().ok_or(Error::NotOpen)?;
    Ok(session.raw_update(&table, rowid, &column, &value, advanced)?)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let settings_path = app
                .path()
                .app_data_dir()
                .map(|directory| directory.join("settings.json"))
                .unwrap_or_else(|_| PathBuf::from("settings.json"));
            app.manage(AppState::new(SettingsStore::open(settings_path)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            settings_get,
            settings_set,
            slots_scan,
            save_open,
            save_current,
            save_close,
            save_write,
            save_backup,
            overview_get,
            player_name_set,
            adventure_set,
            currencies_get,
            currency_set,
            inventory_get,
            stack_set,
            stack_add,
            stackable_catalog,
            stacks_fill,
            characters_get,
            character_set,
            character_add,
            character_remove,
            characters_unlock_all,
            character_catalog,
            skills_get,
            skill_set,
            skill_remove,
            teams_get,
            team_slot_set,
            loadout_get,
            equipment_get,
            equipment_set,
            equipment_gem_set,
            gems_get,
            gem_set,
            karma_get,
            karma_set,
            karma_equip,
            costumes_get,
            costume_catalog,
            costume_unlock,
            costume_equip,
            mounts_get,
            mount_catalog,
            mount_unlock,
            mount_equip,
            titles_get,
            title_set,
            titles_unlock_all,
            recipes_get,
            recipe_set,
            recipes_unlock_all,
            raw_tables,
            raw_page,
            raw_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running DragonSword Save Editor");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn instance_ids_cross_the_ipc_boundary_exactly() {
        // Values above 2^53 that a JavaScript `Number` cannot represent.
        for id in [
            "73605708196654092",
            "70000000823123456",
            "9007199254740993",
            "0",
        ] {
            let parsed = instance_id(id, "id").expect("parse");
            assert_eq!(parsed.to_string(), id);
        }
    }

    #[test]
    fn instance_ids_reject_junk_and_fractions() {
        for raw in ["", "abc", "1.5", "1e9", " 12 34", "-"] {
            assert!(
                instance_id(raw, "id").is_err(),
                "{raw:?} should be rejected"
            );
        }
    }
}
