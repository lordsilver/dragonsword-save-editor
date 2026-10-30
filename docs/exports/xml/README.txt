DragonSword Awakening - XML game tables export
==============================================

Export date : 2026-10-30
Game        : DragonSword Awakening, installed at C:\Games\DragonSword Awakening
Game version: v1.1.1, NOT confirmed (the only marker is the checksum file v1.1.1.xxh128
              in the install root). The paks are dated 2026-10-24 (46) and 2026-08-19 (6);
              pakchunk109-WindowsClient.pak, which holds the tables, is 24,551,970 bytes,
              dated 2026-10-24.

The game install was only read. Nothing under C:\Games\DragonSword Awakening was created,
modified, moved or deleted, and the game was not started.

These files are the game's data and its copyright. Do not commit them; generators read
them from outside the repository (pass this folder's GameData/ as <extract-dir>).


What is here
------------
GameData/                 every file under DS/Content/__GeneratedGameData__/Server/XML/GameData/
                          in the paks, with its folders kept: 810 XML files, 187,325,870 bytes.
                          342 tables sit at the top level; the rest are per-map exports in
                          15 subfolders (ExportActorPositionData/<map>/EX_ActorPositionData.xml,
                          ExportZoneData, ExportWarpPositionData, ...).
Schema/dsgamedb_sqlite.sql
                          the save database's schema (30,926 bytes), found in the paks by name.
tools/pak-tree.go         the exporter's source (below); not kept in this repository.
manifest.tsv              every file with its size and SHA-256.


How it was made
---------------
1. pak-tree, a new command written for this export next to pak-dump in a local clone of
   gfriloux/dragonsword-save-editor (commit 41acde6, 2026-08-08), as cmd/pak-tree. It
   reuses that repository's pure-Go pak reader (internal/pak) and Oodle decoder
   (internal/oodle, WebAssembly through wazero): no AES key file, no .usmap, no CGO.
   It writes every entry under the GameData folder to -out, keeping the folders, and
   stops if two entries would write the same file (Windows folds case). Built offline
   with Go 1.27.0:

     GOFLAGS=-mod=mod GOPROXY=off go build -o pak-tree.exe ./cmd/pak-tree
     pak-tree.exe -game "C:/Games/DragonSword Awakening" -out <dir>/GameData

   Result: "wrote 810 files, 187325870 bytes" in about 2 seconds, the same count and total
   as pak-dump -list reports for that folder.

2. The schema, with the pak-dump build used on 2026-10-26 (base-name match):

     pak-dump.exe -game "C:/Games/DragonSword Awakening" -out <dir>/Schema dsgamedb_sqlite.sql


Compared with the 2026-10-26 extract
------------------------------------
The 2026-10-26 extract (C:\Users\Gary\dsa-work\extract, used for growth.json, titles,
skills and game.json) was written flat by pak-dump, which matches base names and keeps
the first entry of each: 505 tables and the schema. All 506 of those files are byte-
identical in this export, so the game data has not changed since. This export adds the
305 files the flat one could not hold, because their names repeat across folders.


For the generators
------------------
scripts/gen-catalog.mjs (items.json, item_categories.json, recipes.json),
gen-catalog-extras.mjs (titles.json, skills.json), gen-game-data.mjs (game.json) and
gen-growth.mjs (growth.json) read GameData/ as <extract-dir>; docs/game-assets.md gives
the order to run them in. Attribute values are XML-escaped (&quot; &lt; &gt; &amp; &#xA;);
the generators decode them.
