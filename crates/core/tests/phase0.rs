//! Phase 0 safety net: the stale-file guard, 64-bit ids, the raw editor's
//! rules, and the recruit gate. Every test builds its own encrypted save from a
//! synthetic plaintext database, so nothing here depends on personal saves.

use std::fs;
use std::path::PathBuf;

use dsa_core::SaveSession;
use dsa_core::catalog::Catalog;
use dsa_core::domain::Game;
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
  PRIMARY KEY (USER_DBID, CHARACTER_CID)
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

/// Write a synthetic plaintext save, encrypt it, and return the `.db` path.
fn fixture(name: &str) -> PathBuf {
    fixture_with_gold(name, 100)
}

fn fixture_with_gold(name: &str, gold: i64) -> PathBuf {
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
            "INSERT INTO tb_user (USER_DBID, SKIP_CACHE) VALUES (?, NULL)",
            [USER],
        )
        .expect("user");
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
    path
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
fn recruiting_is_disabled_until_a_verified_roster_exists() {
    let path = fixture("recruit");
    let mut session = SaveSession::open(&path).expect("open");
    let mut game = Game::new(&mut session, Catalog::shared());
    let before = game.characters().expect("characters").len();

    // NORMAL starters, MASTER developer rows, character items, skins, and an
    // unknown 10xxx id all fail: tb_init_character is a new-account seed, not
    // the list of characters a save owns.
    for cid in [
        10_001, 10_002, 10_015, 10_019, 10_033, 10_099, 1_110_001, 9_990_002,
    ] {
        let error = game.add_character(cid).expect_err("recruiting is off");
        assert_eq!(error.kind(), "invalid");
    }
    assert!(game.unlock_all_characters().is_err());
    assert_eq!(
        game.characters().expect("characters").len(),
        before,
        "recruiting added nothing"
    );
}

#[test]
fn typed_limits_match_the_reference_save() {
    let path = fixture("limits");
    let mut session = SaveSession::open(&path).expect("open");
    let mut game = Game::new(&mut session, Catalog::shared());

    game.set_character(10_001, "level", 70).expect("max level");
    assert!(game.set_character(10_001, "level", 71).is_err());
    game.set_character(10_001, "exp", 2_990_400)
        .expect("max exp");
    assert!(game.set_character(10_001, "exp", 2_990_401).is_err());
    game.set_character(10_001, "ascend", 5).expect("max ascend");
    assert!(game.set_character(10_001, "ascend", 6).is_err());
    game.set_character(10_001, "transcend", 6)
        .expect("max transcend");
    assert!(game.set_character(10_001, "transcend", 7).is_err());
    game.set_character(10_001, "hp", 22_229).expect("max hp");
    assert!(game.set_character(10_001, "hp", 22_230).is_err());

    game.set_equipment(BASE, "enchantLevel", 15)
        .expect("max enchant");
    assert!(game.set_equipment(BASE, "enchantLevel", 16).is_err());
    game.set_equipment(BASE, "exp", 90_000)
        .expect("max equipment exp");
    assert!(game.set_equipment(BASE, "exp", 90_001).is_err());

    game.set_stack("stackable", 1_420_001, 61_525)
        .expect("max stack");
    assert!(game.set_stack("stackable", 1_420_001, 61_526).is_err());
    assert!(game.set_stack("cook", BASE, 61_526).is_err());
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
