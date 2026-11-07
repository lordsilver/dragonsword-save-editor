# DragonSword world map: area names, quest marks, place cards

Answer to `handoff-map-labels-quests.md` (2026-11-07). It builds on `dsa-world-map.zip`; the map transform (world point to image through the `WorldMapData` square) is the one settled there.

**read** means a value stored in a game file. **measured** means fitted or seen in a screenshot. The tables are in `dsa-xml.zip` (restored to `Desktop\DS\`, unchanged since 2026-10-30, SHA-256 `CEB2C407…6EC8C5`). Widget dumps are in `dump/` from the earlier zip. The game install and the save were only read; the save was copied and the copy decrypted.

Screenshots: the two from the earlier handoff (`checks/game-zoomed-out.webp`, `game-zoomed-in.webp`). No new screenshots were taken, since that needs the game running.

## Files

| File                               | What                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `data/map-labels.csv`              | All 58 label rows (12 region names, 46 area names) with name, EN/FR, X, Y, world, level, fog region                                              |
| `data/map-polygons.json`           | Outlines of the 12 fog regions (`WORLDMAP_FOG`) and 90 map sections (`WORLDMAP_SECTION`), world units                                            |
| `data/quest-steps.csv`             | All 2,394 quest steps of 335 quests: target, X/Y, map mark, the position the world map shows                                                     |
| `data/place-cards.csv`             | Name, area line, descriptions and picture for 76 `WayPointData` places (45 warps, 18 statues, 12 legacies, the tower) and 69 dungeon groups      |
| `checks/overlay-game-zoomed-*.png` | Predicted labels (red +, orange = hidden at that zoom) and the save's three quest marks (magenta) drawn over the screenshots                     |
| `checks/quest-marks-zoom.png`      | The screenshots' quest marks enlarged                                                                                                            |
| `textures/`                        | `Gradation_13` (label background) and the 33 `World_MapInfo_*` place-card pictures, PNG                                                          |
| `scripts/`                         | `xmlt.py` (table reader), `export_labels.py`, `export_quests.py`, `export_places.py`, `measure_labels.py`, `check_overlay.py`, `decrypt_save.py` |
| `dump/`                            | `Pretendard` font asset                                                                                                                          |

## 1. The XML tables

`C:\Users\Gary\Desktop\DS\dsa-xml.zip` is back. It is the 2026-10-30 extraction, copied from `C:\Users\Gary\dsa-work\dsa-xml.zip`, not a new one. The unzipped tree is `C:\Users\Gary\dsa-work\dsa-xml\GameData`.

## 2. Area names on the map

### Where they come from (read)

**`MapPointIconData.xml`**, the table of every point the world map draws, has two label types in its `MapInfoType` column. The file `ExportMapPointIconData/world_01_main_WP/EX_MapPointIconData.xml` holds the same Orbis rows.

| `MapInfoType` | Count                       | `ID` is               | Name                                     | Example                                         |
| ------------- | --------------------------- | --------------------- | ---------------------------------------- | ----------------------------------------------- |
| `CHAPTERNAME` | 12, all Orbis (`MapID` 100) | a string ID           | `StringData[ID]`                         | 705055 "Meadow of Beginnings"                   |
| `AREANAME`    | 46, all Orbis               | a `MapSectionData.ID` | `StringData[MapSectionData.SectionName]` | 101202 → `SectionName` 705006 "Hill of Journey" |

Position: `PosX`, `PosY`, `PosZ` in world units. `ObtainLinkType` is `TYPE_NONE` and `ConditionCheckDataID` is 0 on every label row, so the table gives no unlock condition (see "When a label shows" below).
- **Region names (CHAPTERNAME, the large level)** are the 12 fog regions. Each label's ID equals `WorldCompleteGroupData.FogSectionName`, which links it to the region's `ID` (100000, 10101–10111). That is the same ID as `WayPointData.FogSectionID` and the `WORLDMAP_FOG` polygons.
- **Area names (AREANAME, the small level)** are the `MapSectionData` rows with `SectionType` `AREA` and `Memo1` 중구역 ("middle section"). 38 of the 46 rows resolve to a name, for example Morninglight Farm, Hill of Journey, Echo Canyon, Firefly Forest, Cemetery of Rest and Orbis Castle.
- **8 AREANAME rows have no name:** IDs 110101, 110102, 110204, 110302, 110401–110403, 110405. No `MapSectionData` row matches them, and the string IDs they collide with are quest titles or empty. They look like leftovers. The editor should skip them; the game shows nothing at their points (zoomed-in screenshot).
- **Belos has no labels:** `MapPointIconData` has no AREANAME or CHAPTERNAME row for `MapID` 200. `MapSectionData` has one map-200 AREA row (201100), with no map point. So the Belos map draws no names, as far as the tables go (not checked in game).
- `MapSectionData` also has 51 `ZONE` rows (`Memo1` 소구역, "small section") and others. They are not map labels: no `MapPointIconData` row points at them. They are the names used for warp points' area lines (section 4) and probably for the on-screen "entering X" banner.

The CSV gives, per label: `id, kind, level, map_id, world, name_string_id, en, fr, x, y, z, section_type, section_memo, fog_region_id, fog_region_en, inside_own_section_polygon, has_section_row`. `fog_region_id` is read for region names. For area names it is **computed**: the `WORLDMAP_FOG` polygon (from `PlaceRangePolygonData.xml`) that contains the label's point.

### Zoom (read thresholds, measured direction)

`WorldMapData_100`: `WorldMapBaseZoom` 1.2, `WorldMapZoomValuePerLevel` 0.3, `WorldMapZoomMaxLevel` 5, so zoom = 1.2 + 0.3 × level, level 0–5. `WorldMapHideAreaName` = `WorldMapHideChapterName` = 1.0 (zoom levels). The comparison itself is native code.

**Measured:**

| Screenshot | Scale           | Zoom level               | Labels shown      |
| ---------- | --------------- | ------------------------ | ----------------- |
| Zoomed-out | 0.00495 px/unit | 0 (slider at the bottom) | Region names only |
| Zoomed-in  | 0.01111 px/unit | 5 (slider at the top)    | Area names only   |
- The ratio between the two scales is 2.244, which matches 2.7/1.2 = 2.25.
- So **region names show below level 1 and area names from level 1**, never both at once. Whether exactly level 1 belongs to the area names is not checked.

### When a label shows (measured)

Labels in regions still under fog are not drawn.
- **Zoomed-out:** the region names Silver Ford Lake and Moss Forest Logging Site fall on screen, inside the fog, and are not drawn.
- **Zoomed-in:** every area name inside the four open regions is drawn. Blue Lake Island (in Breezewind Hill, still closed) is not drawn, although its point is on a revealed piece of coast.
- **Likely rule:** a label shows when its region is open, the same state that lifts the fog (`dsa-world-map.zip`, question 2). It does not depend on whether the area's own ground is revealed.

### How a label is drawn

**Read**, from `UI/Widget/CustomWidget/DUWG_MapPointIcon`. The same widget as the place markers carries both labels:

|               | Area name                                                                                                                                       | Region name                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Text block    | `PointArea`                                                                                                                                     | `PointChapter`                        |
| Panel         | `Panel_Area`, render scale **0.3**                                                                                                              | `Panel_Chapter`, render scale **0.5** |
| Font          | `Editor/Fonts/Pretendard`, size **50**, letter spacing −20, no typeface named, so the first one, **Medium** (Medium/SemiBold/Bold in the asset) | same                                  |
| Colour        | white, alpha 0.98 (`#FFFFFF` @ 98%)                                                                                                             | same                                  |
| Outline       | colour `#0D191D` @ 40%; the outline size is not set, so the asset's default of 0 applies, meaning no outline                                    | same                                  |
| Justification | centre                                                                                                                                          | centre                                |
| Background    | `Border_0`, padding 30, brush `Common/Gradation_13_Sprite` tinted `#113D31` @ 40% (a soft dark-green glow behind the text)                      | `Border_1`, same                      |
| Anchor        | slot alignment (0.5, 0.5) inside `Overlay_Point`, which is centred on the point: **centred on its point**                                       | same                                  |

The whole icon also gets `WorldMapPointIconScale` 1.3 on the world map.

**Measured:**
- **Centred on the point:** the label points fitted to the text centres with residuals ≤ 1 px. Three region names were fitted zoomed-out and six area names zoomed-in. X runs right, Y down, with no rotation. See `checks/overlay-*.png`.
- **Size (open point):**
  - On the 1125-px-high screenshots, region names have a cap height of about **17 px** at level 0. Area names are about **26 px** at level 5.
  - The stored scales alone (0.3 for areas, 0.5 for regions) would make region text the larger of the two. On screen, area text is the larger, so the native code scales labels with zoom.
  - In map units the two sizes come out close but not equal: about 3,400 world units for region caps and 2,300 for area caps.
  - The exact rule is not in the assets. For the editor, drawing labels at a fixed size in map units (region cap ≈ 3,400 u, area cap ≈ 2,300 u) matches both screenshots. Sizes at levels 1–4 are not checked.

## 3. Quest marks on the map

### Where a step points (read)

Steps are in **`QuestStepData.xml`** (1,088 rows) and **`QuestStepData_Export.xml`** (1,527). They overlap on 218 keys; `QuestStepData` is used where both have a row. Each row is one step of one quest (`ID`, `StepID`, `NextStepID`). Quest-level fields are in `QuestMainData.xml`.

| Column                                          | Meaning                                                                                                                                                                                                                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StepPosition`                                  | Name of the target actor. Its X, Y, Z are in **`ActorPositionData.xml`** (`Name`, `MapGroupID`, `PosX/Y/Z`), the same rows as `ExportActorPositionData/<map>/…`. NPC targets are named `NPC<id>` or a quest-specific name (`MQ18_4_Onette`, `EQ20402_03_Move_Check`). |
| `StepType`, `StepValue1`                        | What the step asks: `TALK_TO_NPC` (`StepValue1` = NPC ID), `BEGINOVERLAP`/`OVERLAP` (reach an area), `CLEAR_DUNGEON`, `DEFEAT_MONSTER`, …                                                                                                                             |
| `IconMapGroupID`, `MapID2`, `StepPositionMapID` | The map the mark is for (100 Orbis, 200 Belos), the step's map (1 = Orbis castle town), and an optional override                                                                                                                                                      |
| `StepPositionGroupID`                           | A row set in `QuestStepPositionGroupData.xml`: for each map the player can be in, a different actor to point at. Used when the target is indoors or in a dungeon.                                                                                                     |
| `MapButtonDesign`                               | **The world-map mark sprite for this step** (`Common/Mark/Icon_Mark_QuestMark_NN_Sprite`)                                                                                                                                                                             |
| `ButtonDesign`                                  | The in-world interaction mark (`Common/Inter/Icon_Inter_QuestMark_NN`)                                                                                                                                                                                                |
| `Marker`, `MarkerRange`, `QuestAreaSize`        | Area marking for some steps (1,189 rows have none)                                                                                                                                                                                                                    |

**The position the world map uses** (CSV columns `map_x`, `map_y`), read and checked against the save:
1. If the step's `StepPositionGroupID` has a `QuestStepPositionGroupData` row for the world being shown (`StepPositionMapID` 100 or 200), point at that row's `StepPosition` actor. Examples: group 1 → `Castle_Inside` (castle door), group 2 → `Cathedral_Inside`, groups 5–10 → dungeon entrances. 427 steps are redirected this way.
2. Otherwise, point at the step's own `StepPosition` actor.

Group 4, the most common (854 steps), has no row for maps 1 or 100, so the actor is used as is. Indoor actors are placed far outside the map square. For example, `NPC211` is at (−200,027, −172,885, Z 40,108), which is why the redirect is needed.

Where `StepPosition` is empty and the step is `TALK_TO_NPC`, the NPC is found by `StepValue1` in `ExportSectionNpcData/<map>/SectionNpcData.xml` (`CID`); 103 steps resolve this way.

**Checked against the save** (the user's Slot 1 save, read from a decrypted copy, table `tb_quest_hold`: `QUEST_CID`, `STEP_ID`, `USE_TRACKING`). All three held quests land on the screenshot's three marks:

| Quest, step held                                         | Step                                                                              | Predicted (zoomed-in) | Mark in screenshot     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------- | ---------------------- |
| 10018 MAIN "18. Despair and Hope", step 5                | Talk to Onette in the cathedral (`NPC211`, indoors), group 2 → `Cathedral_Inside` | (1021, 290)           | yellow `?` (1020, 290) |
| 20001 EPIC "In Search of the Ascension Mushroom", step 1 | Talk to Guard Bart, `NPC1071`                                                     | (952, 568)            | blue `?` (948, 568)    |
| 20402 EPIC "You can get stronger!", step 2               | Clear the dungeon, `EQ20402_03_Move_Check` (its entrance)                         | (342, 762)            | blue `?` (342, 765)    |

The same holds zoomed-out within 4 px. So **marks follow the current step, not the giver.** Quest 20402's giver is Anne in Orbis Castle, but its mark is at the dungeon entrance on Shaded Tree Hill.

**Steps with no place** (`on_world_map` = no, 413 of 2,394):

| Reason                                                                                                                  | Steps |
| ----------------------------------------------------------------------------------------------------------------------- | ----- |
| No `StepPosition`: `EVENT_TRIGGER` (cutscene steps)                                                                     | 125   |
| No `StepPosition`: `TUTORIAL_DLG` (the TUTORIAL quests)                                                                 | 62    |
| No `StepPosition`: other                                                                                                | 4     |
| `StepPosition` names an actor missing from `ActorPositionData`                                                          | 142   |
| Target inside a dungeon or instance map (600051, 10005, `subterranean_quarry_WP`, …) with no redirect row for the world | 80    |

The missing actors are mostly `MQ_61_*`–`MQ_69_*` and other late main-story overlap triggers. They are probably in a level whose actors were not exported.

Quests with no step on the map at all: the 63 TUTORIAL quests, 5 SUB test quests (`9000011`–`9000017`, "Test NPC"), MAIN 2, EPIC 1. One SUB quest has no steps.

### Which mark (read)

`MapButtonDesign` per step, against `QuestMainData.Category`:

| Category          | Map marks used                                   | Colour and kind (`WorldMapLegendData` / its string)                                       |
| ----------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `MAIN`            | `QuestMark_02` (all steps)                       | yellow, "Adventure Quests" (모험 의뢰, string 102217)                                     |
| `EPIC`            | `_04` (403 steps in `QuestStepData`), `_03` (27) | blue, "Bond Quest" (인연 의뢰, 102231)                                                    |
| `SUB`             | `_03`/`_04` (test quests only)                   | blue                                                                                      |
| `CHARACTER`       | `_06`                                            | purple, "Hero Quests" (영웅 의뢰, 102218)                                                 |
| `ADVENT_GRADE`    | `_10`                                            | orange, "Promotion Quest" (승급 의뢰, 102230)                                             |
| `TUTORIAL`        | none                                             | not on the map                                                                            |
| green `_07`/`_08` | used by no table                                 | probably dynamic or random requests (`DynamicQuest*` tables carry no mark), not confirmed |

**`!` and `?`:**
- Odd mark numbers are `!`, even ones `?` (the sprites: `checks/marks-sheet.png` in the earlier zip).
- In the tables, `!` appears on **step 0 of quests with `AcceptType` = `NPC`**: 28 EPIC quests (one a test quest, one only in `QuestStepData_Export`) and 5 test SUB quests. The one exception is EPIC 29001, which uses `_03` on its step 1. Step 0 is "talk to the giver", and its target is the giver. So a `!` marks a quest that can be taken from an NPC. Every later step, and every step of the `AUTO_ACCEPT` (MAIN, most EPIC, ADVENT_GRADE) and `UI_ACCEPT` (CHARACTER) quests, uses the `?`.
- There is no separate "ready to hand in" mark. The hand-in is simply the last step, usually a `TALK_TO_NPC`, still drawn as `?` at that NPC.
- **Not verified on screen.** By `PreQuestID` the save could accept 8 EPIC quests (20202–20209, Alvwyn's symbols), but all their givers are off-screen or under fog in both screenshots, and no `!` is visible. When `!` shows (prerequisites only, or also fog and level) is native code. A screenshot with a `!` would settle it.

**The gold `?` on a dark disc:** it is `QuestMark_02` itself. The sprite is a yellow `?` on a spiked gold badge, and nothing else is drawn under it (`checks/quest-marks-zoom.png`). It is the MAIN quest's current step, not a tracked-quest marker. In this save `USE_TRACKING` is 0 for all three held quests, so nothing on these screenshots is tracked. The dark disc next to the blue `?` in the zoomed-in shot is the gamepad cursor (`DUWG_MapVirtualCursorIcon`, earlier report).

`DUWG_MapPointIcon` has hidden tracking layers, probably the look of a tracked quest. Not seen in a screenshot:
- `Panel_Tracking_Bg`: `Gradation_03` tinted `#35BAD1` @ 70%, `Frame_Map_03`, a `Frame_Circle_20` ring at 40%, and the arrow `Icon_MapArrow_04`, at opacity 0.3.
- `Panel_WorldMap_Fx_Tracking` (Niagara `Fxw_UI_MapPoint01/02`).

Quest marks are on the `QUEST` layer, priority 80 (`WorldMapIconLayerData`), above every place icon (earlier report).

## 4. Place cards (read)

**The side panel** is `UI/Layer/LayerWorldMapInfoPopup`:
- `TextInfoPopupTitle`: the name.
- `TextInfoPopupDescTitle`: the area line ("Hill of Journey").
- `TextInfoPopupDesc`: the description.
- `ImgInfoPopupMark`, `ImgSubBg`: the picture.

The bottom-left "Orbis Castle / Progress 50%" is `DPanelWorldMap.WorldGroupText` and `WorldCompleteValueText`: the region (`WorldCompleteGroupData`) under the cursor and its completion.

**Warp points, statues, Eona's Legacy, Tower of Trials: all in `WayPointData.xml`.**

| Field                 | Column                                                      | Notes                                                                                                                                           |
| --------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                  | `Name` → string                                             | "Warp Point", "Statue of Organa", "Eona's Legacy", "Tower of Trials"                                                                            |
| Area line             | `WorldMapSectionID` → `MapSectionData.SectionName` → string | Can be an `AREA` (Hill of Journey) or a smaller `ZONE` (Fleecy Cloud Ranch). The Tower of Trials has none.                                      |
| Description           | `Description` → string                                      | Shown before activation: the broken statue "…so shattered that its form is barely recognizable", the dark legacy                                |
| Description when done | `Use_Description` → string                                  | Restored statue "A stone statue modeled after the goddess…" (the user's screenshot), lit legacy. Warp points and the tower have no second text. |
| Picture               | `MapInfoImgName`                                            | `World_MapInfo_Waypoint`, `_Statue`, `_Windmill`, `_TrialTower` (PNG in `textures/`)                                                            |

Example: statue 100001 → "Statue of Organa", area 101202 "Hill of Journey". Which text is shown in which state is inferred from the wording and the user's screenshot of a restored statue, not from code.

**Dungeons: `MapDungeonGroupData.xml`.**
- Name: `Name`. Description: `Desc`. Picture: `MapInfoImgName` (`World_MapInfo_Dungeon`, `_Cave`, …). Region: `FogSectionID`.
- **No area column.** `place-cards.csv` gives a guessed area: the `WORLDMAP_SECTION` polygon that contains the dungeon's map point, marked GUESS.
- The guess is weak: the same polygon test agrees with `WayPointData.WorldMapSectionID` for only 11 of the 19 warp points, statues and legacies whose section is an AREA. ZONE sections mostly have no polygon. The dungeon card may simply have no area line; a screenshot of one would tell.
- 40 of the 69 dungeon groups have no map point (dungeon floors and modes reached from another entrance).

## Open points

- **Label size and the zoom thresholds' exact boundary:** native code. The sizes above are measured.
- **When a `!` appears:** prerequisites are read; fog or level gating is not verified. There is no `!` in the screenshots.
- **The green marks `_07`/`_08`:** used by no table.
- **Dungeon cards' area line:** no source found.
- **Belos:** no labels in the tables, not checked in game.
- **New screenshots would close most of these:** level 1 and 2 zoom, a quest giver with `!`, a dungeon's card, and Belos.
