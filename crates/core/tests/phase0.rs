//! Phase 0 safety net: the stale-file guard, 64-bit ids, the raw editor's
//! rules, and the no-direct-recruit guard. Every test builds its own encrypted
//! save from a synthetic plaintext database, so nothing here depends on
//! personal saves.

use std::fs;
use std::path::{Path, PathBuf};

use dsa_core::SaveSession;
use dsa_core::catalog::Catalog;
use dsa_core::domain::Game;
use dsa_core::growth::{self, Growth};
use dsa_core::raw::RawValue;
use dsa_core::sqlcipher;
use rusqlite::Connection;

/// 2^56. `Number` cannot tell this apart from `BASE + 1`, so a value that goes
/// through a JavaScript number lands on the wrong row.
const BASE: i64 = 72_057_594_037_927_936;
const USER: i64 = 1000;
const SALT: [u8; 16] = [0x11; 16];

const SCHEMA: &str = "
CREATE TABLE tb_user (
  USER_DBID INTEGER NOT NULL,
  SKIP_CACHE INTEGER DEFAULT 0,
  USER_DB_VERSION INTEGER NOT NULL DEFAULT 0,
  TITLE_CID INTEGER NOT NULL DEFAULT 0,
  SELECTED_TEAM_PAGE_ID INTEGER NOT NULL DEFAULT 0,
  SELECTED_PAGE_SLOT_INDEX INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (USER_DBID)
);
CREATE TABLE tb_advent_status (
  USER_DBID INTEGER NOT NULL DEFAULT 0,
  ADV_GRADE INTEGER NOT NULL DEFAULT 0,
  ADV_LEVEL INTEGER NOT NULL DEFAULT 0,
  ADV_EXP INTEGER NOT NULL DEFAULT 0,
  NICK_NAME TEXT NOT NULL DEFAULT '',
  PLAY_TIME INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (USER_DBID)
);
CREATE TABLE tb_init_character (
  ACCOUNT_TYPE TEXT NOT NULL DEFAULT '',
  CHARACTER_CID INTEGER NOT NULL DEFAULT 0,
  LEVEL INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ACCOUNT_TYPE, CHARACTER_CID)
);
CREATE TABLE tb_character (
  USER_DBID INTEGER NOT NULL DEFAULT 0,
  CHARACTER_CID INTEGER NOT NULL DEFAULT 0,
  LEVEL INTEGER NOT NULL DEFAULT 1,
  EXP INTEGER NOT NULL DEFAULT 0,
  ASCEND INTEGER NOT NULL DEFAULT 1,
  HP INTEGER NOT NULL DEFAULT 0,
  TRANSCEND INTEGER NOT NULL DEFAULT 0,
  TRANSCEND_TOTAL INTEGER NOT NULL DEFAULT 0,
  SOLDIER_GRADE INTEGER NOT NULL DEFAULT 0,
  SOLDIER_GRADE_POINT INTEGER NOT NULL DEFAULT 0,
  CREATED_DATE INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (USER_DBID, CHARACTER_CID)
);
CREATE TABLE tb_equipment (
  ITEM_DBID INTEGER NOT NULL,
  USER_DBID INTEGER NOT NULL DEFAULT 0,
  ITEM_CID INTEGER NOT NULL DEFAULT 0,
  ENCHANT_LEVEL INTEGER NOT NULL DEFAULT 0,
  EXP INTEGER NOT NULL DEFAULT 0,
  IS_LOCK INTEGER NOT NULL DEFAULT 0,
  GEM_DBID INTEGER NOT NULL DEFAULT 0,
  MAIN_STAT_CID INTEGER NOT NULL DEFAULT 0,
  SUB_STAT_CID1 INTEGER NOT NULL DEFAULT 0,
  SUB_STAT_CID2 INTEGER NOT NULL DEFAULT 0,
  SUB_STAT_CID3 INTEGER NOT NULL DEFAULT 0,
  SUB_STAT_CID4 INTEGER NOT NULL DEFAULT 0,
  SUB_STAT_CID5 INTEGER NOT NULL DEFAULT 0,
  CREATED_DATE INTEGER NOT NULL DEFAULT 0,
  DELETED_DATE INTEGER NOT NULL DEFAULT 0,
  MAIN_STAT_VALUE INTEGER NOT NULL DEFAULT 0,
  SUB_STAT_VALUE1 INTEGER NOT NULL DEFAULT 0,
  SUB_STAT_VALUE2 INTEGER NOT NULL DEFAULT 0,
  SUB_STAT_VALUE3 INTEGER NOT NULL DEFAULT 0,
  SUB_STAT_VALUE4 INTEGER NOT NULL DEFAULT 0,
  SUB_STAT_VALUE5 INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ITEM_DBID)
);
CREATE TABLE tb_gem (
  USER_DBID INTEGER NOT NULL DEFAULT 0,
  ITEM_DBID INTEGER NOT NULL DEFAULT 0,
  ITEM_CID INTEGER NOT NULL DEFAULT 0,
  STAT_INFO_CID INTEGER NOT NULL DEFAULT 0,
  IS_LOCK INTEGER NOT NULL DEFAULT 0,
  CREATED_DATE INTEGER NOT NULL DEFAULT 0,
  DELETED_DATE INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (USER_DBID, ITEM_DBID)
);
CREATE TABLE tb_cook_item (
  USER_DBID INTEGER NOT NULL DEFAULT 0,
  ITEM_DBID INTEGER NOT NULL DEFAULT 0,
  ITEM_CID INTEGER NOT NULL DEFAULT 0,
  SPECIAL_BUFF_CID1 INTEGER NOT NULL DEFAULT 0,
  SPECIAL_BUFF_CID2 INTEGER NOT NULL DEFAULT 0,
  STACK_CNT INTEGER NOT NULL DEFAULT 0,
  CREATED_DATE INTEGER NOT NULL DEFAULT 0,
  DELETED_DATE INTEGER DEFAULT 0,
  PRIMARY KEY (USER_DBID, ITEM_DBID)
);
CREATE TABLE tb_stackable_item (
  USER_DBID INTEGER NOT NULL DEFAULT 0,
  ITEM_CID INTEGER NOT NULL DEFAULT 0,
  STACK_CNT INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (USER_DBID, ITEM_CID)
);
CREATE TABLE tb_currency (
  USER_DBID INTEGER NOT NULL DEFAULT 0,
  ITEM_CID INTEGER NOT NULL DEFAULT 0,
  AMOUNT INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (USER_DBID, ITEM_CID)
);
CREATE TABLE tb_team (
  USER_DBID INTEGER NOT NULL DEFAULT 0,
  PAGE_ID INTEGER NOT NULL DEFAULT 0,
  SLOT1_CHARACTER_CID INTEGER NOT NULL DEFAULT 0,
  SLOT2_CHARACTER_CID INTEGER NOT NULL DEFAULT 0,
  SLOT3_CHARACTER_CID INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (USER_DBID, PAGE_ID)
);
CREATE TABLE tb_title (
  USER_DBID INTEGER NOT NULL DEFAULT 0,
  CATEGORY INTEGER NOT NULL DEFAULT 0,
  BIT_FIELD INTEGER NOT NULL DEFAULT 0,
  FAV_BIT_FIELD INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (USER_DBID, CATEGORY)
);
CREATE TABLE tb_skill_growth (
  USER_DBID INTEGER NOT NULL DEFAULT 0,
  CHARACTER_CID INTEGER NOT NULL DEFAULT 0,
  TYPE_VALUE INTEGER NOT NULL DEFAULT 0,
  SLOT_LEVEL INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (USER_DBID, CHARACTER_CID, TYPE_VALUE)
);
CREATE TABLE tb_equip_mount (
  USER_DBID INTEGER NOT NULL DEFAULT 0,
  CHARACTER_CID INTEGER NOT NULL DEFAULT 0,
  KARMA INTEGER NOT NULL DEFAULT 0,
  VEHICLE INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (USER_DBID, CHARACTER_CID)
);
CREATE TABLE tb_quest_complete (
  USER_DBID INTEGER, QUEST_CID INTEGER, CATEGORY INTEGER,
  PRIMARY KEY (USER_DBID, QUEST_CID)
);
CREATE TABLE tb_quest_hold (
  USER_DBID INTEGER, QUEST_CID INTEGER, USE_TRACKING INTEGER,
  STEP_ID INTEGER, CNT INTEGER, FAILED_CNT INTEGER,
  PRIMARY KEY (USER_DBID, QUEST_CID)
);
CREATE TABLE tb_completed_quest (
  USER_DBID INTEGER, QUEST_CID INTEGER, CATEGORY INTEGER,
  PRIMARY KEY (USER_DBID, QUEST_CID)
);
CREATE TABLE tb_vehicle (
  VEHICLE_DBID INTEGER PRIMARY KEY, USER_DBID INTEGER,
  VEHICLE_CID INTEGER, CREATED_DATE INTEGER
);
CREATE TABLE tb_karma (
  ITEM_DBID INTEGER NOT NULL,
  USER_DBID INTEGER NOT NULL DEFAULT 0,
  ITEM_CID INTEGER NOT NULL DEFAULT 0,
  IS_LOCK INTEGER NOT NULL DEFAULT 0,
  EXP INTEGER NOT NULL DEFAULT 0,
  ASCEND INTEGER NOT NULL DEFAULT 0,
  TRANSCEND INTEGER NOT NULL DEFAULT 0,
  CREATED_DATE INTEGER NOT NULL DEFAULT 0,
  DELETED_DATE INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ITEM_DBID)
);
CREATE TABLE tb_costume (
  USER_DBID INTEGER NOT NULL DEFAULT 0,
  EQUIP_CHARACTER_CID INTEGER NOT NULL DEFAULT 0
);
";

/// SQLCipher keeps its IV and HMAC in the last 80 bytes of every page, so a
/// plaintext database has to reserve that space. SQLite only exposes the
/// setting through a C file control, so the fixture moves each page's cells
/// 80 bytes towards the front and records the reserve in the header.
fn reserve_tail(database: &mut [u8]) {
    const PAGE: usize = 4096;
    const RESERVE: usize = 80;
    assert!(database.len().is_multiple_of(PAGE));
    for (index, page) in database.as_chunks_mut::<PAGE>().0.iter_mut().enumerate() {
        let header = if index == 0 { 100 } else { 0 };
        let kind = page[header];
        let header_size = match kind {
            2 | 5 => 12,
            10 | 13 => 8,
            other => panic!("unexpected b-tree page type {other} on page {}", index + 1),
        };
        let cells = u16::from_be_bytes([page[header + 3], page[header + 4]]) as usize;
        let content = u16::from_be_bytes([page[header + 5], page[header + 6]]) as usize;
        let freeblock = u16::from_be_bytes([page[header + 1], page[header + 2]]) as usize;
        let pointers = header + header_size + cells * 2;
        assert!(
            content >= pointers + RESERVE,
            "page {} has only {} bytes of free space",
            index + 1,
            content.saturating_sub(pointers)
        );

        // Freeblocks move with the content, so their chain needs the same shift.
        let mut block = freeblock;
        while block != 0 {
            let next = u16::from_be_bytes([page[block], page[block + 1]]) as usize;
            if next != 0 {
                let moved = (next - RESERVE) as u16;
                page[block..block + 2].copy_from_slice(&moved.to_be_bytes());
            }
            block = next;
        }
        if freeblock != 0 {
            let moved = (freeblock - RESERVE) as u16;
            page[header + 1..header + 3].copy_from_slice(&moved.to_be_bytes());
        }

        for cell in 0..cells {
            let at = header + header_size + cell * 2;
            let offset = u16::from_be_bytes([page[at], page[at + 1]]) as usize;
            let moved = (offset - RESERVE) as u16;
            page[at..at + 2].copy_from_slice(&moved.to_be_bytes());
        }
        page.copy_within(content..PAGE, content - RESERVE);
        page[PAGE - RESERVE..].fill(0);
        let moved = (content - RESERVE) as u16;
        page[header + 5..header + 7].copy_from_slice(&moved.to_be_bytes());
        if index == 0 {
            page[20] = RESERVE as u8;
        }
    }
}

/// The id of the fixture's one karma row, a LEGENDARY karma (CID 1710501).
const KARMA: i64 = BASE + 100;

/// An encrypted fixture save. It derefs to the `.db` path, and dropping it
/// removes the fixture's directory.
struct Fixture {
    directory: PathBuf,
    path: PathBuf,
}

impl std::ops::Deref for Fixture {
    type Target = Path;

    fn deref(&self) -> &Path {
        &self.path
    }
}

impl AsRef<Path> for Fixture {
    fn as_ref(&self) -> &Path {
        &self.path
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.directory);
    }
}

/// Write a synthetic plaintext save, encrypt it, and return the `.db` path.
fn fixture(name: &str) -> Fixture {
    fixture_with(name, 100, 1, 0)
}

fn fixture_with_gold(name: &str, gold: i64) -> Fixture {
    fixture_with(name, gold, 1, 0)
}

fn fixture_with_grade(name: &str, grade: i64) -> Fixture {
    fixture_with(name, 100, grade, 0)
}

fn fixture_with_version(name: &str, version: i64) -> Fixture {
    fixture_with(name, 100, 1, version)
}

fn fixture_with(name: &str, gold: i64, grade: i64, version: i64) -> Fixture {
    let directory = std::env::temp_dir().join(format!("dsa-phase0-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&directory);
    fs::create_dir_all(&directory).expect("mkdir");

    let plain_path = directory.join("plain.db");
    {
        let conn = Connection::open(&plain_path).expect("open plaintext");
        conn.execute_batch("PRAGMA page_size=4096;")
            .expect("page size");
        conn.execute_batch(SCHEMA).expect("schema");
        conn.execute(
            "INSERT INTO tb_user (USER_DBID, SKIP_CACHE, USER_DB_VERSION, TITLE_CID)
             VALUES (?, NULL, ?, 2100000)",
            rusqlite::params![USER, version],
        )
        .expect("user");
        conn.execute(
            "INSERT INTO tb_advent_status
                (USER_DBID, ADV_GRADE, ADV_LEVEL, ADV_EXP, NICK_NAME, PLAY_TIME)
             VALUES (?, ?, 1, 0, '', 0)",
            rusqlite::params![USER, grade],
        )
        .expect("adventure status");
        conn.execute(
            "INSERT INTO tb_init_character (ACCOUNT_TYPE, CHARACTER_CID, LEVEL)
             VALUES ('NORMAL', 10001, 1)",
            [],
        )
        .expect("seed table");
        conn.execute(
            "INSERT INTO tb_character
                (USER_DBID, CHARACTER_CID, LEVEL, EXP, ASCEND, HP, TRANSCEND,
                 TRANSCEND_TOTAL, SOLDIER_GRADE, SOLDIER_GRADE_POINT, CREATED_DATE)
             VALUES (?, 10001, 1, 0, 1, 461, 0, 0, 0, 0, 0),
                    (?, 10002, 5, 0, 1, 900, 2, 0, 0, 0, 0),
                    (?, 10003, 3, 0, 1, 700, 0, 0, 0, 0, 0)",
            rusqlite::params![USER, USER, USER],
        )
        .expect("owned characters");
        conn.execute(
            "INSERT INTO tb_team
                (USER_DBID, PAGE_ID, SLOT1_CHARACTER_CID, SLOT2_CHARACTER_CID, SLOT3_CHARACTER_CID)
             VALUES (?, 0, 10001, 10002, 0), (?, 1, 10003, 10002, 0),
                    (?, 2, 10001, 10003, 10002)",
            rusqlite::params![USER, USER, USER],
        )
        .expect("teams");
        // Title 2100000 is unlocked and favorited, and selected in tb_user.
        // Title 2100001 is locked but favorited, so unlock-all can prove it
        // preserves favorites instead of clearing the field.
        conn.execute(
            "INSERT INTO tb_title (USER_DBID, CATEGORY, BIT_FIELD, FAV_BIT_FIELD)
             VALUES (?, 32812, ?, ?)",
            rusqlite::params![USER, 1i64 << 32, (1i64 << 32) | (1i64 << 33)],
        )
        .expect("titles");
        for offset in 0..3 {
            conn.execute(
                "INSERT INTO tb_equipment (ITEM_DBID, USER_DBID, ITEM_CID)
                 VALUES (?, ?, 5001)",
                rusqlite::params![BASE + offset, USER],
            )
            .expect("equipment");
            conn.execute(
                "INSERT INTO tb_cook_item (USER_DBID, ITEM_DBID, ITEM_CID, STACK_CNT)
                 VALUES (?, ?, 73605708196654092, 1)",
                rusqlite::params![USER, BASE + offset],
            )
            .expect("cook");
        }
        conn.execute(
            "INSERT INTO tb_stackable_item (USER_DBID, ITEM_CID, STACK_CNT) VALUES (?, 1420001, 10)",
            [USER],
        )
        .expect("stackable");
        let catalog = Catalog::shared();
        for (kind, count) in [
            ("COMMON", 7),
            ("QUEST", 1),
            ("MAP", 0),
            ("ACHIEVEMENT_POINT", 150),
            ("CHARACTER_MASTER_SOUL", 3),
            ("COOKING_INGREDIENT", 2),
            ("GEM_SOCKET_MATERIAL", 1),
            ("CHANGE_EQUIPMENT_SUB_STAT", 5),
            ("CHARACTER_EXP", 100),
        ] {
            let item = catalog
                .entries()
                .into_iter()
                .find(|item| item.kind == kind && item.category == "material")
                .unwrap_or_else(|| panic!("catalog has no {kind} material"));
            conn.execute(
                "INSERT INTO tb_stackable_item (USER_DBID, ITEM_CID, STACK_CNT) VALUES (?, ?, ?)",
                rusqlite::params![USER, item.cid, count],
            )
            .expect("typed stackable");
        }
        conn.execute(
            "INSERT INTO tb_currency (USER_DBID, ITEM_CID, AMOUNT) VALUES (?, 1000001, ?), (?, 1000002, 0)",
            rusqlite::params![USER, gold, USER],
        )
        .expect("currencies");
        conn.execute(
            "INSERT INTO tb_gem (USER_DBID, ITEM_DBID, ITEM_CID, STAT_INFO_CID, IS_LOCK, DELETED_DATE)
             VALUES (?, 70000008231234560, 1310405, 50401, 0, 0)",
            [USER],
        )
        .expect("gem");
        conn.execute(
            "INSERT INTO tb_karma (ITEM_DBID, USER_DBID, ITEM_CID, EXP, ASCEND, TRANSCEND)
             VALUES (?, ?, 1710501, 0, 0, 0)",
            rusqlite::params![KARMA, USER],
        )
        .expect("karma");
        // Quests 1, 4 and 9 are complete; 1 gives nothing.
        conn.execute(
            "INSERT INTO tb_quest_complete (USER_DBID, QUEST_CID, CATEGORY)
             VALUES (?, 10001, 1), (?, 10004, 1), (?, 10009, 1)",
            rusqlite::params![USER, USER, USER],
        )
        .expect("quests");
        // In progress: quest 5 (a hero joins), quest 10 and the Novice exam.
        conn.execute(
            "INSERT INTO tb_quest_hold (USER_DBID, QUEST_CID, USE_TRACKING, STEP_ID, CNT, FAILED_CNT)
             VALUES (?1, 10005, 0, 1, 0, 0), (?1, 10010, 0, 1, 0, 0), (?1, 40001, 0, 1, 0, 0)",
            [USER],
        )
        .expect("quests in progress");
        conn.execute_batch("PRAGMA journal_mode=DELETE;")
            .expect("journal");
    }

    let mut plain = fs::read(&plain_path).expect("read plaintext");
    reserve_tail(&mut plain);

    // The rewritten pages must still be a database SQLite accepts.
    let check_path = directory.join("check.db");
    fs::write(&check_path, &plain).expect("write check copy");
    {
        let conn = Connection::open(&check_path).expect("open check copy");
        let result: String = conn
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .expect("integrity check");
        assert_eq!(result, "ok", "fixture pages are malformed");
    }

    let encrypted = sqlcipher::encrypt(&plain, sqlcipher::PASSPHRASE, &SALT).expect("encrypt");
    let path = directory.join("1000_Slot1.db");
    fs::write(&path, encrypted).expect("write save");
    Fixture { directory, path }
}

fn integer(value: &RawValue) -> i64 {
    match value {
        RawValue::Integer(text) => text.parse().expect("integer"),
        other => panic!("expected an integer, got {other:?}"),
    }
}

fn column_index(page: &dsa_core::raw::RawPage, name: &str) -> usize {
    page.columns
        .iter()
        .position(|column| column.name == name)
        .expect("column")
}

fn equipment_value(session: &SaveSession, dbid: i64, column: &str) -> RawValue {
    let page = session
        .raw_page("tb_equipment", 0, 100, None)
        .expect("equipment page");
    let index = column_index(&page, column);
    let row = page
        .rows
        .iter()
        .find(|row| row.rowid == dbid.to_string())
        .expect("equipment row");
    row.cells[index].clone()
}

fn equipment_enchant(session: &SaveSession, dbid: i64) -> i64 {
    integer(&equipment_value(session, dbid, "ENCHANT_LEVEL"))
}

fn cook_count(session: &SaveSession, dbid: i64) -> i64 {
    let page = session
        .raw_page("tb_cook_item", 0, 100, None)
        .expect("cook page");
    let id = column_index(&page, "ITEM_DBID");
    let count = column_index(&page, "STACK_CNT");
    let row = page
        .rows
        .iter()
        .find(|row| integer(&row.cells[id]) == dbid)
        .expect("cook row");
    integer(&row.cells[count])
}

fn fillable_kind(kind: &str) -> bool {
    matches!(
        kind,
        "COMMON" | "COOKING_INGREDIENT" | "GEM_SOCKET_MATERIAL" | "CHANGE_EQUIPMENT_SUB_STAT"
    ) || kind.ends_with("_EXP")
}

#[test]
fn a_save_the_game_touched_after_open_is_never_overwritten() {
    let path = fixture("stale");
    let mut session = SaveSession::open(&path).expect("open");

    {
        let mut game = Game::new(&mut session, Catalog::shared());
        game.set_stack("cook", BASE, 5).expect("edit");
    }

    // The game writes new progress while the editor is still open.
    let mut newer = fs::read(&path).expect("read");
    newer.extend_from_slice(b"the game saved here");
    fs::write(&path, &newer).expect("simulate game save");

    let error = session.write().expect_err("write must be refused");
    assert_eq!(error.kind(), "stale");
    assert!(
        error.to_string().contains("changed on disk"),
        "message should explain the refusal: {error}"
    );
    assert_eq!(
        fs::read(&path).expect("read"),
        newer,
        "the game's newer save must be byte-for-byte untouched"
    );
}

#[test]
fn only_the_editors_own_last_output_skips_the_backup() {
    let path = fixture("backup");
    let mut session = SaveSession::open(&path).expect("open");

    {
        let mut game = Game::new(&mut session, Catalog::shared());
        game.set_stack("cook", BASE, 2).expect("first edit");
    }
    let first = session.write().expect("first write");
    assert!(first.backup.is_some(), "the game's file is backed up");

    {
        let mut game = Game::new(&mut session, Catalog::shared());
        game.set_stack("cook", BASE, 3).expect("second edit");
    }
    let second = session.write().expect("second write");
    assert!(
        second.backup.is_none(),
        "the editor's own output needs no second backup"
    );

    let reopened = SaveSession::open(&path).expect("reopen");
    assert_eq!(cook_count(&reopened, BASE), 3);
}

#[test]
fn a_leftover_journal_or_wal_blocks_the_write() {
    let path = fixture("sidecars");
    let mut session = SaveSession::open(&path).expect("open");
    let journal = PathBuf::from(format!("{}-journal", path.display()));
    let wal = PathBuf::from(format!("{}-wal", path.display()));

    // An empty journal is not hot and does not block a write.
    {
        let mut game = Game::new(&mut session, Catalog::shared());
        game.set_stack("cook", BASE, 2).expect("edit");
    }
    fs::write(&journal, b"").expect("empty journal");
    session.write().expect("an empty journal is harmless");
    fs::remove_file(&journal).expect("remove journal");

    // A non-empty journal means the game stopped partway through a save.
    {
        let mut game = Game::new(&mut session, Catalog::shared());
        game.set_stack("cook", BASE, 3).expect("edit");
    }
    fs::write(&journal, b"hot journal").expect("hot journal");
    let before = fs::read(&path).expect("read");
    let error = session
        .write()
        .expect_err("a hot journal must block the write");
    assert_eq!(error.kind(), "blocked");
    assert_eq!(
        fs::read(&path).expect("read"),
        before,
        "a blocked write must leave the save untouched"
    );
    fs::remove_file(&journal).expect("remove journal");
    session.write().expect("write after the journal is gone");

    // Any WAL blocks, even an empty one.
    {
        let mut game = Game::new(&mut session, Catalog::shared());
        game.set_stack("cook", BASE, 4).expect("edit");
    }
    fs::write(&wal, b"").expect("wal");
    let error = session.write().expect_err("a wal must block the write");
    assert_eq!(error.kind(), "blocked");
    fs::remove_file(&wal).expect("remove wal");
    session.write().expect("write after the wal is gone");
}

#[test]
fn ids_above_2_pow_53_address_exactly_one_row() {
    let path = fixture("dense-ids");
    let mut session = SaveSession::open(&path).expect("open");

    {
        let mut game = Game::new(&mut session, Catalog::shared());
        game.set_equipment(BASE + 1, "enchantLevel", 7)
            .expect("enchant");
        game.set_equipment_gem(BASE + 2, 70_000_008_231_234_560)
            .expect("gem link");
        game.set_stack("cook", BASE + 2, 9).expect("cook count");
    }

    assert_eq!(equipment_enchant(&session, BASE), 0);
    assert_eq!(equipment_enchant(&session, BASE + 1), 7);
    assert_eq!(equipment_enchant(&session, BASE + 2), 0);

    assert_eq!(
        integer(&equipment_value(&session, BASE + 2, "GEM_DBID")),
        70_000_008_231_234_560
    );

    assert_eq!(cook_count(&session, BASE), 1);
    assert_eq!(cook_count(&session, BASE + 1), 1);
    assert_eq!(cook_count(&session, BASE + 2), 9);

    // The raw editor takes the rowid as a string and parses it exactly.
    let rowid: i64 = (BASE + 1).to_string().parse().expect("rowid");
    session
        .raw_update(
            "tb_equipment",
            rowid,
            "EXP",
            &RawValue::Integer("424242".into()),
            false,
        )
        .expect("raw update");
    assert_eq!(integer(&equipment_value(&session, BASE + 1, "EXP")), 424242);
}

#[test]
fn raw_editor_keeps_keys_and_types_locked() {
    let path = fixture("raw-rules");
    let mut session = SaveSession::open(&path).expect("open");
    let rowid = BASE + 1;

    // Ordinary values are editable without advanced mode.
    session
        .raw_update(
            "tb_equipment",
            rowid,
            "ENCHANT_LEVEL",
            &RawValue::Integer("3".into()),
            false,
        )
        .expect("ordinary column");

    // Keys and link columns need the explicit advanced switch.
    assert!(
        session
            .raw_update(
                "tb_equipment",
                rowid,
                "ITEM_DBID",
                &RawValue::Integer((BASE + 10).to_string()),
                false,
            )
            .is_err()
    );
    assert!(
        session
            .raw_update(
                "tb_equipment",
                rowid,
                "GEM_DBID",
                &RawValue::Integer("1".into()),
                false,
            )
            .is_err()
    );
    session
        .raw_update(
            "tb_equipment",
            rowid,
            "GEM_DBID",
            &RawValue::Integer("1".into()),
            true,
        )
        .expect("advanced mode unlocks link columns");

    // The account column stays protected even in advanced mode.
    assert!(
        session
            .raw_update(
                "tb_equipment",
                rowid,
                "USER_DBID",
                &RawValue::Integer("1".into()),
                true,
            )
            .is_err()
    );

    // Values must match the declared type, and NULL only where allowed.
    assert!(
        session
            .raw_update(
                "tb_equipment",
                rowid,
                "ENCHANT_LEVEL",
                &RawValue::Text("seven".into()),
                false,
            )
            .is_err()
    );
    assert!(
        session
            .raw_update(
                "tb_equipment",
                rowid,
                "ENCHANT_LEVEL",
                &RawValue::Null,
                false,
            )
            .is_err()
    );
    session
        .raw_update("tb_user", USER, "SKIP_CACHE", &RawValue::Null, false)
        .expect("nullable column accepts NULL");

    // The active-team pointers are link columns too.
    for column in ["SELECTED_TEAM_PAGE_ID", "SELECTED_PAGE_SLOT_INDEX"] {
        assert!(
            session
                .raw_update(
                    "tb_user",
                    USER,
                    column,
                    &RawValue::Integer("1".into()),
                    false,
                )
                .is_err(),
            "{column} should need advanced editing"
        );
    }
    session
        .raw_update(
            "tb_user",
            USER,
            "SELECTED_TEAM_PAGE_ID",
            &RawValue::Integer("1".into()),
            true,
        )
        .expect("advanced editing unlocks the team pointer");

    // Seed tables are browsable but never writable.
    let seed = session
        .raw_page("tb_init_character", 0, 10, None)
        .expect("seed page");
    assert!(seed.read_only);
    assert!(
        session
            .raw_update(
                "tb_init_character",
                1,
                "LEVEL",
                &RawValue::Integer("99".into()),
                true,
            )
            .is_err()
    );

    // SQLite's own tables are not part of the browser at all.
    assert!(session.raw_page("sqlite_master", 0, 10, None).is_err());
    assert!(
        session
            .raw_update("sqlite_master", 1, "sql", &RawValue::Text("x".into()), true,)
            .is_err()
    );
}

#[test]
fn the_editor_refuses_to_insert_character_rows() {
    let path = fixture("recruit");
    let mut session = SaveSession::open(&path).expect("open");
    let mut game = Game::new(&mut session, Catalog::shared());
    let before = game.characters().expect("characters").len();

    // NORMAL starters, MASTER developer rows, character items, skins, and an
    // unknown 10xxx id all fail: tb_init_character is a new-account seed, not
    // the list of characters a save owns. The supported route is the game's
    // shop after adding Fate's Invitation.
    for cid in [
        10_001, 10_002, 10_015, 10_019, 10_033, 10_099, 1_110_001, 9_990_002,
    ] {
        let error = game
            .add_character(cid)
            .expect_err("direct recruiting is off");
        assert_eq!(error.kind(), "invalid");
    }
    assert!(game.unlock_all_characters().is_err());
    assert_eq!(
        game.characters().expect("characters").len(),
        before,
        "direct recruiting added nothing"
    );
}

fn character(game: &Game<'_>, cid: i64) -> dsa_core::domain::Character {
    game.characters()
        .expect("characters")
        .into_iter()
        .find(|character| character.cid == cid)
        .expect("character")
}

fn karma(game: &Game<'_>) -> dsa_core::domain::Karma {
    game.karma()
        .expect("karma")
        .into_iter()
        .find(|karma| karma.dbid == KARMA.to_string())
        .expect("karma row")
}

fn hero_start(level: i64) -> i64 {
    growth::start_exp(Growth::shared().hero_exp(), level).expect("hero level")
}

fn karma_start(level: i64) -> i64 {
    growth::start_exp(Growth::shared().karma_exp(1_710_501), level).expect("karma level")
}

#[test]
fn every_breakthrough_stage_has_its_own_caps() {
    // The editor applies the Korean live limits, which the offline release's
    // level cap of 70 matches: breakthrough 5, grade 6, active skills to 10.
    let cases = [
        (0, 20, 3, 3),
        (1, 30, 5, 5),
        (2, 40, 7, 7),
        (3, 50, 9, 7),
        (4, 60, 10, 7),
        (5, 70, 10, 7),
    ];
    let path = fixture_with_grade("limits-stages", 6);
    let mut session = SaveSession::open(&path).expect("open");
    let mut game = Game::new(&mut session, Catalog::shared());
    assert_eq!(game.max_ascend().expect("max ascend"), 5);

    for (stage, level, active, basic) in cases {
        game.set_character(10_001, "ascend", stage).expect("ascend");
        let limits = character(&game, 10_001).limits;
        assert_eq!(limits.stage, stage);
        assert_eq!(limits.level, level);
        assert_eq!(limits.ascend, 5);
        assert_eq!(limits.transcend, 6);
        assert_eq!(limits.skill_low, active);
        assert_eq!(limits.skill_mid, basic);
        assert_eq!(limits.skill_special, 1);

        // One level below the cap, EXP may run up to the next level's start.
        game.set_character(10_001, "level", level - 1)
            .expect("level below the cap");
        let hero = character(&game, 10_001);
        assert_eq!(
            hero.exp,
            hero_start(level - 1),
            "a level edit writes its start EXP"
        );
        assert_eq!(
            (hero.limits.exp_min, hero.limits.exp),
            (hero_start(level - 1), hero_start(level) - 1)
        );
        game.set_character(10_001, "exp", hero_start(level) - 1)
            .expect("top of the level");
        assert!(
            game.set_character(10_001, "exp", hero_start(level))
                .is_err()
        );
        assert!(
            game.set_character(10_001, "exp", hero_start(level - 1) - 1)
                .is_err()
        );

        // At the cap, EXP sits at the level's start.
        game.set_character(10_001, "level", level)
            .expect("character level");
        assert!(game.set_character(10_001, "level", level + 1).is_err());
        assert_eq!(character(&game, 10_001).exp, hero_start(level));
        assert!(
            game.set_character(10_001, "exp", hero_start(level) + 1)
                .is_err()
        );

        game.set_skill(10_001, 1, active).expect("active skill");
        assert!(game.set_skill(10_001, 1, active + 1).is_err());
        game.set_skill(10_001, 5, basic).expect("basic skill");
        assert!(game.set_skill(10_001, 5, basic + 1).is_err());
        game.set_skill(10_001, 801, 1).expect("special skill");
        assert!(game.set_skill(10_001, 801, 2).is_err());

        game.set_karma(KARMA, "ascend", stage)
            .expect("karma ascend");
        let karma_row = karma(&game);
        assert_eq!(
            (karma_row.limits.stage, karma_row.limits.exp),
            (stage, karma_start(level))
        );
        game.set_karma(KARMA, "exp", karma_start(level))
            .expect("karma exp");
        assert_eq!(karma(&game).level, level);
        assert!(
            game.set_karma(KARMA, "exp", karma_start(level) + 1)
                .is_err()
        );
    }
    game.set_character(10_001, "transcend", 6)
        .expect("character transcend");
    assert!(game.set_character(10_001, "transcend", 7).is_err());
    assert!(
        game.set_character(10_001, "ascend", 6).is_err(),
        "the game stops at breakthrough 5"
    );
    assert!(game.set_skill(10_099, 1, 1).is_err(), "unowned character");
}

#[test]
fn growth_caps_follow_each_rows_own_breakthrough() {
    let path = fixture_with_grade("limits-per-row", 3);
    let mut session = SaveSession::open(&path).expect("open");
    let mut game = Game::new(&mut session, Catalog::shared());
    assert_eq!(game.max_ascend().expect("max ascend"), 2);

    // Two heroes on the same grade-3 save get different caps.
    game.set_character(10_001, "ascend", 0).expect("ascend 0");
    game.set_character(10_002, "ascend", 2).expect("ascend 2");
    let low = character(&game, 10_001).limits;
    let high = character(&game, 10_002).limits;
    assert_eq!((low.stage, low.level, low.skill_low), (0, 20, 3));
    assert_eq!((high.stage, high.level, high.skill_low), (2, 40, 7));
    assert!(game.set_character(10_001, "level", 21).is_err());
    assert!(game.set_skill(10_001, 1, 4).is_err());

    // Raising the hero's own breakthrough raises its caps.
    game.set_character(10_001, "ascend", 2).expect("ascend 2");
    let raised = character(&game, 10_001).limits;
    assert_eq!(
        (raised.level, raised.skill_low, raised.skill_mid),
        (40, 7, 7)
    );
    assert!(
        game.set_character(10_001, "ascend", 3).is_err(),
        "grade 3 unlocks breakthroughs 0–2 only"
    );

    // A breakthrough cannot drop below what the level needs.
    game.set_character(10_001, "level", 35).expect("level 35");
    let error = game
        .set_character(10_001, "ascend", 0)
        .expect_err("level 35 needs breakthrough 2");
    assert!(error.to_string().contains("lower the level first"));
    assert!(game.set_character(10_001, "ascend", 1).is_err());
    game.set_character(10_001, "level", 20)
        .expect("lower the level");
    game.set_character(10_001, "ascend", 0)
        .expect("then the breakthrough");
    assert!(
        game.set_character(10_001, "level", 0).is_err(),
        "level starts at 1"
    );

    // Karma follows the same rules, with its level coming from its EXP.
    let limits = karma(&game).limits;
    assert_eq!(
        (limits.stage, limits.exp, limits.ascend),
        (0, karma_start(20), 2)
    );
    assert!(game.set_karma(KARMA, "exp", karma_start(20) + 1).is_err());
    game.set_karma(KARMA, "ascend", 2).expect("karma ascend 2");
    assert_eq!(karma(&game).limits.exp, karma_start(40));
    assert!(game.set_karma(KARMA, "ascend", 3).is_err());
    game.set_karma(KARMA, "exp", karma_start(35))
        .expect("karma exp");
    assert_eq!(karma(&game).level, 35);
    let error = game
        .set_karma(KARMA, "ascend", 0)
        .expect_err("karma level 35 needs breakthrough 2");
    assert!(error.to_string().contains("lower the EXP first"));
    game.set_karma(KARMA, "exp", 0).expect("lower the EXP");
    game.set_karma(KARMA, "ascend", 0)
        .expect("then the breakthrough");
}

fn stack_count(game: &Game<'_>, cid: i64) -> i64 {
    game.inventory()
        .expect("inventory")
        .into_iter()
        .find(|stack| stack.kind == "stackable" && stack.item.cid == cid)
        .map_or(0, |stack| stack.count)
}

fn gold(game: &Game<'_>) -> i64 {
    game.currencies()
        .expect("currencies")
        .into_iter()
        .find(|currency| currency.item.cid == 1_000_001)
        .map_or(0, |currency| currency.amount)
}

#[test]
fn completed_quests_hand_out_their_missed_rewards() {
    let path = fixture("quest-rewards");
    let mut session = SaveSession::open(&path).expect("open");
    let mut game = Game::new(&mut session, Catalog::shared());

    let rewards = game.quest_rewards().expect("rewards");
    let ids: Vec<i64> = rewards.iter().map(|reward| reward.quest_id).collect();
    assert_eq!(ids, [10_004, 10_009], "quest 1 gives nothing");

    // A quest the save has not completed is refused before anything changes.
    assert!(game.grant_quest_rewards(&[10_009, 10_010]).is_err());
    assert_eq!(gold(&game), 100);

    // Quest 9: 2,500 gold, 400 corps EXP, Basic Combat Text ×20, Mana Shard
    // ×10, a mount, the hero item Johnny and a Fate's Invitation.
    let before = [1_410_002, 1_410_202, 1_000_500].map(|cid| stack_count(&game, cid));
    let grant = game.grant_quest_rewards(&[10_009, 10_009]).expect("grant");
    assert_eq!(gold(&game), 2_600, "a repeated id counts once");
    assert_eq!(stack_count(&game, 1_410_002), before[0] + 20);
    assert_eq!(stack_count(&game, 1_410_202), before[1] + 10);
    assert_eq!(stack_count(&game, 1_000_500), before[2] + 1);
    let mounts = game.mounts().expect("mounts");
    assert!(mounts.iter().any(|mount| mount.cid == 1_320_016));
    assert_eq!(grant.adv_exp_not_granted, 400);
    let skipped: Vec<i64> = grant
        .not_granted
        .iter()
        .map(|entry| entry.item.cid)
        .collect();
    assert_eq!(skipped, [1_110_601], "the hero item is not granted");
    assert_eq!(game.characters().expect("characters").len(), 3);

    // Granting again adds again; the mount is not duplicated.
    game.grant_quest_rewards(&[10_004, 10_009])
        .expect("grant again");
    assert_eq!(stack_count(&game, 1_000_500), before[2] + 3);
    let wolves = game
        .mounts()
        .expect("mounts")
        .into_iter()
        .filter(|mount| mount.cid == 1_320_016)
        .count();
    assert_eq!(wolves, 1);
}

fn quest_rows(session: &SaveSession, table: &str) -> Vec<i64> {
    let page = session.raw_page(table, 0, 500, None).expect("quest page");
    let column = column_index(&page, "QUEST_CID");
    let mut ids: Vec<i64> = page
        .rows
        .iter()
        .map(|row| integer(&row.cells[column]))
        .collect();
    ids.sort_unstable();
    ids
}

#[test]
fn completing_a_quest_records_it_and_hands_out_its_rewards() {
    let path = fixture("quest-complete");
    let mut session = SaveSession::open(&path).expect("open");
    {
        let mut game = Game::new(&mut session, Catalog::shared());
        let in_progress = game.quests_in_progress().expect("in progress");
        let blocked: Vec<(i64, bool)> = in_progress
            .iter()
            .map(|quest| (quest.quest_id, quest.blocked.is_some()))
            .collect();
        assert_eq!(blocked, [(10_005, true), (10_010, false), (40_001, false)]);
        let error = game
            .complete_quest(10_005)
            .expect_err("a hero joins in quest 5");
        assert!(error.to_string().contains("joins the team"));
        assert!(
            game.complete_quest(10_011).is_err(),
            "quest 11 is not in progress"
        );

        // Quest 10 gives 2,500 gold, 400 corps EXP and Advanced Combat Text
        // ×5. At corps EXP 700 that crosses level 2 (800), whose reward is
        // Basic Combat Text ×10.
        game.set_adventure("exp", 700).expect("corps exp");
        let advanced = stack_count(&game, 1_410_003);
        let basic = stack_count(&game, 1_410_002);
        let completion = game.complete_quest(10_010).expect("complete");
        assert_eq!(gold(&game), 2_600);
        assert_eq!(stack_count(&game, 1_410_003), advanced + 5);
        assert_eq!(stack_count(&game, 1_410_002), basic + 10);
        assert_eq!(completion.levels_gained, 1);
        assert_eq!(completion.new_grade, None);
        let started: Vec<i64> = completion
            .started
            .iter()
            .map(|quest| quest.quest_id)
            .collect();
        assert_eq!(started, [10_011], "the next main quest starts");
        assert!(
            game.complete_quest(10_010).is_err(),
            "a completed quest is no longer in progress"
        );
    }
    assert_eq!(
        quest_rows(&session, "tb_quest_complete"),
        [10_001, 10_004, 10_009, 10_010]
    );
    assert_eq!(
        quest_rows(&session, "tb_quest_hold"),
        [10_005, 10_011, 40_001]
    );
    assert_eq!(quest_rows(&session, "tb_completed_quest"), [10_010]);
    let page = session
        .raw_page("tb_advent_status", 0, 10, None)
        .expect("advent page");
    let row = &page.rows[0].cells;
    assert_eq!(integer(&row[column_index(&page, "ADV_LEVEL")]), 2);
    assert_eq!(integer(&row[column_index(&page, "ADV_EXP")]), 1_100);
}

#[test]
fn completing_a_promotion_exam_raises_the_grade() {
    let path = fixture("quest-promotion");
    let mut session = SaveSession::open(&path).expect("open");
    let mut game = Game::new(&mut session, Catalog::shared());
    let completion = game.complete_quest(40_001).expect("promotion");
    assert_eq!(completion.new_grade, Some(2));
    assert_eq!(game.max_ascend().expect("max ascend"), 1);
    let title = game
        .titles()
        .expect("titles")
        .into_iter()
        .find(|title| title.id == 2_104_100)
        .expect("novice title");
    assert!(title.unlocked, "the Novice Mercenary Corps title");
    assert!(
        game.mounts()
            .expect("mounts")
            .iter()
            .any(|mount| mount.cid == 1_320_012),
        "the Novice promotion mount"
    );
    assert!(
        completion.started.is_empty(),
        "the Intermediate exam also waits for main quest 40"
    );
}

#[test]
fn reference_maxima_bound_the_other_fields() {
    let path = fixture("limits-other-caps");
    let mut session = SaveSession::open(&path).expect("open");
    let mut game = Game::new(&mut session, Catalog::shared());
    game.set_character(10_001, "hp", 22_229).expect("max hp");
    assert!(game.set_character(10_001, "hp", 22_230).is_err());

    game.set_equipment(BASE, "enchantLevel", 15)
        .expect("max enchant");
    assert!(game.set_equipment(BASE, "enchantLevel", 16).is_err());
    game.set_equipment(BASE, "exp", 90_000)
        .expect("max equipment exp");
    assert!(game.set_equipment(BASE, "exp", 90_001).is_err());

    game.set_stack("stackable", 1_420_001, 61_525)
        .expect("max material stack");
    assert!(game.set_stack("stackable", 1_420_001, 61_526).is_err());
    game.set_stack("cook", BASE, 203).expect("max dish");
    assert!(game.set_stack("cook", BASE, 204).is_err());
}

#[test]
fn out_of_range_grades_use_the_nearest_known_table() {
    for (saved_grade, max_ascend) in [(0, 0), (7, 5)] {
        let path = fixture_with_grade(&format!("limits-grade-{saved_grade}"), saved_grade);
        let mut session = SaveSession::open(&path).expect("open");
        let game = Game::new(&mut session, Catalog::shared());
        assert_eq!(game.max_ascend().expect("max ascend"), max_ascend);
        // The fixture heroes sit at ascend 1, so grade 0 clamps them to stage
        // 0 and grade 7 leaves them at stage 1.
        let limits = character(&game, 10_001).limits;
        assert_eq!(limits.stage, max_ascend.min(1));
        assert_eq!(limits.ascend, max_ascend);
        assert_eq!(limits.transcend, 6);
    }
}

#[test]
fn the_mercenary_corps_grade_is_read_only() {
    for grade in [1, 3, 6] {
        let path = fixture_with_grade(&format!("grade-read-only-{grade}"), grade);
        let mut session = SaveSession::open(&path).expect("open");
        let mut game = Game::new(&mut session, Catalog::shared());
        for value in [0, 1, grade - 1, grade, grade + 1, 6, 7] {
            let error = game
                .set_adventure("grade", value)
                .expect_err("no typed path writes the grade");
            assert_eq!(error.kind(), "invalid");
        }
        // Corps EXP is a running total, like a hero's.
        let corps = |level| growth::start_exp(Growth::shared().advent_exp(), level).unwrap();
        game.set_adventure("level", 42).expect("corps level");
        assert!(game.set_adventure("exp", corps(42) - 1).is_err());
        assert!(game.set_adventure("exp", corps(43)).is_err());
        game.set_adventure("exp", corps(42) + 1).expect("corps exp");
        assert!(
            game.set_adventure("level", 51).is_err(),
            "live corps level stops at 50"
        );
        let page = session
            .raw_page("tb_advent_status", 0, 10, None)
            .expect("advent page");
        let row = &page.rows[0].cells;
        let value = |name| integer(&row[column_index(&page, name)]);
        assert_eq!(value("ADV_GRADE"), grade);
        assert_eq!(value("ADV_LEVEL"), 42);
        assert_eq!(value("ADV_EXP"), corps(42) + 1);
    }

    let path = fixture("grade-raw");
    let mut session = SaveSession::open(&path).expect("open");
    assert!(
        session
            .raw_update(
                "tb_advent_status",
                USER,
                "ADV_GRADE",
                &RawValue::Integer("2".into()),
                false,
            )
            .is_err(),
        "the raw browser needs advanced editing for the grade"
    );
    session
        .raw_update(
            "tb_advent_status",
            USER,
            "ADV_LEVEL",
            &RawValue::Integer("2".into()),
            false,
        )
        .expect("the corps level stays an ordinary column");
}

#[test]
fn a_newer_schema_is_warned_and_never_written() {
    let path = fixture_with_version("schema-newer", 3);
    let original = fs::read(&path).expect("read original");
    let mut session = SaveSession::open(&path).expect("open");
    assert!(
        session
            .warnings()
            .iter()
            .any(|warning| warning.contains("schema version 3")),
        "opening a newer schema warns the user"
    );
    {
        let mut game = Game::new(&mut session, Catalog::shared());
        game.set_stack("stackable", 1_420_001, 11)
            .expect("in-memory edit");
    }
    let error = session.write().expect_err("newer schema must not write");
    assert_eq!(error.kind(), "schema");
    assert!(error.to_string().contains("schema version 3"));
    assert_eq!(
        fs::read(&path).expect("read after refusal"),
        original,
        "the save file was untouched"
    );

    let path = fixture_with_version("schema-supported", 2);
    let mut session = SaveSession::open(&path).expect("open");
    {
        let mut game = Game::new(&mut session, Catalog::shared());
        game.set_stack("stackable", 1_420_001, 11)
            .expect("in-memory edit");
    }
    session.write().expect("schema 2 still writes");
}

#[test]
fn fill_only_raises_safe_inventory_kinds() {
    let path = fixture("fill");
    let mut session = SaveSession::open(&path).expect("open");
    let mut game = Game::new(&mut session, Catalog::shared());
    let before: Vec<(String, i64, i64, String)> = game
        .inventory()
        .expect("inventory")
        .into_iter()
        .map(|stack| (stack.kind, stack.item.cid, stack.count, stack.item.kind))
        .collect();

    let updated = game.fill_stackables(1_000).expect("fill");
    let after: Vec<(String, i64, i64, String)> = game
        .inventory()
        .expect("inventory")
        .into_iter()
        .map(|stack| (stack.kind, stack.item.cid, stack.count, stack.item.kind))
        .collect();
    assert_eq!(before.len(), after.len());

    let mut expected_updates = 0;
    for ((kind, cid, old, item_kind), (_, _, new, _)) in before.iter().zip(&after) {
        let should_fill = kind == "stackable" && fillable_kind(item_kind);
        let expected = if should_fill { (*old).max(1_000) } else { *old };
        assert_eq!(
            *new, expected,
            "{kind} row {cid} ({item_kind}) changed to {new} instead of {expected}"
        );
        if *new > *old {
            expected_updates += 1;
        }
    }
    assert_eq!(
        updated, expected_updates,
        "Fill reports the rows it changed"
    );
    assert_eq!(game.fill_stackables(1_000).expect("second fill"), 0);
}

#[test]
fn fill_does_nothing_when_the_target_changes_no_row() {
    let path = fixture("fill-noop");
    let mut session = SaveSession::open(&path).expect("open");
    {
        let mut game = Game::new(&mut session, Catalog::shared());
        assert_eq!(game.fill_stackables(0).expect("fill zero"), 0);
    }
    assert!(
        !session.dirty(),
        "a no-op Fill must not mark the save dirty"
    );
}

#[test]
fn currency_limits_are_per_cid() {
    let path = fixture("currency");
    let mut session = SaveSession::open(&path).expect("open");
    {
        let mut game = Game::new(&mut session, Catalog::shared());
        game.set_currency(1_000_001, 47_451_809)
            .expect("gold reference");
        assert!(game.set_currency(1_000_001, 47_451_810).is_err());
        game.set_currency(1_000_002, 47_451_810)
            .expect("aether uses the safety cap, not gold's balance");
        assert!(game.set_currency(1_000_002, 2_147_483_648).is_err());
    }

    let path = fixture_with_gold("currency-high", 50_000_000);
    let mut session = SaveSession::open(&path).expect("open");
    let mut game = Game::new(&mut session, Catalog::shared());
    game.set_currency(1_000_001, 50_000_000)
        .expect("same above reference");
    game.set_currency(1_000_001, 49_000_000)
        .expect("explicit lower");
    assert!(game.set_currency(1_000_001, 49_000_001).is_err());
    game.set_currency(1_000_001, 47_451_810)
        .expect("explicit lower, still above the reference");
    assert!(game.set_currency(1_000_001, 47_451_811).is_err());
}

#[test]
fn values_above_a_reference_limit_stay_editable() {
    let path = fixture("above-limits");
    let mut session = SaveSession::open(&path).expect("open");

    let page = session
        .raw_page("tb_stackable_item", 0, 100, None)
        .expect("stack page");
    let cid = column_index(&page, "ITEM_CID");
    let row = page
        .rows
        .iter()
        .find(|row| integer(&row.cells[cid]) == 1_420_001)
        .expect("stack row");
    let rowid = row.rowid.parse().expect("rowid");
    session
        .raw_update(
            "tb_stackable_item",
            rowid,
            "STACK_CNT",
            &RawValue::Integer("70000".into()),
            false,
        )
        .expect("high stack");

    let page = session
        .raw_page("tb_character", 0, 100, None)
        .expect("character page");
    let cid = column_index(&page, "CHARACTER_CID");
    let row = page
        .rows
        .iter()
        .find(|row| integer(&row.cells[cid]) == 10_001)
        .expect("character row");
    let rowid = row.rowid.parse().expect("rowid");
    session
        .raw_update(
            "tb_character",
            rowid,
            "LEVEL",
            &RawValue::Integer("75".into()),
            false,
        )
        .expect("high level");

    let mut game = Game::new(&mut session, Catalog::shared());
    game.set_stack("stackable", 1_420_001, 70_000)
        .expect("same above the stack limit");
    game.set_stack("stackable", 1_420_001, 69_999)
        .expect("explicit lower");
    assert!(game.set_stack("stackable", 1_420_001, 70_000).is_err());
    game.set_character(10_001, "level", 75)
        .expect("same above the level limit");
    game.set_character(10_001, "level", 74)
        .expect("explicit lower");
    assert!(game.set_character(10_001, "level", 75).is_err());
}

#[test]
fn team_slots_refuse_duplicates_gaps_and_an_empty_active_slot() {
    let path = fixture("team-slots");
    let mut session = SaveSession::open(&path).expect("open");
    assert!(session.consistency().is_clean(), "fixture starts clean");

    // Make page 1 active with its second slot selected. Page 0 is then free to
    // edit without tripping the active-team guards.
    session
        .raw_update(
            "tb_user",
            USER,
            "SELECTED_TEAM_PAGE_ID",
            &RawValue::Integer("1".into()),
            true,
        )
        .expect("select page 1");
    session
        .raw_update(
            "tb_user",
            USER,
            "SELECTED_PAGE_SLOT_INDEX",
            &RawValue::Integer("1".into()),
            true,
        )
        .expect("select slot 2");

    {
        let mut game = Game::new(&mut session, Catalog::shared());
        let teams = game.teams().expect("teams");
        assert_eq!(teams.len(), 3);
        assert!(!teams[0].selected);
        assert!(teams[1].selected);
        assert!(!teams[2].selected);

        assert!(
            game.set_team_slot(0, 3, 10_001).is_err(),
            "a character already on the page cannot appear twice"
        );
        assert!(
            game.set_team_slot(0, 3, 99_999).is_err(),
            "only owned characters may be assigned"
        );
        assert!(
            game.set_team_slot(1, 2, 0).is_err(),
            "the active team's selected slot cannot be emptied"
        );
        assert!(
            game.set_team_slot(1, 3, 10_003).is_err(),
            "the duplicate guard also applies to the active page"
        );

        game.set_team_slot(1, 3, 10_001)
            .expect("fill the next empty slot");
        game.set_team_slot(1, 3, 0)
            .expect("clear the last filled slot");

        game.set_team_slot(2, 3, 0).expect("clear page 2 slot 3");
        game.set_team_slot(2, 2, 0).expect("clear page 2 slot 2");
        assert!(
            game.set_team_slot(2, 1, 0).is_err(),
            "a page must keep at least one character"
        );
        assert!(
            game.set_team_slot(2, 3, 10_002).is_err(),
            "a new character cannot leave a gap"
        );
        game.set_team_slot(2, 2, 10_003)
            .expect("refill the first empty slot");
        game.set_team_slot(2, 3, 10_002)
            .expect("refill the next slot");
        game.set_team_slot(2, 1, 10_001)
            .expect("assigning the same value is a no-op");
    }

    let report = session.write().expect("valid team edits write");
    assert!(report.consistency.is_clean());
}

#[test]
fn removing_a_character_refuses_the_active_team_and_compacts_other_pages() {
    let path = fixture("team-remove");
    let mut session = SaveSession::open(&path).expect("open");
    {
        let mut game = Game::new(&mut session, Catalog::shared());
        assert!(
            game.remove_character(10_001).is_err(),
            "a character in the active team cannot be removed"
        );
        assert!(
            game.remove_character(10_002).is_err(),
            "the guard covers every slot of the active page, not only the selected one"
        );

        game.remove_character(10_003)
            .expect("remove a character from non-active pages");
        assert!(
            game.characters()
                .expect("characters")
                .iter()
                .all(|character| character.cid != 10_003)
        );
        let teams = game.teams().expect("teams");
        let slots = |page: usize| {
            teams[page]
                .slots
                .iter()
                .map(|slot| slot.cid)
                .collect::<Vec<_>>()
        };
        assert_eq!(slots(0), vec![10_001, 10_002, 0]);
        assert_eq!(slots(1), vec![10_002, 0, 0], "the survivor moved forward");
        assert_eq!(
            slots(2),
            vec![10_001, 10_002, 0],
            "the middle survivor compacted"
        );
    }

    let report = session.write().expect("the compacted teams write");
    assert!(report.consistency.is_clean());
}

#[test]
fn locking_a_title_clears_its_favorite_and_selected_title() {
    let path = fixture("title-lock");
    let mut session = SaveSession::open(&path).expect("open");
    {
        let mut game = Game::new(&mut session, Catalog::shared());
        let before = game
            .titles()
            .expect("titles")
            .into_iter()
            .find(|title| title.id == 2_100_000)
            .expect("seed title");
        assert!(before.unlocked);
        assert!(before.favorite);

        game.set_title_unlocked(2_100_000, false)
            .expect("lock the selected title");
        let after = game
            .titles()
            .expect("titles")
            .into_iter()
            .find(|title| title.id == 2_100_000)
            .expect("seed title");
        assert!(!after.unlocked);
        assert!(!after.favorite, "locking must clear the favorite bit");

        // Unlocking every title must leave the other title's favorite alone.
        game.unlock_all_titles().expect("unlock all titles");
        let titles = game.titles().expect("titles");
        assert!(titles.iter().all(|title| title.unlocked));
        assert!(
            titles
                .iter()
                .find(|title| title.id == 2_100_001)
                .expect("second title")
                .favorite,
            "unlock-all must preserve favorites"
        );
        assert!(
            !titles
                .iter()
                .find(|title| title.id == 2_100_000)
                .expect("first title")
                .favorite,
            "a title locked earlier stays unfavorited"
        );
    }
    let page = session.raw_page("tb_user", 0, 10, None).expect("user page");
    let title_cid = column_index(&page, "TITLE_CID");
    assert_eq!(
        integer(&page.rows[0].cells[title_cid]),
        0,
        "locking the selected title must clear TITLE_CID"
    );
    let report = session.write().expect("title edits write");
    assert!(report.consistency.is_clean());
}

#[test]
fn a_new_team_problem_blocks_the_write() {
    let path = fixture("team-check-duplicate");
    let mut session = SaveSession::open(&path).expect("open");
    assert!(session.consistency().is_clean(), "fixture starts clean");

    let page = session.raw_page("tb_team", 0, 10, None).expect("team page");
    let page_id = column_index(&page, "PAGE_ID");
    let row = page
        .rows
        .iter()
        .find(|row| integer(&row.cells[page_id]) == 0)
        .expect("page 0 row");
    let rowid = row.rowid.parse().expect("rowid");
    session
        .raw_update(
            "tb_team",
            rowid,
            "SLOT2_CHARACTER_CID",
            &RawValue::Integer("10001".into()),
            true,
        )
        .expect("introduce a duplicate");

    let error = session.write().expect_err("a duplicate team must block");
    assert_eq!(error.kind(), "inconsistent");
    assert!(
        error.to_string().contains("lists character 10001"),
        "{error}"
    );
}

#[test]
fn the_checker_reports_a_gap_and_an_empty_active_slot() {
    let path = fixture("team-check-gap");
    let mut session = SaveSession::open(&path).expect("open");
    let page = session.raw_page("tb_team", 0, 10, None).expect("team page");
    let page_id = column_index(&page, "PAGE_ID");
    let row = page
        .rows
        .iter()
        .find(|row| integer(&row.cells[page_id]) == 0)
        .expect("page 0 row");
    let rowid = row.rowid.parse().expect("rowid");
    session
        .raw_update(
            "tb_team",
            rowid,
            "SLOT1_CHARACTER_CID",
            &RawValue::Integer("0".into()),
            true,
        )
        .expect("empty the first slot");

    let error = session.write().expect_err("a gap must block");
    assert_eq!(error.kind(), "inconsistent");
    let text = error.to_string();
    assert!(text.contains("empty slot before a filled one"), "{text}");
    assert!(
        text.contains("active team slot on page 0 is empty"),
        "{text}"
    );
}

#[test]
fn a_new_broken_gem_link_blocks_the_write() {
    let path = fixture("consistency");
    let mut session = SaveSession::open(&path).expect("open");
    assert!(
        session.consistency().is_clean(),
        "the synthetic save starts with sound gem links"
    );

    let page = session
        .raw_page("tb_equipment", 0, 5, None)
        .expect("equipment page");
    let row = page.rows.first().expect("equipment row");
    let rowid = row.rowid.parse().expect("rowid");
    session
        .raw_update(
            "tb_equipment",
            rowid,
            "GEM_DBID",
            &RawValue::Integer("123".into()),
            true,
        )
        .expect("dangling link");

    let before = fs::read(&path).expect("read");
    let error = session
        .write()
        .expect_err("a new dangling link must block the write");
    assert_eq!(error.kind(), "inconsistent");
    assert_eq!(
        fs::read(&path).expect("read"),
        before,
        "the save is untouched when the consistency check refuses"
    );

    session
        .raw_update(
            "tb_equipment",
            rowid,
            "GEM_DBID",
            &RawValue::Integer("0".into()),
            true,
        )
        .expect("clear the link");
    let report = session.write().expect("write after the link is cleared");
    assert!(report.consistency.is_clean());
    session.close();

    fs::remove_dir_all(path.parent().expect("parent")).expect("cleanup");
}
