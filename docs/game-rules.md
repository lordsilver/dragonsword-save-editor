# Game rules

This page records what the editor knows about DragonSword Awakening's growth rules, where each rule comes from, and what is still open. A rule belongs here only when the game's own data or a screen in the game supports it. A guide, a wiki or a modded save is a lead, not a source.

The editor's limits fall into three groups:
- **Rules**: the game's own tables, generated into `crates/core/data/growth.json`.
- **Observed**: the largest value seen in the modded 100% save. These bound fields whose real cap is unknown.
- **Safety caps**: 32-bit bounds for fields with no observed range.

[The user guide](guide.md#value-limits) lists every limit the editor applies.

## Where the rules come from

The game ships its rule tables as XML, one file per table, under `DS/Content/__GeneratedGameData__/Server/XML/GameData/` in its paks. They were extracted on 2026-10-26 from an install whose only version marker is a `v1.1.1.xxh128` checksum file, so the game version is unconfirmed.

`scripts/gen-growth.mjs` reads the tables and writes only the numbers the editor needs to `growth.json`. The extracted XML is never committed. To regenerate after a game update:

```bash
node scripts/gen-growth.mjs <extract-dir> "<game version>"
cargo test -p dsa-core --lib growth
```

The generator stops on any table that breaks an assumption below, and the `growth` unit tests pin key rows, so a changed rule fails loudly instead of slipping in.

| Table                                              | Gives                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `PCCharacterLevelData`                             | Hero EXP per level (100 levels; EPIC and LEGENDARY heroes share one table)                     |
| `KarmaLevelData`, `KarmaData`                      | Karma EXP per level for each rarity (RARE, EPIC, LEGENDARY), and each karma's rarity           |
| `PCSkillGrowthData`                                | The breakthrough each skill level needs, per skill type, and the content version that added it |
| `AdventLevelData`                                  | Mercenary Corps EXP per level                                                                  |
| `AdventGradeData`, `StringData`                    | Each grade's promotion quest, the breakthroughs it unlocks, its title and its rank name        |
| `LocalizingControlData_*`, `LocalizingVersionData` | Each region's live limits and content version                                                  |
| `PCCharacterTranscendData`, `KarmaTranscendData`   | Awakening steps (1–6)                                                                          |

## The rules

**EXP is a running total.** `CharacterExp` at level N is the EXP that ends level N, so a hero at level N holds between the entries for N − 1 and N. The game-written save fits exactly: level 2 heroes at 170 (150–399), level 3 at 595 (400–899), level 5 at 1,700 and 2,465 (1,600–2,599). Karma and the corps work the same way. The game refunds EXP past the level cap, so a hero at its cap sits at that level's start: 76,900 at level 20, 2,990,400 at level 70.

**The grade unlocks breakthroughs; each row's breakthrough sets its caps.** Each grade's `CharacterAscendExpand` and `KarmaAscendExpand` are grade − 1. A hero's or karma's stage is its own `ASCEND`, clamped to what the grade unlocks.

| Grade | Rank         | Promotion quest | Unlocks breakthrough | Title   |
| ----- | ------------ | --------------- | -------------------- | ------- |
| 1     | Apprentice   | —               | 0                    | —       |
| 2     | Novice       | 40001           | 1                    | 2104100 |
| 3     | Intermediate | 40011           | 2                    | 2104101 |
| 4     | Advanced     | 40021           | 3                    | 2104102 |
| 5     | Elite        | 40031           | 4                    | 2104103 |
| 6     | Veteran      | 40041           | 5                    | 2104104 |

The promotion quests are category `ADVENT_GRADE` in `QuestMainData`. A save records them in `tb_quest_complete` with category 7: the 100% save has all five, the played save none.

**Level cap per breakthrough: 20 + 10 × stage.** No table holds it directly. The generator checks it against every region's live maximum (level 60 at breakthrough 4, level 70 at breakthrough 5), and it matches the official guides and NamuWiki for stages 0–4. Karma uses the same caps; its live maxima are the same as the heroes'.

**Skill caps per breakthrough**, from `PCSkillGrowthData`. Every hero follows the same rows:

| Breakthrough | Active (1–4), Korea | Active (1–4), global | Basic (5–7) | 8 and 801 |
| ------------ | ------------------- | -------------------- | ----------- | --------- |
| 0            | 3                   | 3                    | 3           | 1         |
| 1            | 5                   | 5                    | 5           | 1         |
| 2            | 7                   | 7                    | 7           | 1         |
| 3            | 9                   | 7                    | 7           | 1         |
| 4            | 10                  | 7                    | 7           | 1         |
| 5            | 10                  | —                    | 7           | 1         |

Active levels 8–10 belong to content version `M11_3`, which only Korea runs. That matches the 19 Feb 2026 Korean patch notes that raised active skills from 7 to 10. Skill type 8 exists in the game data for every hero, but no save in the test set has a type-8 row, so the editor still accepts only 1–7 and 801.

**Region limits** on the live servers (`LIVE` column):

| Limit                       | Korea | Global (America, Europe, Asia) | DEV                     |
| --------------------------- | ----- | ------------------------------ | ----------------------- |
| Content version             | M11_3 | M11_2                          | —                       |
| Hero and karma level        | 70    | 60                             | 70 (Korea), 80 (global) |
| Hero and karma breakthrough | 5     | 4                              | 5 (Korea), 6 (global)   |
| Mercenary Corps grade       | 6     | 5                              | 6                       |
| Mercenary Corps level       | 50    | 50                             | 80                      |

The guides' "level 80 after five breakthroughs" matches the global DEV setting, not a live server. The 100% save's corps level 80 and grade 6 are DEV or Korean values.

**Awakening** caps at 6 for heroes and karma (`PCCharacterTranscendData`, `KarmaTranscendData`).

## What the editor does

- **It applies the global limits.** A save does not record its region, so the editor uses the lower profile. A Korean save above it, or a modded one, stays editable at its current values, because every setter uses `max(limit, current)`. Switching is one constant, `growth::REGION`.
- **The grade is read-only.** It follows the promotion quests. Lowering it would contradict them, the difficulty columns and any hero ascended past the new limit. The raw browser needs advanced editing to change `ADV_GRADE`. The Overview shows the rank name and how many promotion quests the save records.
- **EXP follows the level.** Setting a hero's or the corps' level writes the EXP that starts it, and EXP edits stay inside the current level. Karma has no level column, so its EXP is capped at the start of its level cap, from its rarity's table. An unknown karma gets the RARE table, the tightest one.
- **A breakthrough cannot drop below what the row needs.** A hero at level 35 needs breakthrough 2, so the editor refuses a lower `ASCEND` until the level comes down. Karma uses the level its EXP reaches.

## Open questions

| #   | Question                                                                         | Status                                                                                             |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Q1  | Hero level cap at each breakthrough                                              | Answered: 20 + 10 × stage, up to 60 (global) or 70 (Korea).                                        |
| Q2  | Is EXP a running total, and what is the table?                                   | Answered: running total, `PCCharacterLevelData`.                                                   |
| Q3  | Skill caps per stage                                                             | Answered: `PCSkillGrowthData`, above.                                                              |
| Q4  | Karma level and EXP caps                                                         | Answered: hero level caps, with `KarmaLevelData` EXP per rarity.                                   |
| Q5  | Rank name per grade                                                              | Answered: `AdventGradeData` and `StringData`, above.                                               |
| Q6  | Does the game promote again after the grade is lowered?                          | Not worth testing. The grade is read-only.                                                         |
| Q7  | Will the game load a save the editor wrote at all?                               | Open. The in-game test gates decide it; don't edit the real save before they pass.                 |
| Q8  | What do `HP`, `TRANSCEND_TOTAL`, `SOLDIER_GRADE` and `SOLDIER_GRADE_POINT` mean? | Open. `dsgamedb_sqlite.sql` is the schema only, and `SoldierGradeData` has no grades.              |
| Q9  | Which region does the user's game run?                                           | Open. It only matters from breakthrough 3 up, where active skills and the top breakthrough differ. |

## Observations

Each entry gives the date, the game version where known, and what was seen.

### 2026-10-26: level and EXP in the game-written save (read-only SQL)

`1000_Slot3.db`, game version not recorded. Heroes by level and EXP:

| Level | EXP   | Heroes           | Level range from the table |
| ----- | ----- | ---------------- | -------------------------- |
| 1     | 0     | 7                | 0–149                      |
| 2     | 170   | 2                | 150–399                    |
| 3     | 595   | 2                | 400–899                    |
| 5     | 1,700 | 2                | 1,600–2,599                |
| 5     | 2,465 | 1 (Reina, 10004) | 1,600–2,599                |

The corps is at level 3 with 1,800 EXP, inside `AdventLevelData`'s 1,650–2,549.

### In-game checks still to do

On a copy of the played save, without editing:
1. The rank name on the Mercenary Corps screen; the tables say Apprentice.
2. Reina's level-5 EXP bar; the table predicts 865 of 1,000 into the level (2,465 − 1,600), if the bar shows progress within the level.
3. The game version and region (Q9).
