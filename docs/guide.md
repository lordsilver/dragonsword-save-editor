# User guide

## Before you start

- Close DragonSword Awakening. A running game keeps the save database open and may overwrite the file after the editor writes it.
- Know where your saves live: `.../DragonSword Awakening/DS/Saved/SaveGames/<accountId>/<accountId>_Slot<N>.db`.
- The first save of a session creates a timestamped `.bak` next to the file. You can also press **Backup** at any time without editing anything.

## Opening a save

On the start screen, either:
- Choose **Scan a folder** and pick the `SaveGames` folder (or a single account folder). The editor lists every slot it finds, newest first.
- Choose **Open save file** and select one `<account>_Slot<N>.db`.

If the folder has no saves, the editor says so and leaves the list empty. If the file is not a valid SQLCipher save, the error names the reason (for example, "too small to be a SQLCipher database") and the current save stays open.

The slot cards show the screenshot the game saved with the slot, when one exists.

## Value limits

The editor's limits fall into three groups. [Game rules](game-rules.md) has the sources, the open questions and the in-game observations.

**Game rules**, from the game's own tables. The Mercenary Corps grade unlocks breakthroughs, one per promotion, and each hero's own breakthrough (`ASCEND`) sets its caps. The editor applies the limits of the offline game, which caps heroes at level 70: breakthrough 5 and grade 6.

| Breakthrough | Level cap | Active skill cap (1–4) | Basic skill cap (5–7) |
| ------------ | --------- | ---------------------- | --------------------- |
| 0            | 20        | 3                      | 3                     |
| 1            | 30        | 5                      | 5                     |
| 2            | 40        | 7                      | 7                     |
| 3            | 50        | 9                      | 7                     |
| 4            | 60        | 10                     | 7                     |
| 5            | 70        | 10                     | 7                     |

EXP is a running total that follows the level: changing a level writes the EXP that starts it, EXP edits stay inside the current level, and a hero at its level cap sits at that level's start, because the game refunds EXP past the cap. A breakthrough cannot be lowered below what the level needs: a level-35 hero needs breakthrough 2, so lower the level first. Karma uses the same level caps; its EXP comes from its rarity's level table. The special 801 slot caps at 1, awakening caps at 6, and the Mercenary Corps level caps at 50. The grade itself is read-only, because it follows the promotion quests the save records.

**Observed in the modded 100% save.** These bound fields whose real cap is unknown: material stacks at 61,525, cooked dishes at 203, gold at 47,451,809, equipment enchant at 15 and item EXP at 90,000, and character HP at 22,229.

**Safety caps.** Every other currency, play time and raw stat values get 32-bit bounds; soldier grade and transcend total cap at 99, and soldier grade points at 999,999,999. These are not claims about the game.

Existing values above a cap stay editable, and every field uses `max(cap, current)`, so a blur cannot lower them. None of this replaces the game's own validation. The raw database browser can still write any value the column type accepts, except in a save whose schema version is newer than 2.

## Editing

Every screen edits only the open temporary copy. The title bar shows **Unsaved** until you save, and the sidebar shows whether the file on disk is current.

### Overview

Shows the account, player name, Mercenary Corps grade, level and EXP, play time, stamina, location, collection progress, currencies, and the save file itself.
- Click the pencil next to the name to rename the player.
- **Edit Mercenary Corps** changes the corps level, EXP or play time. The grade is shown but read-only: it follows the promotion quests, and each promotion unlocks the next hero and karma breakthrough. The level caps at 50, the live servers' maximum. Changing the level writes that level's starting EXP, and the EXP field edits within the current level.
- **Quest rewards** lists what each completed quest hands out, from the game's own quest table, and grants the quests you tick. Use it when another tool marked quests complete without giving their rewards. It adds gold, stackable items and mounts. Equipment, cooked dishes, heroes and Mercenary Corps EXP are listed but not granted, because they need rows or level changes the editor does not make. The editor cannot tell which rewards the game already gave, so granting a quest twice adds its rewards twice.
- **Fill every stack** is the bulk inventory action; it is disabled when every eligible material stack is already full.

### Currencies

Edit gold or aether crystals directly. **Set highest seen** fills the field with the largest balance in the reference save, 47,451,809, then you still press Save changes.

### Inventory

Lists stackable materials and cooked dishes. Edit a count, add a missing catalog item with **Add stackable**, or use **Fill stacks** to set every safe row to a chosen count. Material stacks are capped at 61,525; cooked dishes at 203. The **Max** button appears only for stack kinds Fill can safely raise and for cooked dishes.

### Characters

The character list selects one character at a time. Edit level, EXP, ascension, HP, transcendence, and soldier grade, manage skills, and fill the three slots of each team page.
- Level, EXP, ascension, and transcendence follow the hero's own breakthrough caps above. The header shows the stage, for example "Breakthrough 1 of 5 · level cap 30 · skill cap 5". Level starts at 1, and a level change writes that level's starting EXP.
- The editor does not insert character rows. To recruit a shop character, add **Fate's Invitation** (CID 1,000,500) on the Inventory screen, save, then buy the character in the game's shop. The game writes the level-1 character row and purchase record. Story characters still arrive by playing.
- Removing a character also clears their skills, team slots, loadout links, and costume assignments.
- Skills are keyed by `TYPE_VALUE`; the game writes 1–7 and 801. Active slots 1–4 and basic slots 5–7 follow the hero's breakthrough stage, and 801 caps at 1.

### Equipment

Each row is one equipment instance. Edit enchant level, item EXP, and lock state inline. Enchant is capped at 15 and item EXP at 90,000. The **gem** field links a gem by its 64-bit instance ID; the editor accepts only a live gem that is not already linked to another piece. **Stats** opens the raw main/sub stat CIDs and values.

Equipment stat CIDs are packed numbers, not named stats. The note on the screen explains the encoding; the safest approach is to copy a CID from an item that already has the effect you want.

### Gems

Edit each gem's raw `STAT_INFO_CID` and lock state. The catalog icon follows the gem's item CID, not its stat CID.

### Karma

Edit a spirit's EXP, ascension, and transcendence, and equip it to a character. Each spirit's caps follow its own breakthrough: the same level caps as heroes, with the EXP from its rarity's level table. The card shows the level its EXP reaches. A spirit belongs to one character at a time: assigning a new owner clears the previous character's slot. Choosing **Not equipped** detaches it.

### Costumes and mounts

Unlock entries from the catalog and assign them to a character. Costumes are non-exclusive per character; a mount is one per character. Unlocking writes the instance row with the current date, and costume rows also get `PARTS_ON = 1` and `IS_NEW = 1`.

### Titles

Every title in the catalog, with its colour and stat bonus. Toggle one title, or **Unlock every title**. Existing favourites are preserved. The game's displayed title is a separate field and is not changed here.

### Cooking

The cookbook lists all 1,025 recipes with ingredients and effects. Toggle a recipe, or **Learn every recipe**. Recipe knowledge is a bit in `tb_switch`, not an inventory row.

### Raw database

The escape hatch. Pick a table, search every column, page through rows, and click a cell to edit it. The schema dialog lists column types, nullability, primary keys, and which columns the editor protects.
- Integer values are carried as strings so 64-bit IDs survive the round trip.
- Blob cells are shown as base64 and are read-only.
- `USER_DBID` is protected and cannot be changed, even in advanced mode.
- Key and link columns (primary keys, `*_DBID`, `CHARACTER_CID`, `*_CHARACTER_CID`, `ACC_*`, `KARMA`, `VEHICLE`, `CATEGORY`, `USER_DB_VERSION`) are read-only until you turn on **Advanced editing**. Editing one moves the row or leaves the rows that point at it orphaned.
- Seed tables (`tb_init_*`) are shown for reference and are never written.
- Every value is checked against the column's declared type before it is written, and NULL is only accepted in a nullable column. Raw edits still bypass the typed rules for foreign keys, so keep a backup.

## Saving, backups, and recovery

- **Save changes** or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>S</kbd>: checks that the file on disk is still the one the editor opened or last wrote, runs SQLite's integrity check, refuses any gem link the edit would break, backs it up when it is not the editor's own output, re-encrypts, reads the temporary file back, and atomically replaces the save.
- **Backup** or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>B</kbd>: copies the current on-disk save to a timestamped `.bak` without writing edits.
- **Open another save** or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>O</kbd>: blocked while there are unsaved changes.
- **Close save** asks before discarding unsaved changes.
- **Close the window**: asks to save and close, discard and close, or cancel when the save has unsaved changes or a value is still being typed. A clean save closes immediately.

If the game wrote the slot after you opened it, saving is refused with a **Reopen** action. Reopening loads the game's newer progress and drops the edits in the editor; that is deliberate, because writing would overwrite the game's save.

Opening a save whose `USER_DB_VERSION` is newer than 2 shows a warning. It can still be inspected, but **Save changes** is refused and the file is left untouched.

Opening a save runs SQLite's `integrity_check` and records any gem links that already point at a missing or deleted gem, or link one gem to more than one piece. The overview lists them. A save with existing damage can still be edited and written; only a link the edit introduces blocks the save. A new broken link is refused with an `inconsistent` error and the file is left untouched.

If the game stopped partway through a save, it leaves a `-journal` beside the slot. The editor warns on open and refuses to write while a non-empty `-journal` or any `-wal` is there. Start the game, load the slot, quit normally so the game finishes the save, then reopen the slot here.

Backups look like `1000_Slot5.db.20261025-015501.bak`. To recover, close the editor and copy the backup over the save, keeping the original name.

## Preferences

- **Theme**: light, dark, or follow the system.
- **Catalog language**: English or French names, with unknown entries falling back to English.
- **Compact rows**: tighter tables and lists.
- **Show unknown items**: keep catalog misses visible instead of hiding them behind a generic entry.
- **Save folder**: where scanning starts; **Rescan** refreshes the list.
- **Open another save**: switch files without closing the app.

## Troubleshooting

| Symptom                                             | What to check                                                                                                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No saves found                                      | Point the scanner at the folder containing `<account>_Slot<N>.db`, not the game executable.                                                               |
| "Save file is too small to be a SQLCipher database" | The selected file is not a save.                                                                                                                          |
| "Page N failed its integrity check"                 | The file is corrupt or from a build that no longer uses the shared key. Restore a backup.                                                                 |
| The game ignores the edit                           | Make sure the game was closed while saving and that you loaded the same slot.                                                                             |
| "The save file changed on disk"                     | The game saved after you opened the slot. Choose **Reopen**, then reapply the edit.                                                                       |
| "This save uses schema version N"                   | The save is newer than this editor supports. Update the editor; writing is blocked so the game's new schema is not damaged.                               |
| "The game stopped partway through saving this slot" | The editor will not write while a journal is present. Start the game, load the slot, quit normally, then reopen it here.                                  |
| "The save would introduce broken gem links"         | The edit points equipment at a missing gem or reuses a gem already linked to another piece. Fix the gem field or undo the edit; the file was not written. |
| "failed SQLite integrity_check"                     | The edited database is structurally corrupt. The file was not written. Reopen the slot and reapply the edit, or restore a backup.                         |
| A typed screen shows an unknown item                | Turn on **Show unknown items**, or inspect the CID in the raw browser.                                                                                    |

## Keyboard shortcuts

| Shortcut                                    | Action            |
| ------------------------------------------- | ----------------- |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>S</kbd> | Save changes      |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>B</kbd> | Write a backup    |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>O</kbd> | Open another save |
