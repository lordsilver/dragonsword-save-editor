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

**Promotions follow the main story.** Each promotion exam waits for the previous exam and one main quest (`PreQuestID` in `QuestMainData`). The game numbers its 80 main quests in order, but the IDs skip between chapters: quest 21 is 10031. The fan [Mercenary Rank table](https://dragonswordawakening.net/records/mercenary-rank)'s quest numbers are these in-game numbers.

| Exam         | Quest | Unlocks after main quest                                            |
| ------------ | ----- | ------------------------------------------------------------------- |
| Novice       | 40001 | 20, The Hero's Quest (10020)                                        |
| Intermediate | 40011 | 40, The Coming Crisis (10050)                                       |
| Advanced     | 40021 | 50, Everyone's Preparations (10060)                                 |
| Elite        | 40031 | 60, The Life of a Mercenary (10070)                                 |
| Veteran      | 40041 | 80, If He Becomes a Hero (10090, the epilogue; content version M12) |

The Overview shows the main quest in progress and what the next promotion waits for. The played save has quests 1–12 done and 13, The Sixth Hero, in progress, so the Novice exam opens after quest 20.

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

The guides' "level 80 after five breakthroughs" matches the global DEV setting, not a live server. The 100% save's corps level 80 is a DEV value.

DragonSword began as an online free-to-play game in Korea, and the Steam release (23 July 2026) is an offline single-player, buy-to-play version of it. Its data still carries every region's settings, so the region tables above describe the old live servers rather than the offline game. The offline game caps heroes at level 70 (seen in game, 2026-10-26), which matches the Korean profile.

**Awakening** caps at 6 for heroes and karma (`PCCharacterTranscendData`, `KarmaTranscendData`).

## Completing a quest

Completing a quest in the editor writes what the game writes. Five snapshots of a new game (2026-10-26), taken by the user as it played quests 1–5, show each change, and two replays confirm the editor matches: from snapshot 2, completing quests 2–4 in the editor gives the same quest, reward and hero tables as the game's snapshot 3, and from snapshot 3, completing quest 5 matches snapshot 4. Only play time, position, field drops and achievement counters differ.

| Write                                                                                                                                                                                                      | Source                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tb_quest_complete` row with the category code: main 1, epic 3, promotion 7, tutorial 12, character 14                                                                                                     | The 100% save's completed quests, matched against `QuestMainData`; the snapshots                                                                      |
| The quest leaves `tb_quest_hold`, and auto-accepted quests whose prerequisites are now complete start at their first step with `USE_TRACKING` 0                                                            | Snapshots; `PreQuestID`, `AcceptType`, `AcceptCondition`, `AdvLevel`, `QuestStepData`                                                                 |
| Gold, stackable items, dishes, mounts, titles and heroes from the quest's reward columns, handed out directly                                                                                              | Snapshots: quests 4 and 5                                                                                                                             |
| Corps EXP is added as a running total and the corps levels up, but each level's reward is claimed by the player on the Mercenary Corps screen, recorded in `tb_reward_step` (type 2, last level claimed)   | Snapshots 3–5                                                                                                                                         |
| Lasting quest actions: a hero joining (`TEAMSETTING_CHARACTER`), a tutorial completing (`TUTORIAL_DLG_COMPLITE`), a quest item removed (`DELETE_ITEM`)                                                     | `QuestActionData`; snapshots: quest 2 completes tutorial 90027, quest 5 brings Aria                                                                   |
| A promotion exam sets `ADV_GRADE`, unlocks the grade's title and mount (`AdventGradeData` items), and moves `CUR_ADV_DIFFICULTY` and `ORIGIN_ADV_DIFFICULTY` with the grade when they sat at the old grade | Grade and items from `AdventGradeData`. The difficulty is inferred: every save seen has difficulty equal to grade. No snapshot covers a promotion yet |

The game does not write `tb_completed_quest` when it completes a quest. Quest-record card rewards (`QuestRecordData`, `tb_quest_record_reward`) are left for the player to claim in game. Cutscenes, scenario dungeons and world events are skipped.

## Heroes

- **Story heroes are seeded.** A new save already holds rows for Lute, Castella and Aria (`tb_init_character`'s NORMAL account). Lute starts at HP 461; Castella and Aria sit at HP 999999 until their quest, when the game sets HP 461 and puts them in the first empty slot of team page 0. The editor shows a 999999 hero as "not joined yet".
- **A recruited hero gets a new row**: level 1, EXP 0, breakthrough 0, HP 461, `CREATED_DATE` the local time. Snapshot 5 shows it for Reina, bought in the shop.
- **HP is current health.** Lute's HP falls as he takes damage; every hero joins at 461.
- **The roster** comes from `GameItemData`: a hero item (`ItemType` CHARACTER) names its hero in `Value1`, and redeeming it is how a hero joins. The editor recruits only the 19 heroes the game hands out: the 11 shop heroes (Fate's Invitation, `BMGoodsData_*`), 6 quest-reward heroes and the 2 story heroes. Heroes `PCCharacterData` marks playable but nothing hands out (Ropie, Ysera, Ewald, Veronica, Awakening Lute, Karina, Viola) are not offered.
- **The shop also counts the purchase** in `tb_bm_shop_cnt`. The editor does not, so a recruited shop hero may still show in the shop.

## Item instance IDs

Equipment, gems, karma and dishes use 64-bit instance IDs: the upper 32 bits are `0x01058000` plus a counter for items created in the same second, and the lower 32 bits are the creation time in UTC seconds. `CREATED_DATE` holds the same moment in local time. Mounts and costumes use random 32-bit IDs. A dish is one live `tb_cook_item` row per dish, whose `STACK_CNT` grows.

## What the editor does

- **It applies the Korean limits**: breakthrough 5, hero level 70, grade 6, and active skills up to 10. They match the offline game's level cap of 70. A modded save above them stays editable at its current values, because every setter uses `max(limit, current)`. The profile is one constant, `growth::REGION`.
- **The grade is read-only.** It follows the promotion quests. Lowering it would contradict them, the difficulty columns and any hero ascended past the new limit. The raw browser needs advanced editing to change `ADV_GRADE`. The Overview shows the rank name and how many promotion quests the save records.
- **EXP follows the level.** Setting a hero's or the corps' level writes the EXP that starts it, and EXP edits stay inside the current level. Karma has no level column, so its EXP is capped at the start of its level cap, from its rarity's table. An unknown karma gets the RARE table, the tightest one.
- **A breakthrough cannot drop below what the row needs.** A hero at level 35 needs breakthrough 2, so the editor refuses a lower `ASCEND` until the level comes down. Karma uses the level its EXP reaches.

## Open questions

| #   | Question                                                                         | Status                                                                                |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Q1  | Hero level cap at each breakthrough                                              | Answered: 20 + 10 × stage, up to 60 (global) or 70 (Korea).                           |
| Q2  | Is EXP a running total, and what is the table?                                   | Answered: running total, `PCCharacterLevelData`.                                      |
| Q3  | Skill caps per stage                                                             | Answered: `PCSkillGrowthData`, above.                                                 |
| Q4  | Karma level and EXP caps                                                         | Answered: hero level caps, with `KarmaLevelData` EXP per rarity.                      |
| Q5  | Rank name per grade                                                              | Answered: `AdventGradeData` and `StringData`, above.                                  |
| Q6  | Does the game promote again after the grade is lowered?                          | Not worth testing. The grade is read-only.                                            |
| Q7  | Will the game load a save the editor wrote at all?                               | Open. The in-game test gates decide it; don't edit the real save before they pass.    |
| Q8  | What do `HP`, `TRANSCEND_TOTAL`, `SOLDIER_GRADE` and `SOLDIER_GRADE_POINT` mean? | Open. `dsgamedb_sqlite.sql` is the schema only, and `SoldierGradeData` has no grades. |
| Q9  | Which region's limits does the offline game use?                                 | Answered: Korea's. The offline game caps heroes at level 70.                          |

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
3. The game version.
