# Save format reference

This page describes the parts of a DragonSword Awakening save that the editor reads and writes. It was verified against real saves: decrypting both supplied files, editing them, re-encrypting, and reopening the result in the editor.

## Files in a slot

A slot folder contains:

| File                   | Purpose                                                                   |
| ---------------------- | ------------------------------------------------------------------------- |
| `<account>_Slot<N>.db` | The encrypted SQLCipher database the game loads. This is the file edited. |
| `SPack_Slot<N>.sav`    | Unreal `GVAS` save data. Read by the game, not modified by this editor.   |
| `ScreenShot_<N>.png`   | Slot thumbnail. The game writes JPEG bytes with a `.png` extension.       |

The account folder name is the same as the save prefix, for example `SaveGames/1000/1000_Slot5.db`.

## Encryption

The database uses SQLCipher with `PRAGMA cipher_compatibility = 4`:

| Parameter           | Value                                                         |
| ------------------- | ------------------------------------------------------------- |
| Cipher              | AES-256-CBC                                                   |
| Page size           | 4096 bytes                                                    |
| Reserved bytes/page | 80 (16-byte IV + 64-byte HMAC-SHA512)                         |
| Key derivation      | PBKDF2-HMAC-SHA512, 256,000 iterations                        |
| HMAC key derivation | PBKDF2-HMAC-SHA512, 2 iterations, HMAC salt = salt XOR 0x3a   |
| Salt                | First 16 bytes of the file                                    |
| Page 1              | Salt replaces the SQLite header; ciphertext starts at byte 16 |

The passphrase is a single constant shared by every save: `13314374259236352028`. It is derived by hashing a string embedded in the client with FNV-1a-64 over its UTF-16 code units, so the same key opens every save without user input.

Each page is encrypted independently. The HMAC covers the ciphertext, the per-page IV, and the 1-based page number encoded little-endian. A fresh random IV is generated for every page when writing; the original salt is reused so the game derives the same key.

### Decrypting

1. Read the 16-byte salt from the start of the file.
2. Derive the encryption key with PBKDF2-HMAC-SHA512 over the passphrase and salt.
3. Derive the HMAC key with PBKDF2-HMAC-SHA512 over the encryption key and `salt XOR 0x3a`.
4. For each 4096-byte page, verify the stored HMAC, then AES-256-CBC decrypt the page body with the stored IV.
5. Write the standard SQLite header (`SQLite format 3\0`) over the salt area of page 1.

The result is a normal SQLite database with 80 reserved bytes at the end of every page. SQLite itself ignores those bytes, so the editor can use an ordinary `rusqlite` connection while the reserved space stays available for re-encryption.

### Encrypting

1. Flush SQLite's WAL and cache.
2. Read the plaintext database, which must stay a multiple of 4096 bytes.
3. Derive the keys from the original salt.
4. Encrypt every page, generate a new IV, compute the HMAC, and write both into the page's reserved area.
5. Write the salt back over the SQLite header area of page 1.
6. Replace the original file atomically after the temporary file reads back byte-for-byte.

## Database schema

The save is a full game database. These are the tables the typed screens use; the raw browser exposes every table in the save.

| Table                                 | Used for                                                                                                                                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tb_user`                             | One row per account: `USER_DBID`, region, section, position, stamina, title, timestamps.                                                                                                                                                                           |
| `tb_advent_status`                    | The Mercenary Corps grade, level and EXP (`ADV_GRADE`, `ADV_LEVEL`, `ADV_EXP`), the difficulty columns `CUR_ADV_DIFFICULTY`, `ORIGIN_ADV_DIFFICULTY` and `RESTORE_ADV_DIFFICULTY_UTC_SEC`, plus `NICK_NAME` and `PLAY_TIME`. The grade is read-only in the editor. |
| `tb_currency`                         | `ITEM_CID`, `AMOUNT` for gold and aether crystals.                                                                                                                                                                                                                 |
| `tb_stackable_item`                   | `ITEM_CID`, `STACK_CNT` for materials and cooked food.                                                                                                                                                                                                             |
| `tb_character`                        | `CHARACTER_CID`, level, EXP, ascension, HP, transcendence, soldier grade.                                                                                                                                                                                          |
| `tb_skill_growth`                     | `CHARACTER_CID`, `TYPE_VALUE`, `SLOT_LEVEL` for character skills.                                                                                                                                                                                                  |
| `tb_team`                             | `PAGE_ID` and three character slots per team page.                                                                                                                                                                                                                 |
| `tb_equipment`                        | `ITEM_DBID`, enchant, EXP, lock, `GEM_DBID`, main/sub stat CIDs and values.                                                                                                                                                                                        |
| `tb_gem`                              | `ITEM_DBID`, `STAT_INFO_CID`, lock state.                                                                                                                                                                                                                          |
| `tb_karma`                            | `ITEM_DBID`, EXP, ascension, transcendence, lock state.                                                                                                                                                                                                            |
| `tb_equip_mount`                      | Links a character to equipment slots, a karma spirit, and a mount.                                                                                                                                                                                                 |
| `tb_costume`                          | `COSTUME_DBID`, `COSTUME_CID`, `EQUIP_CHARACTER_CID`, `PARTS_ON`, `IS_NEW`.                                                                                                                                                                                        |
| `tb_vehicle`                          | `VEHICLE_DBID`, `VEHICLE_CID`, `CREATED_DATE` for mounts.                                                                                                                                                                                                          |
| `tb_title`                            | Title unlock bits, grouped by `CATEGORY`, with `FAV_BIT_FIELD`.                                                                                                                                                                                                    |
| `tb_switch`                           | General switch bits; cooking recipes use the `CATEGORY`/bit pairs.                                                                                                                                                                                                 |
| `tb_quest_complete`                   | Completed quests. Category 1 is the main story, with quest IDs from 10001. The editor only reads it.                                                                                                                                                               |
| `tb_completed_quest`, `tb_quest_hold` | Completed-quest records and quests in progress. The overview counts `tb_completed_quest`.                                                                                                                                                                          |

`USER_DBID` scopes almost every gameplay row. The editor reads it once when opening the save and uses it in every query.

## Bitmasks

Titles and recipes are not rows per item. They are bits in a signed 64-bit column:

```
CATEGORY = id / 64
bit      = id % 64
```

`tb_title` stores title bits and a separate favourites mask. The editor treats a missing `FAV_BIT_FIELD` as zero and preserves an existing mask when unlocking a title. `tb_switch` stores recipe bits; the catalog has 1,025 recipes across categories 15 through 62.

## Content IDs and instance IDs

Content IDs (`*_CID`) identify catalog entries: characters 10001–10040, currencies 1000001/1000002, mounts 132xxxx, costumes 999xxxx, gear 136–139xxxx, food 142xxxx, and titles 210xxxx. The bundled catalog maps CIDs to names, categories, and sprite positions.

Instance IDs (`ITEM_DBID`, `GEM_DBID`, `COSTUME_DBID`, `VEHICLE_DBID`) are 64-bit values that identify a particular copy of an item. They routinely exceed JavaScript's safe integer range, so the Tauri boundary carries them as decimal strings and Rust parses them as `i64`. Raw rowids cross the same way, because in tables such as `tb_equipment` the rowid is an alias for the 64-bit `ITEM_DBID` primary key.

Equipment stat CIDs pack a stat type and a value: the main stat uses `5000 + type * 100 + value` and sub stats use `50000 + type * 100 + value`. The type table is not published, so the editor exposes the resulting CID as a raw number.

## Write pipeline

Opening a save never modifies it:
1. Read the encrypted file and decrypt it to a private temporary file.
2. Open the temporary file with `rusqlite`, foreign keys off, journal mode `DELETE`.
3. Run `PRAGMA integrity_check` and refuse to open a structurally corrupt database.
4. Record the consistency baseline: gem links that already point at a missing or deleted gem, and gems linked to more than one equipment piece. The baseline is shown in the overview and does not block editing.
5. Apply edits to the temporary database.

Saving is explicit:
1. Refuse while a non-empty `<save>-journal` or any `<save>-wal` sits beside the save. A journal means the game stopped mid-save; replacing the main file would let SQLite replay the old journal onto the new database.
2. Read the file on disk and compare its SHA-256 with the bytes the editor opened or last wrote. If they differ, refuse with a `stale` error and leave the file untouched.
3. Flush the connection, then run `PRAGMA integrity_check` on the edited database. If it is not `ok`, refuse and leave the file untouched.
4. Run the consistency check again and compare it with the baseline. A save that already had a broken gem link may keep it, so the damage can be repaired; a link the edit introduces is refused with an `inconsistent` error.
5. Read the plaintext database and encrypt it with the original salt.
6. Re-read the file and repeat the digest and journal checks, because key derivation takes long enough for the game to save underneath the editor.
7. Back up the on-disk file to `<save>.<YYYYMMDD-HHMMSS>.bak` whenever it is not the editor's own last output. In a normal session that is the first write.
8. Write to a temporary file in the save directory, `fsync` it, read it back and compare it byte-for-byte with the encrypted output, then rename it over the original.
9. `fsync` the directory on Unix.

The original encrypted file is never partially overwritten: a failed write leaves the previous file in place. The plaintext temporary database is created with owner-only permissions on Unix and deleted when the session closes or the app exits.

## Compatibility notes

- The editor leaves the sibling `.sav` and screenshot alone. The game reads the `.db` for the data shown in the editor.
- Unknown tables and columns are preserved because edits are ordinary SQL statements against a full copy of the database.
- A future game build can change the schema. A save with `USER_DB_VERSION` above 2 opens for inspection, but saving is refused. For supported versions, the raw browser and the schema dialog are the escape hatch, and the typed screens fail loudly rather than guessing.
- Close the game before saving. The editor refuses while a non-empty `-journal` or any `-wal` is beside the save, and the stale check catches a save the game made before the editor writes. A running game can still write over the file after the editor replaces it.
