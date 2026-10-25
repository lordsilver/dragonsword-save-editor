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

## Editing

Every screen edits only the open temporary copy. The title bar shows **Unsaved** until you save, and the sidebar shows whether the file on disk is current.

### Overview

Shows the account, player name, adventure grade and level, EXP, play time, stamina, location, collection progress, currencies, and the save file itself.
- Click the pencil next to the name to rename the player.
- **Edit adventure rank** changes grade, level, or EXP.
- **Fill every stack** is the bulk inventory action; it is disabled when every stack is already full.

### Currencies

Edit gold or aether crystals directly. **Set maximum** fills the field with the editor's limit, then you still press Save changes.

### Inventory

Lists stackable materials and cooked dishes. Edit a count, add a missing catalog item with **Add stackable**, or use **Fill stacks** to set every row to a chosen count. Counts are capped at 9,999,999.

### Characters

The character list selects one character at a time. Edit level, EXP, ascension, HP, transcendence, and soldier grade, manage skills, and fill the three slots of each team page.
- **Recruit** adds a character from the catalog.
- Removing a character also clears their skills, team slots, loadout links, and costume assignments.
- Skills are keyed by `TYPE_VALUE`; special skills use values around 801.

### Equipment

Each row is one equipment instance. Edit enchant level, item EXP, and lock state inline. The **gem** field links a gem by its 64-bit instance ID. **Stats** opens the raw main/sub stat CIDs and values.

Equipment stat CIDs are packed numbers, not named stats. The note on the screen explains the encoding; the safest approach is to copy a CID from an item that already has the effect you want.

### Gems

Edit each gem's raw `STAT_INFO_CID` and lock state. The catalog icon follows the gem's item CID, not its stat CID.

### Karma

Edit a spirit's EXP, ascension, and transcendence, and equip it to a character. A spirit belongs to one character at a time: assigning a new owner clears the previous character's slot. Choosing **Not equipped** detaches it.

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
- `USER_DBID` is protected.
- Every value is validated before it is written. Raw edits bypass the typed rules for foreign keys, so keep a backup.

## Saving, backups, and recovery

- **Save changes** or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>S</kbd>: writes a backup on the first save of the session, re-encrypts, verifies, and atomically replaces the save.
- **Backup** or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>B</kbd>: copies the current on-disk save to a timestamped `.bak` without writing edits.
- **Open another save** or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>O</kbd>: blocked while there are unsaved changes.
- **Close save** asks before discarding unsaved changes.

Backups look like `1000_Slot5.db.20261025-015501.bak`. To recover, close the editor and copy the backup over the save, keeping the original name.

## Preferences

- **Theme**: light, dark, or follow the system.
- **Catalog language**: English or French names, with unknown entries falling back to English.
- **Compact rows**: tighter tables and lists.
- **Show unknown items**: keep catalog misses visible instead of hiding them behind a generic entry.
- **Save folder**: where scanning starts; **Rescan** refreshes the list.
- **Open another save**: switch files without closing the app.

## Troubleshooting

| Symptom                                             | What to check                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| No saves found                                      | Point the scanner at the folder containing `<account>_Slot<N>.db`, not the game executable. |
| "Save file is too small to be a SQLCipher database" | The selected file is not a save.                                                            |
| "Page N failed its integrity check"                 | The file is corrupt or from a build that no longer uses the shared key. Restore a backup.   |
| The game ignores the edit                           | Make sure the game was closed while saving and that you loaded the same slot.               |
| A typed screen shows an unknown item                | Turn on **Show unknown items**, or inspect the CID in the raw browser.                      |

## Keyboard shortcuts

| Shortcut                                    | Action            |
| ------------------------------------------- | ----------------- |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>S</kbd> | Save changes      |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>B</kbd> | Write a backup    |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>O</kbd> | Open another save |
