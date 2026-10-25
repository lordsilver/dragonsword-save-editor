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
  PRIMARY KEY (USER_DBID)
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
CREATE TABLE tb_init_character (
  ACCOUNT_TYPE TEXT NOT NULL DEFAULT '',
  CHARACTER_CID INTEGER NOT NULL DEFAULT 0,
  LEVEL INTEGER NOT NULL DEFAULT 0,
  EXP INTEGER NOT NULL DEFAULT 0,
  ASCEND INTEGER NOT NULL DEFAULT 0,
  TRANSCEND INTEGER NOT NULL DEFAULT 0,
  VEHICLE_CID INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ACCOUNT_TYPE, CHARACTER_CID)
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
            "INSERT INTO tb_init_character
                (ACCOUNT_TYPE, CHARACTER_CID, LEVEL, EXP, ASCEND, TRANSCEND)
             VALUES ('NORMAL', 10001, 1, 0, 1, 0), ('NORMAL', 10002, 5, 0, 1, 2)",
            [],
        )
        .expect("seed characters");
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
fn recruiting_only_accepts_characters_the_game_defines() {
    let path = fixture("recruit");
    let mut session = SaveSession::open(&path).expect("open");

    {
        let mut game = Game::new(&mut session, Catalog::shared());

        // Character items and skins share the catalog's character category.
        assert!(game.add_character(1_110_001).is_err());
        assert!(game.add_character(9_990_002).is_err());
        // 10xxx but absent from the game's seed table.
        assert!(game.add_character(10_099).is_err());

        assert!(game.add_character(10_002).expect("recruit"));
        assert!(!game.add_character(10_002).expect("already owned"));

        let added = game.unlock_all_characters().expect("recruit all");
        assert_eq!(added, 1, "10001 is added, 10002 is already owned");

        let roster: Vec<i64> = game
            .characters()
            .expect("characters")
            .into_iter()
            .map(|character| character.cid)
            .collect();
        assert_eq!(roster, vec![10_001, 10_002]);
    }
}
