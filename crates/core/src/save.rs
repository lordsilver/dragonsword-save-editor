//! Opening, editing, and writing back a save database.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use sha2::{Digest, Sha256};
use walkdir::WalkDir;

use crate::catalog::Catalog;
use crate::consistency::{self, ConsistencyReport};
use crate::error::{Error, Result};
use crate::sqlcipher;

/// A save slot found on disk, without decrypting it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotInfo {
    pub path: String,
    pub account_id: String,
    pub slot: i64,
    /// Sibling `ScreenShot_<N>.png`, inlined as a data URL when present.
    pub screenshot: Option<String>,
    pub sav: Option<String>,
    pub modified_ms: i64,
    pub size: i64,
}

/// The result of writing an edited save.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteReport {
    pub backup: Option<String>,
    pub bytes: i64,
    pub path: String,
    /// Broken links after the write. A save may already have had them; the
    /// write only refuses links the edit introduced.
    pub consistency: ConsistencyReport,
}

/// The state of the save file on disk at a point in time. The digest is
/// authoritative; size and mtime only make an error message useful.
#[derive(Debug, Clone)]
struct DiskState {
    len: u64,
    modified_ms: i64,
    digest: [u8; 32],
}

impl DiskState {
    fn of(path: &Path, bytes: &[u8]) -> Self {
        let metadata = fs::metadata(path).ok();
        Self {
            len: bytes.len() as u64,
            modified_ms: metadata
                .and_then(|metadata| metadata.modified().ok())
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis() as i64)
                .unwrap_or(0),
            digest: Sha256::digest(bytes).into(),
        }
    }

    fn same_bytes(&self, other: &DiskState) -> bool {
        self.digest == other.digest
    }
}

/// Newest `USER_DB_VERSION` this build understands. A newer save is opened
/// read-only for inspection but never written: the game may have changed
/// column meanings, and the editor cannot know how to keep them intact.
const SUPPORTED_SCHEMA_VERSION: i64 = 2;

/// SQLite's own structural check. Returns `"ok"` or the first problem.
fn integrity_check(conn: &Connection) -> Result<String> {
    Ok(conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?)
}

fn schema_version(conn: &Connection) -> Result<i64> {
    let has_version: i64 = conn.query_row(
        "SELECT count(*) FROM pragma_table_info('tb_user') WHERE name='USER_DB_VERSION'",
        [],
        |row| row.get(0),
    )?;
    if has_version == 0 {
        return Ok(0);
    }
    Ok(conn
        .query_row("SELECT USER_DB_VERSION FROM tb_user LIMIT 1", [], |row| {
            row.get(0)
        })
        .optional()?
        .unwrap_or(0))
}

/// An open save. The encrypted file stays untouched until [`SaveSession::write`];
/// edits happen in a temporary plaintext SQLite database.
pub struct SaveSession {
    path: PathBuf,
    salt: [u8; 16],
    temp: PathBuf,
    conn: Option<Connection>,
    user_id: i64,
    dirty: bool,
    /// The file as it was when this session opened it.
    opened: DiskState,
    /// The file as this session last left it, if it has written yet.
    written: Option<DiskState>,
    warnings: Vec<String>,
    last_backup: Option<PathBuf>,
    /// Broken links as the save stood when this session opened it, or after the
    /// last successful write. Only issues beyond this baseline block a write.
    consistency: ConsistencyReport,
}

impl SaveSession {
    /// Decrypt `path` into a private temporary database and open it for editing.
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        if !path.is_file() {
            return Err(Error::Missing(path));
        }
        let encrypted = fs::read(&path)?;
        let opened = DiskState::of(&path, &encrypted);
        let mut warnings = sidecar_warnings(&path);
        let salt = sqlcipher::salt(&encrypted)?;
        let plain = sqlcipher::decrypt(&encrypted, sqlcipher::PASSPHRASE)?;
        if !plain.starts_with(b"SQLite format 3\0") {
            return Err(Error::Crypto(
                "decrypted save is not a SQLite database".into(),
            ));
        }

        let temp = temp_path();
        write_private(&temp, &plain)?;
        let result = (|| -> Result<(Connection, i64, ConsistencyReport, i64)> {
            let conn = Connection::open_with_flags(
                &temp,
                OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
            )?;
            conn.busy_timeout(Duration::from_secs(10))?;
            conn.execute_batch(
                "PRAGMA journal_mode=DELETE;
                 PRAGMA foreign_keys=OFF;
                 PRAGMA synchronous=FULL;
                 PRAGMA temp_store=MEMORY;",
            )?;
            let integrity = integrity_check(&conn)?;
            if integrity != "ok" {
                return Err(integrity_failure(&path, &integrity));
            }
            let has_user: Option<String> = conn
                .query_row(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='tb_user'",
                    [],
                    |row| row.get(0),
                )
                .optional()?;
            if has_user.is_none() {
                return Err(Error::Schema("save database has no tb_user table".into()));
            }
            let user_id: i64 =
                conn.query_row("SELECT USER_DBID FROM tb_user LIMIT 1", [], |row| {
                    row.get(0)
                })?;
            let consistency = consistency::check(&conn, user_id)?;
            let version = schema_version(&conn)?;
            Ok((conn, user_id, consistency, version))
        })();
        match result {
            Ok((conn, user_id, consistency, version)) => {
                if version > SUPPORTED_SCHEMA_VERSION {
                    warnings.push(format!(
                        "This save uses schema version {version}, but this editor supports up to \
                         {SUPPORTED_SCHEMA_VERSION}. It will open for inspection and refuse to write; \
                         update the editor before editing this slot."
                    ));
                }
                Ok(Self {
                    path,
                    salt,
                    temp,
                    conn: Some(conn),
                    user_id,
                    dirty: false,
                    opened,
                    written: None,
                    warnings,
                    last_backup: None,
                    consistency,
                })
            }
            Err(error) => {
                let _ = fs::remove_file(&temp);
                Err(error)
            }
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn user_id(&self) -> i64 {
        self.user_id
    }

    pub fn dirty(&self) -> bool {
        self.dirty
    }

    pub fn last_backup(&self) -> Option<&Path> {
        self.last_backup.as_deref()
    }

    /// Problems noticed at open that the UI should show before the first write.
    pub fn warnings(&self) -> &[String] {
        &self.warnings
    }

    /// Broken links as the save stood at open, or after the last write.
    pub fn consistency(&self) -> &ConsistencyReport {
        &self.consistency
    }

    pub fn account_id(&self) -> String {
        self.path
            .parent()
            .and_then(Path::file_name)
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default()
    }

    pub fn slot(&self) -> i64 {
        parse_slot(&self.path).map(|(_, slot)| slot).unwrap_or(0)
    }

    pub(crate) fn conn(&self) -> &Connection {
        self.conn.as_ref().expect("save connection is open")
    }

    pub(crate) fn touch(&mut self) {
        self.dirty = true;
    }

    pub fn catalog_game<'a>(&'a mut self, catalog: &'a Catalog) -> crate::domain::Game<'a> {
        crate::domain::Game::new(self, catalog)
    }

    /// Re-encrypt the edited database and atomically replace the save file.
    ///
    /// Refuses to write when the file on disk is no longer the one this session
    /// opened or last wrote, so a save made by the game after the editor opened
    /// cannot be overwritten silently. Also refuses while the game has left a
    /// hot journal or a WAL beside the save. The file on disk is copied to a
    /// timestamped `.bak` whenever it is not the editor's own last output.
    pub fn write(&mut self) -> Result<WriteReport> {
        // A journal or WAL means the game is mid-save. Replacing the main file
        // now would let SQLite replay the old journal onto the new database.
        if let Some(error) = blocking_sidecar(&self.path) {
            return Err(error);
        }
        let version = schema_version(self.conn())?;
        if version > SUPPORTED_SCHEMA_VERSION {
            return Err(Error::Schema(format!(
                "this save uses schema version {version}, but this editor supports up to \
                 {SUPPORTED_SCHEMA_VERSION}; the save was not written. Update the editor first."
            )));
        }

        let current = fs::read(&self.path)?;
        let disk = DiskState::of(&self.path, &current);
        let expected = self.written.as_ref().unwrap_or(&self.opened);
        if !disk.same_bytes(expected) {
            return Err(stale_error(self.written.is_some(), &disk, expected));
        }

        let _ = self
            .conn()
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        self.conn().cache_flush()?;

        // The edits must leave a logically sound database. Check before
        // encrypting so a corrupt result never reaches the save folder.
        let integrity = integrity_check(self.conn())?;
        if integrity != "ok" {
            return Err(Error::Schema(format!(
                "the edited database failed SQLite integrity_check, so the save was not written: {integrity}"
            )));
        }

        // A save may already contain broken links; only the ones this edit
        // introduces are refused. That lets a damaged save be repaired.
        let consistency = consistency::check(self.conn(), self.user_id)?;
        let introduced = consistency.new_since(&self.consistency);
        if !introduced.is_clean() {
            return Err(Error::Inconsistent(format!(
                "The save would introduce consistency problems: {}. Fix them or undo before writing.",
                introduced.details()
            )));
        }

        let plain = fs::read(&self.temp)?;
        let encrypted = sqlcipher::encrypt_verified(&plain, sqlcipher::PASSPHRASE, &self.salt)?;

        // Key derivation and encryption take long enough for the game to save
        // underneath us, so re-read the file before anything touches it.
        let latest = fs::read(&self.path)?;
        let latest_state = DiskState::of(&self.path, &latest);
        if !latest_state.same_bytes(&disk) {
            return Err(stale_error(self.written.is_some(), &latest_state, &disk));
        }
        if let Some(error) = blocking_sidecar(&self.path) {
            return Err(error);
        }

        // The editor's own last output needs no backup; anything else does.
        let backup = if self
            .written
            .as_ref()
            .is_some_and(|written| written.same_bytes(&latest_state))
        {
            None
        } else {
            let backup = self.make_backup(&latest)?;
            Some(backup.to_string_lossy().to_string())
        };

        atomic_write(&self.path, &encrypted)?;
        self.written = Some(DiskState::of(&self.path, &encrypted));
        self.dirty = false;
        self.consistency = consistency.clone();
        Ok(WriteReport {
            backup,
            bytes: encrypted.len() as i64,
            path: self.path.to_string_lossy().to_string(),
            consistency,
        })
    }

    /// Copy the current on-disk save to a timestamped backup, even if this
    /// session has not written yet.
    pub fn backup_now(&mut self) -> Result<String> {
        let original = fs::read(&self.path)?;
        let path = self.make_backup(&original)?;
        Ok(path.to_string_lossy().to_string())
    }

    fn make_backup(&mut self, bytes: &[u8]) -> Result<PathBuf> {
        let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
        let base = format!("{}.{stamp}.bak", self.path.display());
        let mut candidate = PathBuf::from(&base);
        let mut index = 1;
        while candidate.exists() {
            candidate = PathBuf::from(format!("{base}-{index}"));
            index += 1;
        }
        write_new(&candidate, bytes)?;
        self.last_backup = Some(candidate.clone());
        Ok(candidate)
    }

    /// Release the database and delete the plaintext temporary file.
    pub fn close(mut self) {
        self.cleanup();
    }

    fn cleanup(&mut self) {
        if let Some(conn) = self.conn.take() {
            drop(conn);
        }
        let _ = fs::remove_file(&self.temp);
        for suffix in ["-journal", "-wal", "-shm"] {
            let _ = fs::remove_file(sidecar(&self.temp, suffix));
        }
    }
}

impl Drop for SaveSession {
    fn drop(&mut self) {
        self.cleanup();
    }
}

fn stale_error(wrote_before: bool, disk: &DiskState, expected: &DiskState) -> Error {
    let when = chrono::DateTime::from_timestamp_millis(disk.modified_ms)
        .map(|time| {
            time.with_timezone(&chrono::Local)
                .format("%Y-%m-%d %H:%M:%S")
                .to_string()
        })
        .unwrap_or_else(|| "unknown time".into());
    Error::Stale(format!(
        "The save file changed on disk since this editor {} it \
         ({} bytes now, {} bytes then, last modified {when}). Reopen the save \
         to load the newer progress; writing now would overwrite it.",
        if wrote_before { "last wrote" } else { "opened" },
        disk.len,
        expected.len
    ))
}

/// A path beside the save, e.g. `1000_Slot5.db-journal`.
fn sidecar(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(suffix);
    PathBuf::from(name)
}

/// Explain a failed integrity check. A hot journal is the most likely reason a
/// half-finished game save is unreadable, so its recovery instructions take
/// precedence over SQLite's raw message.
fn integrity_failure(path: &Path, integrity: &str) -> Error {
    blocking_sidecar(path).unwrap_or_else(|| {
        Error::Schema(format!(
            "save database failed SQLite integrity_check: {integrity}"
        ))
    })
}

/// A journal or WAL that makes writing unsafe. A zero-length journal is not
/// hot, so it does not block a write; any WAL does.
fn blocking_sidecar(path: &Path) -> Option<Error> {
    let journal = sidecar(path, "-journal");
    if fs::metadata(&journal).is_ok_and(|meta| meta.is_file() && meta.len() > 0) {
        return Some(Error::Blocked(
            "The game stopped partway through saving this slot and left a rollback journal \
             beside it. Start the game, load this slot, quit normally so the game finishes \
             the save, then reopen the slot here. Writing now would corrupt the save."
                .into(),
        ));
    }
    let wal = sidecar(path, "-wal");
    if fs::metadata(&wal).is_ok_and(|meta| meta.is_file()) {
        return Some(Error::Blocked(
            "The game left a write-ahead log beside this save. Start the game, load this \
             slot, quit normally, then reopen the slot here. Writing now could lose the \
             newest progress."
                .into(),
        ));
    }
    None
}

/// Problems with the save folder that should be shown before the first write.
fn sidecar_warnings(path: &Path) -> Vec<String> {
    let mut warnings = Vec::new();
    let journal = sidecar(path, "-journal");
    if fs::metadata(&journal).is_ok_and(|meta| meta.is_file() && meta.len() > 0) {
        warnings.push(
            "The game stopped partway through saving this slot and left a rollback journal. \
             Start the game, load this slot, then quit normally so the game finishes the \
             save. The editor will not write until the journal is gone."
                .into(),
        );
    }
    let wal = sidecar(path, "-wal");
    if fs::metadata(&wal).is_ok_and(|meta| meta.is_file()) {
        warnings.push(
            "The game left a write-ahead log beside this save. Start the game, load this \
             slot, then quit normally. The editor will not write until the log is gone."
                .into(),
        );
    }
    warnings
}

fn temp_path() -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    std::env::temp_dir().join(format!("dsa-save-{}-{nanos}.db", std::process::id()))
}

/// Remove plaintext databases left behind by an editor process that is no
/// longer running. A live process keeps its own temp file; another live
/// process keeps its own too.
pub fn sweep_stale_temp_files() {
    let Ok(entries) = fs::read_dir(std::env::temp_dir()) else {
        return;
    };
    let current = std::process::id();
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        let Some(pid) = temp_owner_pid(name) else {
            continue;
        };
        if pid == current {
            continue;
        }
        #[cfg(unix)]
        let alive = process_alive(pid);
        // Windows has no dependency-free liveness probe. SQLite keeps its
        // database file open without FILE_SHARE_DELETE, so attempting the
        // delete is the probe: it fails for a live process and succeeds for a
        // stale file. Ignore the result either way.
        #[cfg(not(unix))]
        let alive = false;
        if alive {
            continue;
        }
        let _ = fs::remove_file(entry.path());
    }
}

fn temp_owner_pid(name: &str) -> Option<u32> {
    let rest = name.strip_prefix("dsa-save-")?;
    let (pid, suffix) = rest.split_once('-')?;
    if !suffix.ends_with(".db") {
        return None;
    }
    pid.parse().ok()
}

#[cfg(unix)]
fn process_alive(pid: u32) -> bool {
    std::process::Command::new("kill")
        .args(["-0", &pid.to_string()])
        .stderr(std::process::Stdio::null())
        .status()
        .map(|status| status.success())
        // If the check itself fails, keeping the file is safer than deleting it.
        .unwrap_or(true)
}

fn write_private(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}

fn write_new(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let directory = path.parent().unwrap_or_else(|| Path::new("."));
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let temporary = directory.join(format!(".dsa-write-{}-{nanos}", std::process::id()));
    write_private(&temporary, bytes)?;
    // Read back the exact bytes that are about to replace the save. The
    // encryption round-trip was verified in memory; this proves the file on
    // disk holds those same bytes before the rename.
    let written = fs::read(&temporary)?;
    if written != bytes {
        let _ = fs::remove_file(&temporary);
        return Err(Error::Crypto(
            "the temporary save did not read back byte-for-byte; the original was not replaced"
                .into(),
        ));
    }
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(error.into());
    }
    // Flush the directory entry where the platform supports it.
    #[cfg(unix)]
    if let Ok(directory) = File::open(directory) {
        let _ = directory.sync_all();
    }
    Ok(())
}

/// Parse `<account>_Slot<N>.db` into its account id and slot number.
pub fn parse_slot(path: &Path) -> Option<(String, i64)> {
    let name = path.file_name()?.to_str()?;
    let (account, rest) = name.split_once("_Slot")?;
    let slot = rest.strip_suffix(".db")?.parse::<i64>().ok()?;
    Some((account.to_string(), slot))
}

/// List save slots under a game folder (or a single `.db` file), newest first.
pub fn discover(root: impl AsRef<Path>) -> Result<Vec<SlotInfo>> {
    let root = root.as_ref();
    if !root.exists() {
        return Err(Error::Missing(root.to_path_buf()));
    }
    let mut files = Vec::new();
    if root.is_file() {
        if parse_slot(root).is_some() {
            files.push(root.to_path_buf());
        }
    } else {
        for entry in WalkDir::new(root)
            .max_depth(8)
            .follow_links(false)
            .into_iter()
            .filter_map(std::result::Result::ok)
        {
            let path = entry.path();
            if entry.file_type().is_file() && parse_slot(path).is_some() {
                files.push(path.to_path_buf());
            }
        }
    }

    let mut slots = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for path in files {
        let Ok(canonical) = fs::canonicalize(&path) else {
            continue;
        };
        if !seen.insert(canonical.clone()) {
            continue;
        }
        let Some((account_id, slot)) = parse_slot(&path) else {
            continue;
        };
        let metadata = match fs::metadata(&path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        let parent = path.parent().unwrap_or_else(|| Path::new("."));
        let screenshot_path = parent.join(format!("ScreenShot_{slot}.png"));
        let sav_path = parent.join(format!("SPack_Slot{slot}.sav"));
        let modified_ms = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as i64)
            .unwrap_or(0);
        slots.push(SlotInfo {
            path: path.to_string_lossy().to_string(),
            account_id,
            slot,
            screenshot: thumbnail_data_url(&screenshot_path),
            sav: sav_path
                .is_file()
                .then(|| sav_path.to_string_lossy().to_string()),
            modified_ms,
            size: metadata.len() as i64,
        });
    }
    slots.sort_by(|left, right| {
        right
            .modified_ms
            .cmp(&left.modified_ms)
            .then_with(|| left.path.cmp(&right.path))
    });
    Ok(slots)
}

/// Read a slot screenshot and inline it. The game names these `.png` but writes
/// JPEG data, so the MIME type is sniffed from the bytes.
pub fn thumbnail_data_url(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    let mime = if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        "image/jpeg"
    } else if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "image/png"
    } else if bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else {
        return None;
    };
    Some(format!("data:{mime};base64,{}", BASE64.encode(bytes)))
}

/// Likely install locations for the game, for the "scan automatically" action.
pub fn suggest_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if cfg!(windows) {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            let local = PathBuf::from(local);
            roots.push(local.join("DragonSword Awakening"));
            roots.push(local.join("DS"));
        }
        if let Some(profile) = std::env::var_os("USERPROFILE") {
            roots.push(
                PathBuf::from(profile)
                    .join("Documents")
                    .join("DragonSword Awakening"),
            );
        }
        for steam in [
            PathBuf::from(r"C:\Program Files (x86)\Steam"),
            PathBuf::from(r"C:\Program Files\Steam"),
        ] {
            roots.extend(steam_libraries(&steam));
        }
    } else if cfg!(target_os = "macos") {
        if let Some(home) = std::env::var_os("HOME") {
            let home = PathBuf::from(home);
            roots.push(
                home.join(
                    "Library/Application Support/Steam/steamapps/common/DragonSword Awakening",
                ),
            );
        }
    } else if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        for steam in [
            home.join(".local/share/Steam"),
            home.join(".steam/steam"),
            home.join(".var/app/com.valvesoftware.Steam/data/Steam"),
        ] {
            roots.extend(steam_libraries(&steam));
        }
        roots.push(home.join("Games/DragonSword Awakening"));
    }
    roots.retain(|path| path.is_dir());
    roots.sort();
    roots.dedup();
    roots
}

fn steam_libraries(steam: &Path) -> Vec<PathBuf> {
    let mut libraries = vec![steam.join("steamapps/common/DragonSword Awakening")];
    let vdf = steam.join("steamapps/libraryfolders.vdf");
    if let Ok(contents) = fs::read_to_string(vdf) {
        for line in contents.lines() {
            let line = line.trim();
            let Some(rest) = line.strip_prefix("\"path\"") else {
                continue;
            };
            let Some(value) = rest.trim().strip_prefix('"') else {
                continue;
            };
            let Some(end) = value.rfind('"') else {
                continue;
            };
            let path = value[..end].replace("\\\\", "\\");
            libraries.push(PathBuf::from(path).join("steamapps/common/DragonSword Awakening"));
        }
    }
    libraries
}

/// Whether a path looks like a save database (without decrypting it).
pub fn looks_like_save(path: &Path) -> bool {
    parse_slot(path).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_slot_names() {
        assert_eq!(
            parse_slot(Path::new("/saves/123456789/123456789_Slot3.db")),
            Some(("123456789".into(), 3))
        );
        assert_eq!(parse_slot(Path::new("/saves/123456789/notes.db")), None);
        assert_eq!(
            parse_slot(Path::new("/saves/123456789/123456789_SlotX.db")),
            None
        );
    }

    #[test]
    fn a_hot_journal_explains_an_integrity_failure() {
        let root = std::env::temp_dir().join(format!("dsa-integrity-{}", std::process::id()));
        fs::create_dir_all(&root).expect("mkdir");
        let path = root.join("1000_Slot1.db");
        fs::write(&path, b"x").expect("write");

        let plain = integrity_failure(&path, "database disk image is malformed");
        assert_eq!(plain.kind(), "schema");

        let journal = sidecar(&path, "-journal");
        fs::write(&journal, b"hot").expect("journal");
        let hot = integrity_failure(&path, "database disk image is malformed");
        assert_eq!(hot.kind(), "blocked");
        assert!(hot.to_string().contains("rollback journal"));

        fs::remove_file(&journal).expect("remove journal");
        let wal = sidecar(&path, "-wal");
        fs::write(&wal, b"").expect("wal");
        let wal = integrity_failure(&path, "database disk image is malformed");
        assert_eq!(wal.kind(), "blocked");
        assert!(wal.to_string().contains("write-ahead log"));

        let _ = fs::remove_dir_all(&root);
    }

    #[cfg(unix)]
    #[test]
    fn stale_plaintext_temps_are_swept_but_live_ones_remain() {
        let root = std::env::temp_dir();
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        let mut child = std::process::Command::new("true").spawn().expect("child");
        let dead_pid = child.id();
        child.wait().expect("wait");
        let dead = root.join(format!("dsa-save-{dead_pid}-{nanos}.db"));
        let live = root.join(format!("dsa-save-{}-{nanos}.db", std::process::id()));
        fs::write(&dead, b"dead").expect("dead temp");
        fs::write(&live, b"live").expect("live temp");

        sweep_stale_temp_files();

        assert!(!dead.exists(), "a dead process's plaintext is removed");
        assert!(live.exists(), "the running process's plaintext is kept");
        let _ = fs::remove_file(live);
    }

    #[test]
    fn discovers_and_sorts_slots() {
        let root = std::env::temp_dir().join(format!("dsa-discover-{}", std::process::id()));
        let account = root.join("123456789");
        fs::create_dir_all(&account).expect("mkdir");
        let first = account.join("123456789_Slot1.db");
        let second = account.join("123456789_Slot2.db");
        fs::write(&first, b"x").expect("write");
        fs::write(&second, b"x").expect("write");
        let slots = discover(&root).expect("discover");
        assert_eq!(slots.len(), 2);
        let _ = fs::remove_dir_all(&root);
    }
}
