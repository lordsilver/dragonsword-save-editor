# Game rules

This page records what the editor knows about DragonSword Awakening's growth rules, where each rule comes from, and what is still open. A rule belongs here only when the game's own data or a screen in the game supports it. A guide, a wiki or a modded save is a lead, not a source.

The editor's limits fall into three groups:
- **Rules**: the game's own mechanics, with the source next to each.
- **Observed**: the largest value seen in the modded 100% save. These bound fields whose real cap is unknown.
- **Safety caps**: 32-bit bounds for fields with no observed range.

[The user guide](guide.md#value-limits) lists every limit the editor applies.

## Where the saves come from

A modder produced every save in the test set. Only `1000_Slot3.db` (the same file as the user's played `123456789_Slot3.db`) is game-written on top. The values in Slot4, Slot5 and the 100% save are the modder's choices, not game rules.

## Breakthrough and the Mercenary Corps grade

| Rule                                                                                                                             | Source                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tb_advent_status` is the Mercenary Corps: `ADV_GRADE` is its grade, `ADV_LEVEL` and `ADV_EXP` its level and EXP.                | Catalog item 1000201 is "Mercenary Corps Rank EXP" (`PAY_ADV_EXP`).                                                                                                                                        |
| There are five promotions, and each unlocks the next hero and karma breakthrough. Grade g allows breakthrough stages 0 to g − 1. | Official guides [3121](https://dragonsword.webzen.co.kr/gameinfo/guide/detail/3121) and [3158](https://dragonsword.webzen.co.kr/gameinfo/guide/detail/3158)                                                |
| A hero's own breakthrough (`ASCEND`) raises that hero's level cap. The grade only unlocks the next stage.                        | Official guide [3158](https://dragonsword.webzen.co.kr/gameinfo/guide/detail/3158)                                                                                                                         |
| A hero's breakthrough stage caps every skill's level.                                                                            | Official guide [3159](https://dragonsword.webzen.co.kr/gameinfo/guide/detail/3159)                                                                                                                         |
| Active and signal skills go up to 10 since the 19 Feb 2026 patch (7 before).                                                     | [Patch notes](https://dragonsword.webzen.co.kr/board/1076/detail/392159)                                                                                                                                   |
| Heroes and karma awaken (transcend) up to 6, whatever their stage.                                                               | Official guides [3160](https://dragonsword.webzen.co.kr/gameinfo/guide/detail/3160) and [3163](https://dragonsword.webzen.co.kr/gameinfo/guide/detail/3163)                                                |
| EXP gained past the level cap is refunded.                                                                                       | Official guides [3156](https://dragonsword.webzen.co.kr/gameinfo/guide/detail/3156) and [3163](https://dragonsword.webzen.co.kr/gameinfo/guide/detail/3163)                                                |
| Quest progress is stored: `tb_quest_complete` (category 1 is the main story, quest IDs from 10001) and `tb_quest_hold`.          | The saves. The played save has 10001–10012 complete and 10013 held. The 100% save has 10020, 10040, 10050, 10060 and 10080, which fits the five promotion quests if a quest's ID is 10000 plus its number. |

The fan [Mercenary Rank table](https://dragonswordawakening.net/records/mercenary-rank) lists five ranks, each reached by a main quest: Novice 20, Intermediate 40, Advanced 50, Elite 60 and Veteran 80. Grade 1 is most likely the stage before the first promotion, which makes grade 2 Novice and grade 6 Veteran: the played save is at grade 1 with quest 13 in progress, holds no corps title, and has `tb_mercenary_trainee_mission` rows. Titles 2104100–2104104 are Novice through Veteran Mercenary Corps. The editor shows no rank names until the game's screen confirms them (Q5).

## What the editor does with these rules

- **The grade is read-only.** It follows the promotion quests. Lowering it would contradict them, the difficulty columns and any hero ascended past the new limit, and nothing shows that the game would promote again. The raw browser needs advanced editing to change `ADV_GRADE`.
- **Growth caps are per row.** A hero's or karma's stage is its `ASCEND`, clamped to 0 to grade − 1. That stage's row gives the level, EXP and skill caps. The ascension cap is grade − 1, and awakening caps at 6.
- **A breakthrough cannot drop below what the row needs.** A hero at level 35 needs stage 2, so the editor refuses to lower its `ASCEND` below 2 until the level comes down. Karma has no level column, so its EXP stands in.
- **Existing values above a cap stay editable**, because every setter uses `max(limit, current)`.

The interim stage table, until the game's own tables replace it:

| Stage | Level cap | EXP cap   | Active skills (1–4) | Basic skills (5–7) | Status                                                                                          |
| ----- | --------- | --------- | ------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| 0     | 20        | 76,900    | 3                   | 3                  | Level and active cap fit guides and NamuWiki. Basic cap unverified. EXP is the lower candidate. |
| 1     | 30        | 273,500   | 5                   | 5                  | EXP unverified                                                                                  |
| 2     | 40        | 619,000   | 7                   | 7                  | EXP unverified                                                                                  |
| 3     | 50        | 1,175,000 | 9                   | 7                  | EXP unverified                                                                                  |
| 4     | 60        | 1,991,500 | 10                  | 7                  | EXP unverified                                                                                  |
| 5     | 70        | 3,118,500 | 10                  | 7                  | Level 70 or 80 disputed (Q1). EXP unverified.                                                   |

The special skill slot 801 caps at 1. Karma uses the hero rows until its own table is known (Q4).

### Where the EXP numbers came from

The stage 1–5 EXP values (273,500 to 3,118,500) and the old stage-0 value of 88,500 came into the code as a pasted table with no stated source. They are not in the bundled catalog data. Read as running totals, 88,500 and 3,118,500 come out one level past the cap: the modder's saves give every level-20 hero 76,900 EXP and every level-70 hero 2,990,400. If the table lists the EXP needed for the next level, the running-total cap for level N is the entry listed for N − 1. Stage 0 now uses 76,900, the lower candidate.

## Open questions

| #   | Question                                                                                 | Decisive check                                                              | Until then                                                                                   |
| --- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Q1  | What is the hero level cap at each breakthrough stage, and is stage 5 at 70 or 80?       | The game's breakthrough table, or the breakthrough screen of a stage-4 hero | Keep 70. July 2026 guides (games.gg, allthings.how, Destructoid) say 80; the modder used 70. |
| Q2  | Is EXP a running total or progress within the level, and what is the level-to-EXP table? | The game's level table, or Reina's EXP bar                                  | Running total is likely (see the observations below). Stage 0 caps at 76,900.                |
| Q3  | What are the per-stage caps for active skills (1–4) and basic skills (5–7)?              | The game's skill table, or the skill screen at stage 0                      | Active 3/5/7/9/10/10; basic is the smaller of the active cap and 7.                          |
| Q4  | What are karma's level caps and EXP at each karma breakthrough?                          | The game's karma tables                                                     | The hero rows, unverified.                                                                   |
| Q5  | Which rank name goes with each `ADV_GRADE`?                                              | The Mercenary Corps screen                                                  | No rank names shown.                                                                         |
| Q6  | Does the game promote again after the grade is lowered?                                  | Not worth testing                                                           | The grade is read-only.                                                                      |
| Q7  | Will the game load a save the editor wrote at all?                                       | The in-game test gates                                                      | Don't edit the real save.                                                                    |
| Q8  | What do `HP`, `TRANSCEND_TOTAL`, `SOLDIER_GRADE` and `SOLDIER_GRADE_POINT` mean?         | `dsgamedb_sqlite.sql` and the XML tables in the paks                        | Leave them as they are.                                                                      |

The game's own rule tables are in its pak files, one XML file per table under `DS/Content/__GeneratedGameData__/Server/XML/GameData/`, next to `dsgamedb_sqlite.sql`, a dump of the server database. Extracting them answers Q1–Q4 and Q8.

## Observations

Each entry gives the date, the game version where known, and what was seen.

### 2026-10-26: level and EXP in the game-written save (read-only SQL)

`1000_Slot3.db`, game version not recorded. Heroes by level and EXP:

| Level | EXP   | Heroes           |
| ----- | ----- | ---------------- |
| 1     | 0     | 7                |
| 2     | 170   | 2                |
| 3     | 595   | 2                |
| 5     | 1,700 | 2                |
| 5     | 2,465 | 1 (Reina, 10004) |

Pairs of heroes sit on exactly the same EXP at the same level, which looks like level thresholds: 170 to reach level 2, 595 for level 3, 1,700 for level 5. That supports the running-total reading of Q2, but it is not decisive. The in-game check: if Reina's bar shows 2,465 as her current EXP, EXP is per level; if it shows 765 (2,465 − 1,700), EXP is a running total.

### In-game checks still to do

On a copy of the played save, without editing:
1. The rank name the Mercenary Corps screen shows at grade 1 (Q5).
2. Reina's and Charlotte's level-5 EXP bars as numbers (Q2).
3. One hero's breakthrough screen: the next cap and what it requires (Q1).
4. The max level of an active and a basic skill at breakthrough 0 (Q3).
5. The game version.
