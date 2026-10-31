//! Tauri shell around `dsa-core`: one open save at a time, typed commands for
//! every screen, and a tiny settings store.

mod settings;

use std::path::PathBuf;
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

use dsa_core::catalog::STAT_NAMES;
use dsa_core::domain::{
    CatalogEntry, Character, Costume, Currency, Equipment, Game, Gem, Karma, Loadout, Overview,
    Recipe, Skill, Stack, TeamPage, TitleEntry, Vehicle,
};
use dsa_core::raw::{RawPage, RawTable, RawValue};
use dsa_core::world::{PlaceKind, QuestEntry, WorldView};
use dsa_core::{Catalog, Error, SaveSession, SlotInfo, WriteReport};
use serde::Serialize;
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

use settings::{Settings, SettingsStore};

/// Two native close requests inside this window mean the UI is not responding
/// to the first one, so the Rust side offers a native escape hatch.
const CLOSE_FALLBACK: Duration = Duration::from_secs(3);

pub struct AppState {
    session: Mutex<Option<SaveSession>>,
    settings: Mutex<SettingsStore>,
    last_close: Mutex<Option<Instant>>,
}

impl AppState {
    fn new(settings: SettingsStore) -> Self {
        Self {
            session: Mutex::new(None),
            settings: Mutex::new(settings),
            last_close: Mutex::new(None),
        }
    }

    fn session(&self) -> std::sync::MutexGuard<'_, Option<SaveSession>> {
        self.session.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn settings(&self) -> std::sync::MutexGuard<'_, SettingsStore> {
        self.settings.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Record a close request and return true when it is a repeat inside the
    /// fallback window. A repeat clears the timer so a third request starts
    /// over instead of immediately forcing another dialog.
    fn repeat_close_request(&self) -> bool {
        let mut last = self
            .last_close
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let now = Instant::now();
        let repeated = last.is_some_and(|previous| now.duration_since(previous) <= CLOSE_FALLBACK);
        *last = if repeated { None } else { Some(now) };
        repeated
    }

    fn clear_close_request(&self) {
        *self
            .last_close
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = None;
    }
}

/// Show a native confirmation when the webview did not handle a repeat close
/// request. `close` drops the session and exits or destroys the window.
fn show_close_fallback(app: &tauri::AppHandle, dirty: bool, close: impl FnOnce() + Send + 'static) {
    let handle = app.clone();
    let message = if dirty {
        "The editor did not respond to the close request. Close without saving? Unsaved changes will be lost."
    } else {
        "The editor did not respond to the close request. Close it now?"
    };
    let mut dialog = app
        .dialog()
        .message(message)
        .title("Close DragonSword Save Editor?")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Close without saving".into(),
            "Keep editing".into(),
        ));
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.parent(&window);
    }
    dialog.show(move |confirmed| {
        if confirmed {
            handle.state::<AppState>().session().take();
            close();
        } else {
            handle.state::<AppState>().clear_close_request();
        }
    });
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

/// `None` when no save is open, otherwise the session's dirty flag.
///
/// The lock is released before the result is used, so emitting an event that
/// makes the UI call back into a save command cannot deadlock.
fn session_dirty(state: &AppState) -> Option<bool> {
    let guard = state.session();
    guard.as_ref().map(|session| session.dirty())
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

/// The game's own labels, inventory tabs and grade star, for the screens.
#[tauri::command]
fn game_ui() -> dsa_core::gamedata::GameUi {
    dsa_core::gamedata::game_ui()
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
    /// Broken cross-row links as the save stood at open.
    consistency: dsa_core::ConsistencyReport,
}

fn handle(session: &SaveSession) -> SaveHandle {
    SaveHandle {
        path: session.path().to_string_lossy().to_string(),
        account_id: session.account_id(),
        slot: session.slot(),
        user_id: session.user_id(),
        dirty: session.dirty(),
        warnings: session.warnings().to_vec(),
        consistency: session.consistency().clone(),
    }
}

#[tauri::command]
fn save_open(state: State<'_, AppState>, path: String) -> CommandResult<SaveHandle> {
    // Open the new session first. If that fails (the game is still running, a
    // journal is present, the file moved), the current session stays usable.
    let session = SaveSession::open(path)?;
    let handle = handle(&session);
    *state.session() = Some(session);
    Ok(handle)
}

#[tauri::command]
fn save_current(state: State<'_, AppState>) -> Option<SaveHandle> {
    let guard = state.session();
    guard.as_ref().map(handle)
}

#[tauri::command]
fn save_close(state: State<'_, AppState>) {
    state.clear_close_request();
    state.session().take();
}

/// The UI kept editing after a native close request, so the next request
/// should ask the UI again instead of opening the native fallback.
#[tauri::command]
fn close_request_cancelled(state: State<'_, AppState>) {
    state.clear_close_request();
}

/// Close the native window after the UI has saved or discarded.
///
/// The close guard refuses every native close while a session is open, so the
/// session must be dropped before `destroy`; otherwise the close would be
/// prevented again and the UI would be asked twice. Dropping the session also
/// removes its temporary plaintext database.
#[tauri::command]
fn window_close(state: State<'_, AppState>, window: tauri::Window) -> CommandResult<()> {
    state.clear_close_request();
    state.session().take();
    window.destroy().map_err(|error| error.to_string())?;
    Ok(())
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
fn quest_rewards_get(
    state: State<'_, AppState>,
) -> CommandResult<Vec<dsa_core::domain::QuestRewards>> {
    game(&state, |game| game.quest_rewards())
}

#[tauri::command]
fn quest_rewards_grant(
    state: State<'_, AppState>,
    quest_ids: Vec<i64>,
) -> CommandResult<dsa_core::domain::RewardGrant> {
    game(&state, |game| game.grant_quest_rewards(&quest_ids))
}

#[tauri::command]
fn heroes_recruitable(
    state: State<'_, AppState>,
) -> CommandResult<Vec<dsa_core::domain::HeroEntry>> {
    game(&state, |game| game.recruitable_heroes())
}

#[tauri::command]
fn hero_recruit(state: State<'_, AppState>, cid: i64) -> CommandResult<bool> {
    game(&state, |game| game.add_character(cid))
}

#[tauri::command]
fn quests_in_progress_get(
    state: State<'_, AppState>,
) -> CommandResult<Vec<dsa_core::domain::QuestRewards>> {
    game(&state, |game| game.quests_in_progress())
}

#[tauri::command]
fn quest_complete(
    state: State<'_, AppState>,
    quest_id: i64,
) -> CommandResult<dsa_core::domain::QuestCompletion> {
    game(&state, |game| game.complete_quest(quest_id))
}

#[tauri::command]
fn stackable_catalog(state: State<'_, AppState>) -> CommandResult<Vec<dsa_core::Item>> {
    game(&state, |game| Ok(game.stackable_catalog()))
}

#[tauri::command]
fn stacks_fill(state: State<'_, AppState>, count: i64) -> CommandResult<i64> {
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
fn character_remove(state: State<'_, AppState>, cid: i64) -> CommandResult<()> {
    game(&state, |game| game.remove_character(cid))
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
fn equipment_equip(
    state: State<'_, AppState>,
    character_cid: i64,
    part: String,
    dbid: String,
) -> CommandResult<()> {
    let dbid = instance_id(&dbid, "equipment id")?;
    game(&state, |game| game.equip_gear(character_cid, &part, dbid))
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

// --------------------------------------------------------------------- world

#[tauri::command]
fn world_get(state: State<'_, AppState>) -> CommandResult<WorldView> {
    game(&state, |game| game.world())
}

#[tauri::command]
fn world_places_set(
    state: State<'_, AppState>,
    kind: PlaceKind,
    ids: Vec<i64>,
    done: bool,
) -> CommandResult<i64> {
    game(&state, |game| game.set_world_places(kind, &ids, done))
}

#[tauri::command]
fn quest_log_get(state: State<'_, AppState>) -> CommandResult<Vec<QuestEntry>> {
    game(&state, |game| game.quest_log())
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
            dsa_core::save::sweep_stale_temp_files();
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
            game_ui,
            settings_get,
            settings_set,
            slots_scan,
            save_open,
            save_current,
            save_close,
            close_request_cancelled,
            window_close,
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
            quest_rewards_get,
            quest_rewards_grant,
            quests_in_progress_get,
            heroes_recruitable,
            hero_recruit,
            quest_complete,
            stackable_catalog,
            stacks_fill,
            characters_get,
            character_set,
            character_remove,
            skills_get,
            skill_set,
            skill_remove,
            teams_get,
            team_slot_set,
            loadout_get,
            equipment_get,
            equipment_set,
            equipment_gem_set,
            equipment_equip,
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
            world_get,
            world_places_set,
            quest_log_get,
            raw_tables,
            raw_page,
            raw_update
        ])
        .on_window_event(|window, event| {
            // The webview's `beforeunload` does not run for a native close.
            // Intercept it while a save is open and let the UI decide whether
            // to save, discard or stay. A clean save still goes through the UI
            // so a field that has not been committed yet is not lost.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.app_handle().state::<AppState>();
                if let Some(dirty) = session_dirty(state.inner()) {
                    api.prevent_close();
                    if state.inner().repeat_close_request() {
                        let app = window.app_handle().clone();
                        let window = window.clone();
                        show_close_fallback(&app, dirty, move || {
                            let _ = window.destroy();
                        });
                    } else {
                        let _ = window.emit("window-close-requested", dirty);
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building DragonSword Save Editor")
        .run(|app_handle, event| {
            // Quitting through the menu or Cmd+Q does not raise a window
            // close request. Ask the UI through the same event instead, but
            // only when there is a window to ask. Without one, let the app
            // exit instead of preventing every exit request forever.
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                let state = app_handle.state::<AppState>();
                let Some(dirty) = session_dirty(state.inner()) else {
                    return;
                };
                let Some(window) = app_handle.get_webview_window("main") else {
                    return;
                };
                api.prevent_exit();
                if state.inner().repeat_close_request() {
                    let handle = app_handle.clone();
                    show_close_fallback(app_handle, dirty, move || handle.exit(0));
                } else {
                    let _ = window.emit("window-close-requested", dirty);
                }
            }
        });
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
    fn a_second_close_request_is_the_fallback() {
        let state = AppState::new(SettingsStore::open(
            std::env::temp_dir().join("dsa-close-request-test.json"),
        ));
        assert!(
            !state.repeat_close_request(),
            "the first request asks the UI"
        );
        assert!(
            state.repeat_close_request(),
            "a repeat inside the window opens the native fallback"
        );
        assert!(
            !state.repeat_close_request(),
            "the fallback resets the timer instead of repeating forever"
        );
        state.clear_close_request();
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
