//! Typed, game-oriented views over an open save, plus the mutations the UI
//! exposes. Every mutation marks the session dirty; nothing touches the
//! encrypted file until the user saves.

use std::collections::HashMap;

use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;

use crate::catalog::{Catalog, EffectText, Item, TitleStat};
use crate::error::{Error, Result};
use crate::growth::{self, Growth, REGION};
use crate::save::SaveSession;

// Hero, karma and Mercenary Corps growth follows the game's own tables in
// `growth`. Each hero's and karma's breakthrough stage (`ASCEND`) caps its
// level, EXP and skills; the Mercenary Corps grade only unlocks stages.

const MAX_CHARACTER_HP: i64 = 22_229;
const MAX_ENCHANT: i64 = 15;
const MAX_EQUIP_EXP: i64 = 90_000;
/// Gold's balance in the reference save. Every other currency gets a safety
/// cap instead; Aether Crystals is premium currency and was zero everywhere.
const MAX_AMOUNT: i64 = 47_451_809;
const MAX_STACK: i64 = 61_525;
/// The highest cooked-dish count in the 100% save. A dish is not a material
/// stack, so it gets its own ceiling.
const MAX_DISH: i64 = 203;

// Safety caps, not claims about the game's limits. The reference save cannot
// bound the fields that are zero in every row, play time has no observed
// ceiling, and raw stat data has no known range.
const MAX_POINTS: i64 = 999_999_999;
const MAX_STAT: i64 = 2_147_483_647;
const MAX_CURRENCY_SAFETY: i64 = i32::MAX as i64;
const MAX_PLAY_TIME: i64 = i32::MAX as i64;
const MAX_TRANSCEND_TOTAL: i64 = 99;
const MAX_SOLDIER_GRADE: i64 = 99;

/// The only skill type values the game writes: regular slots 1–7 and 801.
const SKILL_TYPES: [i64; 8] = [1, 2, 3, 4, 5, 6, 7, 801];

const GOLD_CID: i64 = 1_000_001;

/// A new save carries rows for the heroes who join during the story, with
/// this HP until they do. Snapshots of a new game show Castella and Aria at
/// 999999 until their quests, then at 461.
const UNJOINED_HP: i64 = 999_999;
/// The HP every hero row gets when the hero joins, in every snapshot.
const STARTING_HP: i64 = 461;
/// The upper 32 bits of an item instance ID the game mints: this prefix plus
/// a counter for items minted in the same second. The lower 32 bits are the
/// creation time in UTC seconds.
const ITEM_ID_PREFIX: i64 = 0x0105_8000;

fn currency_limit(cid: i64) -> i64 {
    if cid == GOLD_CID {
        MAX_AMOUNT
    } else {
        MAX_CURRENCY_SAFETY
    }
}

/// Item kinds where a large stack is ordinary inventory. Everything else —
/// quests, maps, achievement points and master souls — is progress data, and
/// Fill must not touch it.
fn fillable_kind(kind: &str) -> bool {
    matches!(
        kind,
        "COMMON" | "COOKING_INGREDIENT" | "GEM_SOCKET_MATERIAL" | "CHANGE_EQUIPMENT_SUB_STAT"
    ) || kind.ends_with("_EXP")
}

/// One open save, viewed through the catalog.
pub struct Game<'a> {
    session: &'a mut SaveSession,
    catalog: &'a Catalog,
    user_id: i64,
}

impl<'a> Game<'a> {
    pub fn new(session: &'a mut SaveSession, catalog: &'a Catalog) -> Self {
        let user_id = session.user_id();
        Self {
            session,
            catalog,
            user_id,
        }
    }

    fn conn(&self) -> &Connection {
        self.session.conn()
    }

    fn touch(&mut self) {
        self.session.touch();
    }

    /// Read the value a setter is about to replace. Limits are observations,
    /// not game rules, so a save that already exceeds one stays editable.
    fn current_i64(&self, sql: &str, params: impl rusqlite::Params) -> Result<Option<i64>> {
        Ok(self
            .conn()
            .query_row(sql, params, |row| row.get(0))
            .optional()?)
    }

    /// A hero's level, EXP and breakthrough stage, which together bound every
    /// growth edit on that hero.
    fn character_growth(&self, cid: i64) -> Result<(i64, i64, i64)> {
        self.conn()
            .query_row(
                "SELECT LEVEL, EXP, ASCEND FROM tb_character WHERE USER_DBID=? AND CHARACTER_CID=?",
                params![self.user_id, cid],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?
            .ok_or_else(|| Error::invalid("that character is not owned in this save"))
    }

    pub fn catalog(&self) -> &Catalog {
        self.catalog
    }

    // ---------------------------------------------------------------- overview

    pub fn overview(&self) -> Result<Overview> {
        let user = self.conn().query_row(
            "SELECT USER_DBID, REGION_CID, SECTION_UID, POS_X, POS_Y, POS_Z,
                    CUR_STAMINA, REWARD_MAX_STAMINA, TITLE_CID,
                    LAST_LOGIN_TIME, LAST_LOGOUT_TIME, CREATE_DATE
               FROM tb_user LIMIT 1",
            [],
            |row| {
                Ok(OverviewUser {
                    account_id: row.get(0)?,
                    region_cid: row.get(1)?,
                    section_uid: row.get(2)?,
                    position: [row.get(3)?, row.get(4)?, row.get(5)?],
                    stamina: row.get(6)?,
                    max_stamina: row.get(7)?,
                    title_cid: row.get(8)?,
                    last_login: row.get(9)?,
                    last_logout: row.get(10)?,
                    created_at: row.get(11)?,
                })
            },
        )?;

        let advent = self
            .conn()
            .query_row(
                "SELECT ADV_GRADE, ADV_LEVEL, ADV_EXP, NICK_NAME, PLAY_TIME
                   FROM tb_advent_status WHERE USER_DBID=?",
                params![self.user_id],
                |row| {
                    Ok(AdventStatus {
                        grade: row.get(0)?,
                        level: row.get(1)?,
                        exp: row.get(2)?,
                        name: row.get(3)?,
                        play_time: row.get(4)?,
                    })
                },
            )
            .optional()?
            .unwrap_or_default();

        let growth = Growth::shared();
        let rank = growth.grade(advent.grade);
        Ok(Overview {
            account_id: user.account_id,
            player_name: advent.name,
            adventure_grade: advent.grade,
            adventure_level: advent.level,
            adventure_exp: advent.exp,
            play_time: advent.play_time,
            region_cid: user.region_cid,
            section_uid: user.section_uid,
            stamina: user.stamina,
            max_stamina: user.max_stamina,
            title_cid: user.title_cid,
            created_at: user.created_at,
            last_login: user.last_login,
            last_logout: user.last_logout,
            position: user.position,
            counts: self.counts()?,
            currencies: self.currencies()?,
            max_ascend: self.max_ascend()?,
            adventure_rank_en: rank.map_or_else(String::new, |row| row.name_en.clone()),
            adventure_rank_fr: rank.map_or_else(String::new, |row| row.name_fr.clone()),
            promotions_completed: self.promotions_completed()?,
            story: self.story(advent.grade)?,
            promotions_total: growth.promotion_quests(REGION).len() as i64,
            adventure_limits: corps_limits(advent.level, advent.exp),
        })
    }

    fn counts(&self) -> Result<Counts> {
        let count = |sql: &str| -> Result<i64> {
            Ok(self
                .conn()
                .query_row(sql, params![self.user_id], |row| row.get(0))?)
        };
        let title_bits = self.bitmask_map("tb_title")?;
        let switch_bits = self.bitmask_map("tb_switch")?;
        let titles_unlocked = self
            .catalog
            .titles()
            .iter()
            .filter(|title| bit_is_set(&title_bits, title.id / 64, title.id % 64))
            .count() as i64;
        let recipes_known = self
            .catalog
            .recipes()
            .iter()
            .filter(|recipe| bit_is_set(&switch_bits, recipe.key / 64, recipe.key % 64))
            .count() as i64;
        Ok(Counts {
            characters: count("SELECT count(*) FROM tb_character WHERE USER_DBID=?")?,
            currencies: count("SELECT count(*) FROM tb_currency WHERE USER_DBID=?")?,
            stackables: count("SELECT count(*) FROM tb_stackable_item WHERE USER_DBID=?")?,
            equipment: count(
                "SELECT count(*) FROM tb_equipment WHERE USER_DBID=? AND DELETED_DATE=0",
            )?,
            gems: count("SELECT count(*) FROM tb_gem WHERE USER_DBID=? AND DELETED_DATE=0")?,
            karma: count("SELECT count(*) FROM tb_karma WHERE USER_DBID=? AND DELETED_DATE=0")?,
            costumes: count("SELECT count(*) FROM tb_costume WHERE USER_DBID=?")?,
            mounts: count("SELECT count(*) FROM tb_vehicle WHERE USER_DBID=?")?,
            titles_unlocked,
            titles_total: self.catalog.titles().len() as i64,
            recipes_known,
            recipes_total: self.catalog.recipes().len() as i64,
            quests_completed: count("SELECT count(*) FROM tb_completed_quest WHERE USER_DBID=?")?,
        })
    }

    pub fn set_player_name(&mut self, name: &str) -> Result<()> {
        let name = name.trim();
        if name.is_empty() || name.chars().count() > 32 {
            return Err(Error::invalid("player name must be 1–32 characters"));
        }
        self.conn().execute(
            "INSERT INTO tb_advent_status (USER_DBID, NICK_NAME) VALUES (?,?)
             ON CONFLICT(USER_DBID) DO UPDATE SET NICK_NAME=excluded.NICK_NAME",
            params![self.user_id, name],
        )?;
        self.touch();
        Ok(())
    }

    /// The highest breakthrough stage the save's Mercenary Corps grade unlocks,
    /// which is also every hero's and karma's ascension cap.
    pub fn max_ascend(&self) -> Result<i64> {
        Ok(Growth::shared().max_character_stage(self.adventure_grade()?, REGION))
    }

    /// Quest IDs from one quest table, or none when the save lacks it.
    fn quest_ids(&self, table: &str, extra: &str) -> Result<Vec<i64>> {
        let exists: i64 = self.conn().query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?",
            [table],
            |row| row.get(0),
        )?;
        if exists == 0 {
            return Ok(Vec::new());
        }
        let mut statement = self.conn().prepare(&format!(
            "SELECT QUEST_CID FROM {table} WHERE USER_DBID=? {extra}"
        ))?;
        let rows = statement.query_map(params![self.user_id], |row| row.get(0))?;
        Ok(rows.collect::<std::result::Result<Vec<i64>, _>>()?)
    }

    /// Where the save is in the main story, and what the next promotion
    /// exam waits for.
    fn story(&self, grade: i64) -> Result<Story> {
        let growth = Growth::shared();
        let complete = self.quest_ids("tb_quest_complete", "")?;
        let held = self.quest_ids("tb_quest_hold", "")?;
        let quests = growth.main_quests();
        let done = |id: i64| complete.contains(&id);
        let completed = quests.iter().filter(|quest| done(quest.id)).count() as i64;
        // The quest in progress, or else the first one not done yet.
        let current = quests
            .iter()
            .find(|quest| held.contains(&quest.id))
            .or_else(|| quests.iter().find(|quest| !done(quest.id)))
            .cloned();
        let next_promotion = growth
            .grade(grade + 1)
            .filter(|next| next.grade <= growth.region(REGION).max_advent_grade)
            .and_then(|next| {
                let quest = growth.main_quest(next.requires_main_quest?)?.clone();
                Some(NextPromotion {
                    grade: next.grade,
                    rank_en: next.name_en.clone(),
                    rank_fr: next.name_fr.clone(),
                    story_done: done(quest.id),
                    requires: quest,
                })
            });
        Ok(Story {
            completed,
            total: quests.len() as i64,
            current,
            next_promotion,
        })
    }

    /// How many of the region's promotion quests the save records as done.
    fn promotions_completed(&self) -> Result<i64> {
        let quests = Growth::shared().promotion_quests(REGION);
        let exists: i64 = self.conn().query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='tb_quest_complete'",
            [],
            |row| row.get(0),
        )?;
        if exists == 0 || quests.is_empty() {
            return Ok(0);
        }
        let list = quests
            .iter()
            .map(i64::to_string)
            .collect::<Vec<_>>()
            .join(",");
        Ok(self.conn().query_row(
            &format!(
                "SELECT count(*) FROM tb_quest_complete WHERE USER_DBID=? AND QUEST_CID IN ({list})"
            ),
            params![self.user_id],
            |row| row.get(0),
        )?)
    }

    fn adventure_grade(&self) -> Result<i64> {
        Ok(self
            .conn()
            .query_row(
                "SELECT ADV_GRADE FROM tb_advent_status WHERE USER_DBID=?",
                params![self.user_id],
                |row| row.get(0),
            )
            .optional()?
            .unwrap_or(0))
    }

    pub fn set_adventure(&mut self, field: &str, value: i64) -> Result<()> {
        let (column, configured_max) = match field {
            // The grade follows the promotion quests recorded in
            // tb_quest_complete. Lowering it would contradict them, the
            // difficulty columns and any hero ascended past the new limit,
            // and nothing shows the game would promote again.
            "grade" => {
                return Err(Error::invalid(
                    "the Mercenary Corps grade follows quest progress and is read-only",
                ));
            }
            "level" | "exp" => return self.set_corps_growth(field, value),
            "playTime" => ("PLAY_TIME", MAX_PLAY_TIME),
            _ => return Err(Error::invalid(format!("unknown adventure field {field:?}"))),
        };
        let current = self
            .current_i64(
                &format!("SELECT {column} FROM tb_advent_status WHERE USER_DBID=?"),
                params![self.user_id],
            )?
            .unwrap_or(0);
        let max = configured_max.max(current);
        if !(0..=max).contains(&value) {
            return Err(Error::invalid(format!(
                "{field} must be between 0 and {max}"
            )));
        }
        self.conn().execute(
            &format!("UPDATE tb_advent_status SET {column}=? WHERE USER_DBID=?"),
            params![value, self.user_id],
        )?;
        self.touch();
        Ok(())
    }

    fn corps_status(&self) -> Result<(i64, i64)> {
        Ok(self
            .conn()
            .query_row(
                "SELECT ADV_LEVEL, ADV_EXP FROM tb_advent_status WHERE USER_DBID=?",
                params![self.user_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?
            .unwrap_or((1, 0)))
    }

    /// Corps level and EXP move together, like a hero's: setting the level
    /// writes the EXP that starts it, and EXP stays inside the level.
    fn set_corps_growth(&mut self, field: &str, value: i64) -> Result<()> {
        let (level, exp) = self.corps_status()?;
        let limits = corps_limits(level, exp);
        if field == "level" {
            let max = limits.level.max(level);
            if !(1..=max).contains(&value) {
                return Err(Error::invalid(format!("level must be between 1 and {max}")));
            }
            if value != level {
                let start = growth::start_exp(Growth::shared().advent_exp(), value).unwrap_or(exp);
                self.conn().execute(
                    "UPDATE tb_advent_status SET ADV_LEVEL=?, ADV_EXP=? WHERE USER_DBID=?",
                    params![value, start, self.user_id],
                )?;
                self.touch();
            }
            return Ok(());
        }
        if !(limits.exp_min..=limits.exp).contains(&value) {
            return Err(Error::invalid(format!(
                "EXP at corps level {level} must be between {} and {}",
                limits.exp_min, limits.exp
            )));
        }
        self.conn().execute(
            "UPDATE tb_advent_status SET ADV_EXP=? WHERE USER_DBID=?",
            params![value, self.user_id],
        )?;
        self.touch();
        Ok(())
    }

    // ------------------------------------------------------------------ quests

    /// The rewards of every quest the save records as complete. A save edited
    /// forward by another tool marks earlier quests complete without handing
    /// out what they give, so the user can grant the ones they missed.
    pub fn quest_rewards(&self) -> Result<Vec<QuestRewards>> {
        let growth = Growth::shared();
        let mut done = self.quest_ids("tb_quest_complete", "")?;
        done.sort_unstable();
        Ok(done
            .into_iter()
            .filter_map(|id| {
                let quest = growth.quest(id)?;
                (quest.gold > 0 || quest.adv_exp > 0 || !quest.items.is_empty())
                    .then(|| self.quest_view(id, quest, None))
            })
            .collect())
    }

    /// The quests the save has in progress, with what completing each one
    /// would hand out and anything that stops the editor completing it.
    pub fn quests_in_progress(&self) -> Result<Vec<QuestRewards>> {
        let growth = Growth::shared();
        let mut held = self.quest_ids("tb_quest_hold", "")?;
        held.sort_unstable();
        let mut out = Vec::new();
        for id in held {
            let Some(quest) = growth.quest(id) else {
                continue;
            };
            let blocked = self.completion_blocker(quest)?;
            out.push(self.quest_view(id, quest, blocked));
        }
        Ok(out)
    }

    fn quest_view(&self, id: i64, quest: &growth::Quest, blocked: Option<String>) -> QuestRewards {
        QuestRewards {
            quest_id: id,
            category: quest.category.clone(),
            name_en: quest.name_en.clone(),
            name_fr: quest.name_fr.clone(),
            gold: quest.gold,
            adv_exp: quest.adv_exp,
            items: quest
                .items
                .iter()
                .map(|(cid, count)| {
                    let item = self.catalog.lookup(*cid);
                    RewardItem {
                        route: reward_route(&item),
                        item,
                        count: *count,
                    }
                })
                .collect(),
            blocked,
        }
    }

    /// Why the editor cannot complete a quest, if it cannot.
    fn completion_blocker(&self, quest: &growth::Quest) -> Result<Option<String>> {
        if quest.save_category.is_none() {
            return Ok(Some(format!(
                "the editor does not know how saves record {} quests",
                quest.category.to_lowercase()
            )));
        }
        for (action, value) in &quest.actions {
            if action == "TEAMSETTING_CHARACTER" && Growth::shared().hero(*value).is_none() {
                return Ok(Some(format!(
                    "hero {value} joins the team in this quest, and the game data does not list them; play it in game"
                )));
            }
        }
        Ok(None)
    }

    /// Adds the gold, stackable items, mounts and titles of the chosen
    /// completed quests. Equipment, dishes, heroes and corps EXP need writes
    /// the editor does not make, so they are reported back instead.
    pub fn grant_quest_rewards(&mut self, quest_ids: &[i64]) -> Result<RewardGrant> {
        let available = self.quest_rewards()?;
        let mut chosen: Vec<i64> = Vec::new();
        for id in quest_ids {
            if !available.iter().any(|reward| reward.quest_id == *id) {
                return Err(Error::invalid(format!(
                    "quest {id} is not complete in this save or gives no reward"
                )));
            }
            if !chosen.contains(id) {
                chosen.push(*id);
            }
        }
        let growth = Growth::shared();
        let mut grant = RewardGrant::default();
        let transaction = self.conn().unchecked_transaction()?;
        for id in chosen {
            let quest = growth.quest(id).expect("listed quests exist");
            self.add_reward(quest.gold, &quest.items, &mut grant)?;
            grant.adv_exp_not_granted += quest.adv_exp;
        }
        transaction.commit()?;
        if !grant.granted.is_empty() {
            self.touch();
        }
        Ok(grant)
    }

    /// Completes a quest in progress the way the game does: records it as
    /// complete, applies its lasting side effects, hands out its rewards
    /// (corps EXP and level-up rewards included), promotes the corps for a
    /// promotion exam, and starts the quests that were waiting for it.
    pub fn complete_quest(&mut self, id: i64) -> Result<QuestCompletion> {
        let growth = Growth::shared();
        let quest = growth
            .quest(id)
            .ok_or_else(|| Error::invalid(format!("quest {id} is not in the game data")))?;
        if !self.quest_ids("tb_quest_hold", "")?.contains(&id) {
            return Err(Error::invalid(
                "only a quest in progress can be completed; play up to it first",
            ));
        }
        if let Some(reason) = self.completion_blocker(quest)? {
            return Err(Error::invalid(reason));
        }
        let category = quest.save_category.expect("checked by completion_blocker");
        let mut completion = QuestCompletion::default();

        let transaction = self.conn().unchecked_transaction()?;
        self.record_complete(id, category)?;
        for (action, value) in &quest.actions {
            match action.as_str() {
                "TUTORIAL_DLG_COMPLITE" => {
                    let tutorial = growth
                        .quest(*value)
                        .and_then(|tutorial| tutorial.save_category)
                        .unwrap_or(12);
                    if !self.quest_ids("tb_quest_complete", "")?.contains(value) {
                        self.record_complete(*value, tutorial)?;
                    }
                }
                "TEAMSETTING_CHARACTER" => {
                    if self.join_hero(*value)? {
                        completion
                            .joined
                            .push(self.catalog.lookup_hint(*value, "character"));
                    }
                    self.place_in_first_team(*value)?;
                }
                "DELETE_ITEM" => {
                    self.conn().execute(
                        "DELETE FROM tb_stackable_item WHERE USER_DBID=? AND ITEM_CID=?",
                        params![self.user_id, value],
                    )?;
                }
                _ => {}
            }
        }
        self.add_reward(quest.gold, &quest.items, &mut completion.grant)?;
        completion.levels_gained = self.add_corps_exp(quest.adv_exp)?;
        if quest.category == "ADVENT_GRADE" {
            completion.new_grade = self.promote(id, &mut completion.grant)?;
        }
        completion.started = self.start_waiting_quests(id)?;
        transaction.commit()?;
        self.touch();
        Ok(completion)
    }

    /// Writes the complete record and drops the quest from the ones in
    /// progress. The game leaves `tb_completed_quest` alone when it completes
    /// a quest, so the editor does too.
    fn record_complete(&self, id: i64, category: i64) -> Result<()> {
        self.conn().execute(
            "INSERT OR IGNORE INTO tb_quest_complete (USER_DBID, QUEST_CID, CATEGORY) VALUES (?,?,?)",
            params![self.user_id, id, category],
        )?;
        if self.table_exists("tb_quest_hold")? {
            self.conn().execute(
                "DELETE FROM tb_quest_hold WHERE USER_DBID=? AND QUEST_CID=?",
                params![self.user_id, id],
            )?;
        }
        Ok(())
    }

    /// Adds corps EXP and levels the corps up through every threshold it
    /// crosses. Level rewards are not handed out: the player claims them on
    /// the Mercenary Corps screen, and `tb_reward_step` records the last level
    /// claimed. Returns the levels gained.
    fn add_corps_exp(&self, exp: i64) -> Result<i64> {
        if exp == 0 {
            return Ok(0);
        }
        let growth = Growth::shared();
        let (start_level, current) = self.corps_status()?;
        let total = current + exp;
        let cap = growth.region(REGION).max_advent_level;
        let mut level = start_level;
        while level < cap
            && growth::start_exp(growth.advent_exp(), level + 1).is_some_and(|next| total >= next)
        {
            level += 1;
        }
        // At the cap the game refunds EXP past the level's start.
        let stored = if level >= cap {
            growth::start_exp(growth.advent_exp(), level).map_or(total, |start| total.min(start))
        } else {
            total
        };
        self.conn().execute(
            "UPDATE tb_advent_status SET ADV_LEVEL=?, ADV_EXP=? WHERE USER_DBID=?",
            params![level, stored, self.user_id],
        )?;
        Ok(level - start_level)
    }

    /// Raises the grade for a completed promotion exam and hands out its title
    /// and items. The adventure difficulty follows the grade when it was at
    /// the old grade, as it is in every save seen so far.
    fn promote(&self, quest_id: i64, grant: &mut RewardGrant) -> Result<Option<i64>> {
        let growth = Growth::shared();
        let Some(grade) = (1..=growth.region(REGION).max_advent_grade)
            .filter_map(|grade| growth.grade(grade))
            .find(|row| row.promotion_quest == Some(quest_id))
        else {
            return Ok(None);
        };
        let current = self.adventure_grade()?;
        if grade.grade <= current {
            return Ok(None);
        }
        self.conn().execute(
            "UPDATE tb_advent_status SET ADV_GRADE=? WHERE USER_DBID=?",
            params![grade.grade, self.user_id],
        )?;
        for column in ["CUR_ADV_DIFFICULTY", "ORIGIN_ADV_DIFFICULTY"] {
            if self.column_exists("tb_advent_status", column)? {
                self.conn().execute(
                    &format!(
                        "UPDATE tb_advent_status SET {column}=? WHERE USER_DBID=? AND {column}=?"
                    ),
                    params![grade.grade, self.user_id, current],
                )?;
            }
        }
        self.add_reward(0, &grade.items, grant)?;
        Ok(Some(grade.grade))
    }

    /// Starts every quest the game would start by itself now that `done` is
    /// complete: auto-accepted quests whose prerequisites are all complete and
    /// whose corps level is reached.
    fn start_waiting_quests(&self, done: i64) -> Result<Vec<QuestRef>> {
        if !self.table_exists("tb_quest_hold")? {
            return Ok(Vec::new());
        }
        let growth = Growth::shared();
        let complete = self.quest_ids("tb_quest_complete", "")?;
        let held = self.quest_ids("tb_quest_hold", "")?;
        let (level, _) = self.corps_status()?;
        let mut started = Vec::new();
        let mut waiting: Vec<(i64, &growth::Quest)> = growth
            .quests()
            .filter(|(id, quest)| {
                quest.auto_accept
                    && quest.save_category.is_some()
                    && quest.requires.contains(&done)
                    && quest
                        .requires
                        .iter()
                        .all(|required| complete.contains(required))
                    && quest.adv_level.is_none_or(|needed| level >= needed)
                    && !complete.contains(id)
                    && !held.contains(id)
            })
            .collect();
        waiting.sort_unstable_by_key(|(id, _)| *id);
        for (id, quest) in waiting {
            let Some(step) = quest.first_step else {
                continue;
            };
            self.conn().execute(
                "INSERT INTO tb_quest_hold (USER_DBID, QUEST_CID, USE_TRACKING, STEP_ID, CNT, FAILED_CNT)
                 VALUES (?,?,0,?,0,0)",
                params![self.user_id, id, step],
            )?;
            started.push(QuestRef {
                quest_id: id,
                name_en: quest.name_en.clone(),
                name_fr: quest.name_fr.clone(),
            });
        }
        Ok(started)
    }

    /// Hands out gold and reward items. Currency, stackable items, mounts,
    /// titles, heroes, dishes and equipment are written; anything else is
    /// listed in `grant.not_granted`.
    fn add_reward(&self, gold: i64, items: &[(i64, i64)], grant: &mut RewardGrant) -> Result<()> {
        if gold > 0 {
            self.add_currency(GOLD_CID, gold, grant)?;
        }
        for (cid, count) in items {
            let item = self.catalog.lookup(*cid);
            match reward_route(&item) {
                RewardRoute::Currency => self.add_currency(*cid, *count, grant)?,
                RewardRoute::Stack => {
                    let current: i64 = self
                        .current_i64(
                            "SELECT STACK_CNT FROM tb_stackable_item WHERE USER_DBID=? AND ITEM_CID=?",
                            params![self.user_id, cid],
                        )?
                        .unwrap_or(0);
                    let total = current + count;
                    let max = MAX_STACK.max(current);
                    if total > max {
                        return Err(Error::invalid(format!(
                            "{} would reach {total}, above the stack limit of {max}",
                            item.name_en
                        )));
                    }
                    self.conn().execute(
                        "INSERT INTO tb_stackable_item (USER_DBID, ITEM_CID, STACK_CNT) VALUES (?,?,?)
                         ON CONFLICT(USER_DBID, ITEM_CID) DO UPDATE SET STACK_CNT=excluded.STACK_CNT",
                        params![self.user_id, cid, total],
                    )?;
                    note(&mut grant.granted, item, *count);
                }
                RewardRoute::Mount => {
                    let owned: i64 = self.conn().query_row(
                        "SELECT count(*) FROM tb_vehicle WHERE USER_DBID=? AND VEHICLE_CID=?",
                        params![self.user_id, cid],
                        |row| row.get(0),
                    )?;
                    if owned == 0 {
                        let next = self.mint_id("tb_vehicle", "VEHICLE_DBID")?;
                        self.conn().execute(
                            "INSERT INTO tb_vehicle (VEHICLE_DBID, USER_DBID, VEHICLE_CID, CREATED_DATE)
                             VALUES (?,?,?,CAST(strftime('%s','now','localtime') AS INTEGER))",
                            params![next, self.user_id, cid],
                        )?;
                        note(&mut grant.granted, item, 1);
                    }
                }
                RewardRoute::Title => {
                    let category = cid / 64;
                    let bit = 1i64 << (cid % 64);
                    self.conn().execute(
                        "INSERT INTO tb_title (USER_DBID, CATEGORY, BIT_FIELD, FAV_BIT_FIELD)
                         VALUES (?,?,?,0)
                         ON CONFLICT(USER_DBID, CATEGORY) DO UPDATE SET BIT_FIELD=BIT_FIELD | excluded.BIT_FIELD",
                        params![self.user_id, category, bit],
                    )?;
                    note(&mut grant.granted, item, 1);
                }
                RewardRoute::Hero => {
                    let hero = Growth::shared()
                        .hero_for_item(*cid)
                        .expect("routed by hero_for_item");
                    if self.join_hero(hero)? {
                        note(&mut grant.granted, item, 1);
                    } else {
                        // What the game does with a duplicate hero item is not
                        // known yet, so the editor gives nothing for it.
                        note(&mut grant.not_granted, item, *count);
                    }
                }
                RewardRoute::Dish => {
                    self.add_dish(*cid, *count)?;
                    note(&mut grant.granted, item, *count);
                }
                RewardRoute::Equipment => {
                    for _ in 0..*count {
                        self.add_equipment(*cid)?;
                    }
                    note(&mut grant.granted, item, *count);
                }
                RewardRoute::None => note(&mut grant.not_granted, item, *count),
            }
        }
        Ok(())
    }

    /// Creates a piece of equipment the way the game does: a game-style
    /// instance ID, enchant and EXP at zero, and one row ID rolled by weight
    /// from each of the item's stat groups. Sub stats do not repeat a stat,
    /// as in every piece the game has been seen to create.
    fn add_equipment(&self, cid: i64) -> Result<i64> {
        let stats = Growth::shared()
            .equipment(cid)
            .ok_or_else(|| Error::invalid(format!("{cid} is not equipment the game creates")))?;
        let mut rng = rand::thread_rng();
        let main = roll_stat(&mut rng, Growth::shared().stat_choices(stats.main), &[]).ok_or_else(
            || Error::invalid(format!("equipment {cid} has an empty main-stat group")),
        )?;
        let mut subs = [0i64; 5];
        let mut taken: Vec<&str> = Vec::new();
        for (slot, group) in stats.subs.iter().enumerate().take(5) {
            let choices = Growth::shared().stat_choices(*group);
            let choice = roll_stat(&mut rng, choices, &taken)
                .or_else(|| roll_stat(&mut rng, choices, &[]))
                .ok_or_else(|| {
                    Error::invalid(format!("equipment {cid} has an empty sub-stat group"))
                })?;
            subs[slot] = choice.0;
            taken.push(&choice.2);
        }
        let dbid = self.mint_item_id("tb_equipment")?;
        self.conn().execute(
            "INSERT INTO tb_equipment
                (ITEM_DBID, USER_DBID, ITEM_CID, ENCHANT_LEVEL, EXP, IS_LOCK, GEM_DBID, MAIN_STAT_CID,
                 SUB_STAT_CID1, SUB_STAT_CID2, SUB_STAT_CID3, SUB_STAT_CID4, SUB_STAT_CID5,
                 CREATED_DATE, DELETED_DATE)
             VALUES (?,?,?,0,0,0,0,?,?,?,?,?,?,CAST(strftime('%s','now','localtime') AS INTEGER),0)",
            params![
                dbid,
                self.user_id,
                cid,
                main.0,
                subs[0],
                subs[1],
                subs[2],
                subs[3],
                subs[4]
            ],
        )?;
        Ok(dbid)
    }

    /// Adds to a dish's stack, or starts one with a game-style instance ID.
    /// The game keeps one live row per dish.
    fn add_dish(&self, cid: i64, count: i64) -> Result<()> {
        let existing: Option<(i64, i64)> = self
            .conn()
            .query_row(
                "SELECT ITEM_DBID, STACK_CNT FROM tb_cook_item
                  WHERE USER_DBID=? AND ITEM_CID=? AND COALESCE(DELETED_DATE, 0)=0
                  ORDER BY ITEM_DBID LIMIT 1",
                params![self.user_id, cid],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        if let Some((dbid, current)) = existing {
            let total = current + count;
            let max = MAX_DISH.max(current);
            if total > max {
                return Err(Error::invalid(format!(
                    "dish {cid} would reach {total}, above its limit of {max}"
                )));
            }
            self.conn().execute(
                "UPDATE tb_cook_item SET STACK_CNT=? WHERE USER_DBID=? AND ITEM_DBID=?",
                params![total, self.user_id, dbid],
            )?;
            return Ok(());
        }
        let dbid = self.mint_item_id("tb_cook_item")?;
        self.conn().execute(
            "INSERT INTO tb_cook_item
                (USER_DBID, ITEM_DBID, ITEM_CID, SPECIAL_BUFF_CID1, SPECIAL_BUFF_CID2, STACK_CNT,
                 CREATED_DATE, DELETED_DATE)
             VALUES (?,?,?,0,0,?,CAST(strftime('%s','now','localtime') AS INTEGER),0)",
            params![self.user_id, dbid, cid, count.min(MAX_DISH)],
        )?;
        Ok(())
    }

    /// Mints an item instance ID the way the game does: the prefix and a
    /// same-second counter above the creation time in UTC seconds.
    fn mint_item_id(&self, table: &str) -> Result<i64> {
        let now: i64 =
            self.conn()
                .query_row("SELECT CAST(strftime('%s','now') AS INTEGER)", [], |row| {
                    row.get(0)
                })?;
        let low = now & 0xFFFF_FFFF;
        for counter in 0..0x1000 {
            let candidate = ((ITEM_ID_PREFIX + counter) << 32) | low;
            let taken: i64 = self.conn().query_row(
                &format!("SELECT count(*) FROM {table} WHERE ITEM_DBID=?"),
                params![candidate],
                |row| row.get(0),
            )?;
            if taken == 0 {
                return Ok(candidate);
            }
        }
        Err(Error::invalid("could not allocate a free item id"))
    }

    fn add_currency(&self, cid: i64, add: i64, grant: &mut RewardGrant) -> Result<()> {
        let current = self
            .current_i64(
                "SELECT AMOUNT FROM tb_currency WHERE USER_DBID=? AND ITEM_CID=?",
                params![self.user_id, cid],
            )?
            .unwrap_or(0);
        let total = current + add;
        let max = currency_limit(cid).max(current);
        if total > max {
            return Err(Error::invalid(format!(
                "currency {cid} would reach {total}, above its limit of {max}"
            )));
        }
        self.conn().execute(
            "INSERT INTO tb_currency (USER_DBID, ITEM_CID, AMOUNT) VALUES (?,?,?)
             ON CONFLICT(USER_DBID, ITEM_CID) DO UPDATE SET AMOUNT=excluded.AMOUNT",
            params![self.user_id, cid, total],
        )?;
        note(
            &mut grant.granted,
            self.catalog.lookup_hint(cid, "currency"),
            add,
        );
        Ok(())
    }

    fn table_exists(&self, table: &str) -> Result<bool> {
        let count: i64 = self.conn().query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?",
            [table],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    fn column_exists(&self, table: &str, column: &str) -> Result<bool> {
        let count: i64 = self.conn().query_row(
            "SELECT count(*) FROM pragma_table_info(?) WHERE name=?",
            [table, column],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    // --------------------------------------------------------------- currency

    pub fn currencies(&self) -> Result<Vec<Currency>> {
        let mut statement = self.conn().prepare(
            "SELECT ITEM_CID, AMOUNT FROM tb_currency WHERE USER_DBID=? ORDER BY ITEM_CID",
        )?;
        let rows = statement.query_map(params![self.user_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (cid, amount) = row?;
            out.push(Currency {
                item: self.catalog.lookup_hint(cid, "currency"),
                amount,
            });
        }
        Ok(out)
    }

    pub fn set_currency(&mut self, cid: i64, amount: i64) -> Result<()> {
        let current = self
            .current_i64(
                "SELECT AMOUNT FROM tb_currency WHERE USER_DBID=? AND ITEM_CID=?",
                params![self.user_id, cid],
            )?
            .ok_or_else(|| Error::invalid(format!("currency {cid} is not present in this save")))?;
        let max = currency_limit(cid).max(current);
        if !(0..=max).contains(&amount) {
            return Err(Error::invalid(format!(
                "currency must be between 0 and {max}"
            )));
        }
        self.conn().execute(
            "UPDATE tb_currency SET AMOUNT=? WHERE USER_DBID=? AND ITEM_CID=?",
            params![amount, self.user_id, cid],
        )?;
        self.touch();
        Ok(())
    }

    // -------------------------------------------------------------- inventory

    pub fn inventory(&self) -> Result<Vec<Stack>> {
        let mut out = Vec::new();
        {
            let mut statement = self.conn().prepare(
                "SELECT ITEM_CID, STACK_CNT FROM tb_stackable_item WHERE USER_DBID=? ORDER BY ITEM_CID",
            )?;
            let rows = statement.query_map(params![self.user_id], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
            })?;
            for row in rows {
                let (cid, count) = row?;
                out.push(Stack {
                    item: self.catalog.lookup_hint(cid, "material"),
                    kind: "stackable".into(),
                    id: cid.to_string(),
                    count,
                });
            }
        }
        {
            let mut statement = self.conn().prepare(
                "SELECT ITEM_DBID, ITEM_CID, STACK_CNT FROM tb_cook_item
                  WHERE USER_DBID=? AND DELETED_DATE=0 ORDER BY ITEM_CID",
            )?;
            let rows = statement.query_map(params![self.user_id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })?;
            for row in rows {
                let (dbid, cid, count) = row?;
                out.push(Stack {
                    item: self.catalog.lookup_hint(cid, "food"),
                    kind: "cook".into(),
                    id: dbid.to_string(),
                    count,
                });
            }
        }
        out.sort_by(|left, right| {
            left.item
                .category
                .cmp(&right.item.category)
                .then_with(|| left.item.group.cmp(&right.item.group))
                .then_with(|| left.item.name_en.cmp(&right.item.name_en))
        });
        Ok(out)
    }

    pub fn set_stack(&mut self, kind: &str, id: i64, count: i64) -> Result<()> {
        let current = match kind {
            "stackable" => self.current_i64(
                "SELECT STACK_CNT FROM tb_stackable_item WHERE USER_DBID=? AND ITEM_CID=?",
                params![self.user_id, id],
            )?,
            "cook" => self.current_i64(
                "SELECT STACK_CNT FROM tb_cook_item WHERE USER_DBID=? AND ITEM_DBID=?",
                params![self.user_id, id],
            )?,
            _ => return Err(Error::invalid(format!("unknown stack kind {kind:?}"))),
        }
        .ok_or_else(|| Error::invalid("that stack is not present in this save"))?;
        let limit = if kind == "cook" { MAX_DISH } else { MAX_STACK };
        let max = limit.max(current);
        if !(0..=max).contains(&count) {
            return Err(Error::invalid(format!(
                "stack count must be between 0 and {max}"
            )));
        }
        let changed = match kind {
            "stackable" => self.conn().execute(
                "UPDATE tb_stackable_item SET STACK_CNT=? WHERE USER_DBID=? AND ITEM_CID=?",
                params![count, self.user_id, id],
            )?,
            "cook" => self.conn().execute(
                "UPDATE tb_cook_item SET STACK_CNT=? WHERE USER_DBID=? AND ITEM_DBID=?",
                params![count, self.user_id, id],
            )?,
            _ => unreachable!("kind was validated above"),
        };
        if changed != 1 {
            return Err(Error::invalid("that stack is not present in this save"));
        }
        self.touch();
        Ok(())
    }

    pub fn add_stackable(&mut self, cid: i64, count: i64) -> Result<()> {
        let item = self.catalog.lookup(cid);
        if !item.is_stackable() {
            return Err(Error::invalid(
                "that item is not stored in the stackable inventory",
            ));
        }
        let current = self
            .current_i64(
                "SELECT STACK_CNT FROM tb_stackable_item WHERE USER_DBID=? AND ITEM_CID=?",
                params![self.user_id, cid],
            )?
            .unwrap_or(0);
        let max = MAX_STACK.max(current);
        if !(0..=max).contains(&count) {
            return Err(Error::invalid(format!(
                "stack count must be between 0 and {max}"
            )));
        }
        self.conn().execute(
            "INSERT INTO tb_stackable_item (USER_DBID, ITEM_CID, STACK_CNT) VALUES (?,?,?)
             ON CONFLICT(USER_DBID, ITEM_CID) DO UPDATE SET STACK_CNT=excluded.STACK_CNT",
            params![self.user_id, cid, count],
        )?;
        self.touch();
        Ok(())
    }

    /// Raise only the kinds whose counts are normal inventory quantities.
    /// Quest, map, achievement and master-soul rows keep whatever the game
    /// wrote; no row is ever lowered, and the return value counts changed rows.
    pub fn fill_stackables(&mut self, count: i64) -> Result<i64> {
        if !(0..=MAX_STACK).contains(&count) {
            return Err(Error::invalid(format!(
                "stack count must be between 0 and {MAX_STACK}"
            )));
        }
        let cids: Vec<i64> = {
            let mut statement = self
                .conn()
                .prepare("SELECT ITEM_CID FROM tb_stackable_item WHERE USER_DBID=?")?;
            let rows = statement.query_map(params![self.user_id], |row| row.get(0))?;
            rows.collect::<std::result::Result<Vec<_>, _>>()?
        };
        let fillable: Vec<i64> = cids
            .into_iter()
            .filter(|cid| fillable_kind(&self.catalog.lookup(*cid).kind))
            .collect();
        if fillable.is_empty() {
            return Ok(0);
        }

        let transaction = self.conn().unchecked_transaction()?;
        let mut updated = 0i64;
        {
            let mut statement = transaction.prepare(
                "UPDATE tb_stackable_item SET STACK_CNT=MAX(STACK_CNT, ?)
                  WHERE USER_DBID=? AND ITEM_CID=? AND STACK_CNT < ?",
            )?;
            for cid in fillable {
                updated += statement.execute(params![count, self.user_id, cid, count])? as i64;
            }
        }
        transaction.commit()?;
        if updated > 0 {
            self.touch();
        }
        Ok(updated)
    }

    pub fn catalog_entries(&self) -> Vec<Item> {
        self.catalog.entries()
    }

    pub fn stackable_catalog(&self) -> Vec<Item> {
        self.catalog
            .entries()
            .into_iter()
            .filter(Item::is_stackable)
            .collect()
    }

    pub fn categories(&self) -> Vec<crate::catalog::Category> {
        self.catalog.categories().to_vec()
    }

    // ------------------------------------------------------------- characters

    pub fn characters(&self) -> Result<Vec<Character>> {
        let grade = self.adventure_grade()?;
        let mut statement = self.conn().prepare(
            "SELECT CHARACTER_CID, LEVEL, EXP, ASCEND, HP, TRANSCEND, TRANSCEND_TOTAL,
                    SOLDIER_GRADE, SOLDIER_GRADE_POINT, CREATED_DATE
               FROM tb_character WHERE USER_DBID=? ORDER BY CHARACTER_CID",
        )?;
        let rows = statement.query_map(params![self.user_id], |row| {
            Ok(Character {
                cid: row.get(0)?,
                item: Item::fallback(0, "character"),
                level: row.get(1)?,
                exp: row.get(2)?,
                ascend: row.get(3)?,
                hp: row.get(4)?,
                transcend: row.get(5)?,
                transcend_total: row.get(6)?,
                soldier_grade: row.get(7)?,
                soldier_grade_point: row.get(8)?,
                created_at: row.get(9)?,
                joined: row.get::<_, i64>(4)? != UNJOINED_HP,
                limits: hero_limits(row.get(1)?, row.get(2)?, row.get(3)?, grade),
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            let mut character = row?;
            character.item = self.catalog.lookup_hint(character.cid, "character");
            out.push(character);
        }
        Ok(out)
    }

    pub fn set_character(&mut self, cid: i64, field: &str, value: i64) -> Result<()> {
        let (level, exp, ascend) = self.character_growth(cid)?;
        let limits = hero_limits(level, exp, ascend, self.adventure_grade()?);
        let (column, max) = match field {
            "level" => ("LEVEL", limits.level),
            "exp" => ("EXP", limits.exp),
            "ascend" => ("ASCEND", limits.ascend),
            "transcend" => ("TRANSCEND", limits.transcend),
            "transcendTotal" => ("TRANSCEND_TOTAL", MAX_TRANSCEND_TOTAL),
            "hp" => ("HP", MAX_CHARACTER_HP),
            "soldierGrade" => ("SOLDIER_GRADE", MAX_SOLDIER_GRADE),
            "soldierGradePoint" => ("SOLDIER_GRADE_POINT", MAX_POINTS),
            _ => return Err(Error::invalid(format!("unknown character field {field:?}"))),
        };
        let current = self
            .current_i64(
                &format!("SELECT {column} FROM tb_character WHERE USER_DBID=? AND CHARACTER_CID=?"),
                params![self.user_id, cid],
            )?
            .ok_or_else(|| Error::invalid("that character is not owned in this save"))?;
        let max = max.max(current);
        let min = match field {
            "level" => 1,
            "exp" => limits.exp_min,
            _ => 0,
        };
        if !(min..=max).contains(&value) {
            let message = if field == "exp" {
                format!("EXP at level {level} must be between {min} and {max}")
            } else {
                format!("{field} must be between {min} and {max}")
            };
            return Err(Error::invalid(message));
        }
        if field == "ascend" && value < current {
            let needed = Growth::shared().stage_for_level(level);
            if value < needed {
                return Err(Error::invalid(format!(
                    "level {level} needs breakthrough {needed}; lower the level first"
                )));
            }
        }
        if field == "level" {
            // A level change writes the EXP that starts the new level, so the
            // pair stays one the game could have written.
            if value != level {
                let start = growth::start_exp(Growth::shared().hero_exp(), value).unwrap_or(exp);
                self.conn().execute(
                    "UPDATE tb_character SET LEVEL=?, EXP=? WHERE USER_DBID=? AND CHARACTER_CID=?",
                    params![value, start, self.user_id, cid],
                )?;
                self.touch();
            }
            return Ok(());
        }
        self.conn().execute(
            &format!("UPDATE tb_character SET {column}=? WHERE USER_DBID=? AND CHARACTER_CID=?"),
            params![value, self.user_id, cid],
        )?;
        self.touch();
        Ok(())
    }

    /// Recruits a hero the way redeeming the hero's item does in game: a new
    /// level-1 row, or a seeded story hero's row brought to its starting HP.
    /// Only heroes the game hands out somewhere can be recruited.
    pub fn add_character(&mut self, cid: i64) -> Result<bool> {
        if Growth::shared().hero(cid).is_none() {
            return Err(Error::invalid(format!(
                "{cid} is not a hero the game hands out; the editor only recruits shop, quest and story heroes"
            )));
        }
        let joined = self.join_hero(cid)?;
        if !joined {
            return Err(Error::invalid("that hero is already on the roster"));
        }
        self.touch();
        Ok(true)
    }

    /// The heroes the game hands out, each with whether this save has them.
    pub fn recruitable_heroes(&self) -> Result<Vec<HeroEntry>> {
        let owned: HashMap<i64, i64> = self
            .characters()?
            .into_iter()
            .map(|character| (character.cid, character.hp))
            .collect();
        Ok(Growth::shared()
            .heroes()
            .iter()
            .map(|hero| HeroEntry {
                cid: hero.id,
                item: self.catalog.lookup_hint(hero.item, "character"),
                sources: hero.sources.clone(),
                owned: owned.get(&hero.id).is_some_and(|hp| *hp != UNJOINED_HP),
            })
            .collect())
    }

    /// Brings a hero onto the roster. Returns false when the hero was already
    /// on it.
    fn join_hero(&self, cid: i64) -> Result<bool> {
        let hp = self.current_i64(
            "SELECT HP FROM tb_character WHERE USER_DBID=? AND CHARACTER_CID=?",
            params![self.user_id, cid],
        )?;
        match hp {
            Some(UNJOINED_HP) => {
                self.conn().execute(
                    "UPDATE tb_character SET HP=? WHERE USER_DBID=? AND CHARACTER_CID=?",
                    params![STARTING_HP, self.user_id, cid],
                )?;
                Ok(true)
            }
            Some(_) => Ok(false),
            None => {
                self.conn().execute(
                    "INSERT INTO tb_character
                        (USER_DBID, CHARACTER_CID, LEVEL, EXP, ASCEND, HP, TRANSCEND,
                         TRANSCEND_TOTAL, SOLDIER_GRADE, SOLDIER_GRADE_POINT, CREATED_DATE)
                     VALUES (?,?,1,0,0,?,0,0,0,0,CAST(strftime('%s','now','localtime') AS INTEGER))",
                    params![self.user_id, cid, STARTING_HP],
                )?;
                Ok(true)
            }
        }
    }

    /// Puts a hero who just joined in the first empty slot of team page 0,
    /// as the game does for a story hero.
    fn place_in_first_team(&self, cid: i64) -> Result<()> {
        let Some((first, second, third)) = self
            .conn()
            .query_row(
                "SELECT SLOT1_CHARACTER_CID, SLOT2_CHARACTER_CID, SLOT3_CHARACTER_CID
                   FROM tb_team WHERE USER_DBID=? AND PAGE_ID=0",
                params![self.user_id],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, i64>(2)?,
                    ))
                },
            )
            .optional()?
        else {
            return Ok(());
        };
        let slots = [first, second, third];
        if slots.contains(&cid) {
            return Ok(());
        }
        if let Some(index) = slots.iter().position(|slot| *slot == 0) {
            self.conn().execute(
                &format!(
                    "UPDATE tb_team SET SLOT{}_CHARACTER_CID=? WHERE USER_DBID=? AND PAGE_ID=0",
                    index + 1
                ),
                params![cid, self.user_id],
            )?;
        }
        Ok(())
    }

    pub fn unlock_all_characters(&mut self) -> Result<i64> {
        Err(Error::invalid(
            "the editor does not insert character rows; recruit through the game's shop",
        ))
    }

    pub fn remove_character(&mut self, cid: i64) -> Result<()> {
        let transaction = self.conn().unchecked_transaction()?;
        let selected = selected_team(&transaction, self.user_id)?;
        let teams = team_rows(&transaction, self.user_id)?;
        if let Some((page_id, _)) = selected
            && teams
                .iter()
                .any(|(id, slots)| *id == page_id && slots.contains(&cid))
        {
            return Err(Error::invalid(
                "that character is in the active team; select another team page before removing them",
            ));
        }
        let deleted = transaction.execute(
            "DELETE FROM tb_character WHERE USER_DBID=? AND CHARACTER_CID=?",
            params![self.user_id, cid],
        )?;
        if deleted != 1 {
            return Err(Error::invalid("that character is not owned in this save"));
        }
        transaction.execute(
            "DELETE FROM tb_skill_growth WHERE USER_DBID=? AND CHARACTER_CID=?",
            params![self.user_id, cid],
        )?;
        for (page_id, slots) in &teams {
            if !slots.contains(&cid) {
                continue;
            }
            let mut compact = [0i64; 3];
            let mut next = 0;
            for slot in slots {
                if *slot != 0 && *slot != cid {
                    compact[next] = *slot;
                    next += 1;
                }
            }
            transaction.execute(
                "UPDATE tb_team SET SLOT1_CHARACTER_CID=?, SLOT2_CHARACTER_CID=?,
                    SLOT3_CHARACTER_CID=? WHERE USER_DBID=? AND PAGE_ID=?",
                params![compact[0], compact[1], compact[2], self.user_id, page_id],
            )?;
        }
        transaction.execute(
            "DELETE FROM tb_equip_mount WHERE USER_DBID=? AND CHARACTER_CID=?",
            params![self.user_id, cid],
        )?;
        transaction.execute(
            "UPDATE tb_costume SET EQUIP_CHARACTER_CID=0 WHERE USER_DBID=? AND EQUIP_CHARACTER_CID=?",
            params![self.user_id, cid],
        )?;
        transaction.commit()?;
        self.touch();
        Ok(())
    }

    pub fn skills(&self, cid: i64) -> Result<Vec<Skill>> {
        let mut statement = self.conn().prepare(
            "SELECT TYPE_VALUE, SLOT_LEVEL FROM tb_skill_growth
              WHERE USER_DBID=? AND CHARACTER_CID=? ORDER BY TYPE_VALUE",
        )?;
        let rows = statement.query_map(params![self.user_id, cid], |row| {
            Ok(Skill {
                type_value: row.get(0)?,
                level: row.get::<_, Option<i64>>(1)?.unwrap_or(0),
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn set_skill(&mut self, cid: i64, type_value: i64, level: i64) -> Result<()> {
        if !SKILL_TYPES.contains(&type_value) {
            return Err(Error::invalid("skill type must be 1–7 or 801"));
        }
        let (hero_level, exp, ascend) = self.character_growth(cid)?;
        let stage = hero_limits(hero_level, exp, ascend, self.adventure_grade()?).stage;
        let current = self
            .current_i64(
                "SELECT COALESCE(SLOT_LEVEL, 0) FROM tb_skill_growth
                  WHERE USER_DBID=? AND CHARACTER_CID=? AND TYPE_VALUE=?",
                params![self.user_id, cid, type_value],
            )?
            .unwrap_or(0);
        let max = Growth::shared()
            .skill_cap(type_value, stage, REGION)
            .unwrap_or(0)
            .max(current);
        if !(0..=max).contains(&level) {
            return Err(Error::invalid(format!(
                "skill level must be between 0 and {max}"
            )));
        }
        self.conn().execute(
            "INSERT INTO tb_skill_growth (USER_DBID, CHARACTER_CID, TYPE_VALUE, SLOT_LEVEL) VALUES (?,?,?,?)
             ON CONFLICT(USER_DBID, CHARACTER_CID, TYPE_VALUE) DO UPDATE SET SLOT_LEVEL=excluded.SLOT_LEVEL",
            params![self.user_id, cid, type_value, level],
        )?;
        self.touch();
        Ok(())
    }

    pub fn remove_skill(&mut self, cid: i64, type_value: i64) -> Result<()> {
        self.conn().execute(
            "DELETE FROM tb_skill_growth WHERE USER_DBID=? AND CHARACTER_CID=? AND TYPE_VALUE=?",
            params![self.user_id, cid, type_value],
        )?;
        self.touch();
        Ok(())
    }

    pub fn teams(&self) -> Result<Vec<TeamPage>> {
        let levels: HashMap<i64, i64> = self
            .characters()?
            .into_iter()
            .map(|character| (character.cid, character.level))
            .collect();
        let selected_page = selected_team(self.conn(), self.user_id)?.map(|(page, _)| page);
        let mut statement = self.conn().prepare(
            "SELECT PAGE_ID, SLOT1_CHARACTER_CID, SLOT2_CHARACTER_CID, SLOT3_CHARACTER_CID
               FROM tb_team WHERE USER_DBID=? ORDER BY PAGE_ID",
        )?;
        let rows = statement.query_map(params![self.user_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (page_id, first, second, third) = row?;
            let slots = [first, second, third]
                .into_iter()
                .map(|cid| {
                    if cid == 0 {
                        TeamSlot {
                            item: None,
                            cid: 0,
                            level: 0,
                        }
                    } else {
                        TeamSlot {
                            item: Some(self.catalog.lookup_hint(cid, "character")),
                            cid,
                            level: levels.get(&cid).copied().unwrap_or(0),
                        }
                    }
                })
                .collect();
            out.push(TeamPage {
                page_id,
                slots,
                selected: selected_page == Some(page_id),
            });
        }
        Ok(out)
    }

    /// Assign a character to one of the three slots on a saved team page.
    /// Passing CID 0 clears the slot, subject to the same rules the checker
    /// enforces: no duplicates, no gaps, no empty page and no empty active slot.
    pub fn set_team_slot(&mut self, page_id: i64, slot: i64, cid: i64) -> Result<()> {
        let column = match slot {
            1 => "SLOT1_CHARACTER_CID",
            2 => "SLOT2_CHARACTER_CID",
            3 => "SLOT3_CHARACTER_CID",
            _ => return Err(Error::invalid("team slot must be 1, 2 or 3")),
        };
        let transaction = self.conn().unchecked_transaction()?;
        let teams = team_rows(&transaction, self.user_id)?;
        let slots = teams
            .iter()
            .find(|(id, _)| *id == page_id)
            .map(|(_, slots)| *slots)
            .ok_or_else(|| Error::invalid("that team page does not exist"))?;
        let index = (slot - 1) as usize;
        let current = slots[index];
        if cid == current {
            return Ok(());
        }

        if cid == 0 {
            if slots.iter().filter(|member| **member != 0).count() <= 1 {
                return Err(Error::invalid(
                    "a team page must keep at least one character",
                ));
            }
            if slots[(index + 1)..].iter().any(|member| *member != 0) {
                return Err(Error::invalid(
                    "empty slots must stay at the end; clear the last filled slot first",
                ));
            }
            if let Some((selected_page, selected_slot)) = selected_team(&transaction, self.user_id)?
                && selected_page == page_id
                && selected_slot == slot - 1
            {
                return Err(Error::invalid(
                    "the active team's selected slot cannot be empty",
                ));
            }
        } else {
            let owned: i64 = transaction.query_row(
                "SELECT count(*) FROM tb_character WHERE USER_DBID=? AND CHARACTER_CID=?",
                params![self.user_id, cid],
                |row| row.get(0),
            )?;
            if owned == 0 {
                return Err(Error::invalid("that character is not owned in this save"));
            }
            if slots
                .iter()
                .enumerate()
                .any(|(position, member)| position != index && *member == cid)
            {
                return Err(Error::invalid(
                    "that character is already in another slot on this team page",
                ));
            }
            if slots[..index].contains(&0) {
                return Err(Error::invalid(
                    "fill team slots from the first empty slot; do not leave a gap",
                ));
            }
        }

        let changed = transaction.execute(
            &format!("UPDATE tb_team SET {column}=? WHERE USER_DBID=? AND PAGE_ID=?"),
            params![cid, self.user_id, page_id],
        )?;
        if changed != 1 {
            return Err(Error::invalid("that team page does not exist"));
        }
        transaction.commit()?;
        self.touch();
        Ok(())
    }

    pub fn loadout(&self, cid: i64) -> Result<Loadout> {
        let row = self
            .conn()
            .query_row(
                "SELECT ACC_HEAD, ACC_CHEST, ACC_LEG, ACC_HAND, ACC_FOOT, KARMA, VEHICLE
                   FROM tb_equip_mount WHERE USER_DBID=? AND CHARACTER_CID=?",
                params![self.user_id, cid],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, i64>(4)?,
                        row.get::<_, i64>(5)?,
                        row.get::<_, i64>(6)?,
                    ))
                },
            )
            .optional()?;
        let Some((head, chest, leg, hand, foot, karma, vehicle)) = row else {
            return Ok(Loadout {
                character_cid: cid,
                head: None,
                chest: None,
                leg: None,
                hand: None,
                foot: None,
                karma: None,
                vehicle: None,
            });
        };
        let equipment = |dbid: i64| -> Result<Option<LoadoutEntry>> {
            if dbid == 0 {
                return Ok(None);
            }
            Ok(self.equipment_by_dbid(dbid)?.map(|equipment| LoadoutEntry {
                dbid: dbid.to_string(),
                item: equipment.item,
                enchant_level: equipment.enchant_level,
            }))
        };
        let karma = if karma == 0 {
            None
        } else {
            self.karma_by_dbid(karma)?.map(|karma| LoadoutEntry {
                dbid: karma.dbid.to_string(),
                item: karma.item,
                enchant_level: karma.ascend,
            })
        };
        let vehicle = if vehicle == 0 {
            None
        } else {
            self.vehicle_by_dbid(vehicle)?.map(|vehicle| LoadoutEntry {
                dbid: vehicle.dbid.to_string(),
                item: vehicle.item,
                enchant_level: 0,
            })
        };
        Ok(Loadout {
            character_cid: cid,
            head: equipment(head)?,
            chest: equipment(chest)?,
            leg: equipment(leg)?,
            hand: equipment(hand)?,
            foot: equipment(foot)?,
            karma,
            vehicle,
        })
    }

    // -------------------------------------------------------------- equipment

    pub fn equipment(&self) -> Result<Vec<Equipment>> {
        let columns = table_columns(self.conn(), "tb_equipment")?;
        let has_values = columns.contains("MAIN_STAT_VALUE") && columns.contains("SUB_STAT_VALUE1");
        let values = if has_values {
            "MAIN_STAT_VALUE, SUB_STAT_VALUE1, SUB_STAT_VALUE2, SUB_STAT_VALUE3, SUB_STAT_VALUE4, SUB_STAT_VALUE5"
        } else {
            "0, 0, 0, 0, 0, 0"
        };
        let sql = format!(
            "SELECT ITEM_DBID, ITEM_CID, ENCHANT_LEVEL, EXP, IS_LOCK, GEM_DBID,
                    MAIN_STAT_CID, SUB_STAT_CID1, SUB_STAT_CID2, SUB_STAT_CID3, SUB_STAT_CID4, SUB_STAT_CID5,
                    {values}
               FROM tb_equipment WHERE USER_DBID=? AND DELETED_DATE=0
               ORDER BY ITEM_CID, ITEM_DBID"
        );
        let mut statement = self.conn().prepare(&sql)?;
        let rows = statement.query_map(params![self.user_id], |row| {
            Ok(Equipment {
                dbid: row.get::<_, i64>(0)?.to_string(),
                item: Item::fallback(0, "gear"),
                cid: row.get(1)?,
                enchant_level: row.get(2)?,
                exp: row.get(3)?,
                is_lock: row.get::<_, i64>(4)? != 0,
                gem_dbid: row.get::<_, i64>(5)?.to_string(),
                main_stat_cid: row.get(6)?,
                sub_stat_cids: vec![
                    row.get(7)?,
                    row.get(8)?,
                    row.get(9)?,
                    row.get(10)?,
                    row.get(11)?,
                ],
                main_stat_value: row.get(12)?,
                sub_stat_values: vec![
                    row.get(13)?,
                    row.get(14)?,
                    row.get(15)?,
                    row.get(16)?,
                    row.get(17)?,
                ],
                has_stat_values: has_values,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            let mut equipment = row?;
            equipment.item = self.catalog.lookup_hint(equipment.cid, "gear");
            out.push(equipment);
        }
        Ok(out)
    }

    fn equipment_by_dbid(&self, dbid: i64) -> Result<Option<Equipment>> {
        let mut all = self.equipment()?;
        Ok(all
            .drain(..)
            .find(|equipment| equipment.dbid == dbid.to_string()))
    }

    pub fn set_equipment(&mut self, dbid: i64, field: &str, value: i64) -> Result<()> {
        let column = match field {
            "enchantLevel" => "ENCHANT_LEVEL",
            "exp" => "EXP",
            "isLock" => "IS_LOCK",
            "mainStatCid" => "MAIN_STAT_CID",
            "subStatCid1" => "SUB_STAT_CID1",
            "subStatCid2" => "SUB_STAT_CID2",
            "subStatCid3" => "SUB_STAT_CID3",
            "subStatCid4" => "SUB_STAT_CID4",
            "subStatCid5" => "SUB_STAT_CID5",
            "mainStatValue" => "MAIN_STAT_VALUE",
            "subStatValue1" => "SUB_STAT_VALUE1",
            "subStatValue2" => "SUB_STAT_VALUE2",
            "subStatValue3" => "SUB_STAT_VALUE3",
            "subStatValue4" => "SUB_STAT_VALUE4",
            "subStatValue5" => "SUB_STAT_VALUE5",
            _ => return Err(Error::invalid(format!("unknown equipment field {field:?}"))),
        };
        if column.contains("STAT_VALUE") {
            let columns = table_columns(self.conn(), "tb_equipment")?;
            if !columns.contains(column) {
                return Err(Error::invalid("this save has no stat value columns"));
            }
        }
        let max = if column == "IS_LOCK" {
            1
        } else if column == "ENCHANT_LEVEL" {
            MAX_ENCHANT
        } else if column == "EXP" {
            MAX_EQUIP_EXP
        } else {
            MAX_STAT
        };
        let current = self
            .current_i64(
                &format!("SELECT {column} FROM tb_equipment WHERE USER_DBID=? AND ITEM_DBID=?"),
                params![self.user_id, dbid],
            )?
            .ok_or_else(|| Error::invalid("that equipment piece is not present in this save"))?;
        let max = max.max(current);
        if !(0..=max).contains(&value) {
            return Err(Error::invalid(format!(
                "{field} must be between 0 and {max}"
            )));
        }
        self.conn().execute(
            &format!("UPDATE tb_equipment SET {column}=? WHERE USER_DBID=? AND ITEM_DBID=?"),
            params![value, self.user_id, dbid],
        )?;
        self.touch();
        Ok(())
    }

    /// Link a gem instance to a piece of equipment. `0` clears the link.
    ///
    /// The gem id is a 64-bit instance id, so it has its own command instead of
    /// going through [`Game::set_equipment`]'s generic numeric fields.
    pub fn set_equipment_gem(&mut self, dbid: i64, gem_dbid: i64) -> Result<()> {
        if gem_dbid < 0 {
            return Err(Error::invalid("gem id must be zero or a positive id"));
        }
        if gem_dbid != 0 {
            let gem: Option<Option<i64>> = self
                .conn()
                .query_row(
                    "SELECT DELETED_DATE FROM tb_gem WHERE USER_DBID=? AND ITEM_DBID=?",
                    params![self.user_id, gem_dbid],
                    |row| row.get(0),
                )
                .optional()?;
            match gem {
                None => return Err(Error::invalid("that gem is not in this save")),
                Some(Some(0)) => {}
                Some(_) => return Err(Error::invalid("that gem has been deleted")),
            }
            let linked: i64 = self.conn().query_row(
                "SELECT count(*) FROM tb_equipment
                  WHERE USER_DBID=? AND GEM_DBID=? AND ITEM_DBID<>? AND DELETED_DATE=0",
                params![self.user_id, gem_dbid, dbid],
                |row| row.get(0),
            )?;
            if linked > 0 {
                return Err(Error::invalid(
                    "that gem is already linked to another piece of equipment",
                ));
            }
        }
        let changed = self.conn().execute(
            "UPDATE tb_equipment SET GEM_DBID=? WHERE USER_DBID=? AND ITEM_DBID=?",
            params![gem_dbid, self.user_id, dbid],
        )?;
        if changed != 1 {
            return Err(Error::invalid(
                "that equipment piece is not present in this save",
            ));
        }
        self.touch();
        Ok(())
    }

    pub fn gems(&self) -> Result<Vec<Gem>> {
        let mut statement = self.conn().prepare(
            "SELECT ITEM_DBID, ITEM_CID, STAT_INFO_CID, IS_LOCK FROM tb_gem
              WHERE USER_DBID=? AND DELETED_DATE=0 ORDER BY ITEM_CID, ITEM_DBID",
        )?;
        let rows = statement.query_map(params![self.user_id], |row| {
            Ok(Gem {
                dbid: row.get::<_, i64>(0)?.to_string(),
                item: Item::fallback(0, "material"),
                cid: row.get(1)?,
                stat_info_cid: row.get(2)?,
                is_lock: row.get::<_, i64>(3)? != 0,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            let mut gem = row?;
            gem.item = self.catalog.lookup_hint(gem.cid, "material");
            out.push(gem);
        }
        Ok(out)
    }

    pub fn set_gem(&mut self, dbid: i64, field: &str, value: i64) -> Result<()> {
        let column = match field {
            "itemCid" => "ITEM_CID",
            "statInfoCid" => "STAT_INFO_CID",
            "isLock" => "IS_LOCK",
            _ => return Err(Error::invalid(format!("unknown gem field {field:?}"))),
        };
        let max = if column == "IS_LOCK" { 1 } else { MAX_STAT };
        if !(0..=max).contains(&value) {
            return Err(Error::invalid(format!(
                "{field} must be between 0 and {max}"
            )));
        }
        if column == "ITEM_CID" && self.catalog.lookup(value).kind != "GEM" {
            return Err(Error::invalid("that CID is not a gem"));
        }
        let changed = self.conn().execute(
            &format!("UPDATE tb_gem SET {column}=? WHERE USER_DBID=? AND ITEM_DBID=?"),
            params![value, self.user_id, dbid],
        )?;
        if changed != 1 {
            return Err(Error::invalid("that gem is not present in this save"));
        }
        self.touch();
        Ok(())
    }

    // ------------------------------------------------------------------ karma

    pub fn karma(&self) -> Result<Vec<Karma>> {
        let grade = self.adventure_grade()?;
        let mut statement = self.conn().prepare(
            "SELECT k.ITEM_DBID, k.ITEM_CID, k.IS_LOCK, k.EXP, k.ASCEND, k.TRANSCEND, em.CHARACTER_CID
               FROM tb_karma k
               LEFT JOIN tb_equip_mount em
                 ON em.USER_DBID=k.USER_DBID AND em.KARMA=k.ITEM_DBID
              WHERE k.USER_DBID=? AND k.DELETED_DATE=0
              ORDER BY k.ITEM_CID, k.ITEM_DBID",
        )?;
        let rows = statement.query_map(params![self.user_id], |row| {
            Ok(Karma {
                dbid: row.get::<_, i64>(0)?.to_string(),
                item: Item::fallback(0, "material"),
                cid: row.get(1)?,
                is_lock: row.get::<_, i64>(2)? != 0,
                exp: row.get(3)?,
                ascend: row.get(4)?,
                transcend: row.get(5)?,
                equipped_by: row.get(6)?,
                level: 0,
                limits: karma_limits(row.get(1)?, row.get(3)?, row.get(4)?, grade),
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            let mut karma = row?;
            karma.item = self.catalog.lookup_hint(karma.cid, "material");
            karma.level = growth::level_for_exp(Growth::shared().karma_exp(karma.cid), karma.exp);
            out.push(karma);
        }
        Ok(out)
    }

    fn karma_by_dbid(&self, dbid: i64) -> Result<Option<Karma>> {
        Ok(self
            .karma()?
            .into_iter()
            .find(|karma| karma.dbid == dbid.to_string()))
    }

    pub fn set_karma(&mut self, dbid: i64, field: &str, value: i64) -> Result<()> {
        let (cid, exp, ascend): (i64, i64, i64) = self
            .conn()
            .query_row(
                "SELECT ITEM_CID, EXP, ASCEND FROM tb_karma WHERE USER_DBID=? AND ITEM_DBID=?",
                params![self.user_id, dbid],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?
            .ok_or_else(|| Error::invalid("that karma is not present in this save"))?;
        let limits = karma_limits(cid, exp, ascend, self.adventure_grade()?);
        let (column, max) = match field {
            "exp" => ("EXP", limits.exp),
            "ascend" => ("ASCEND", limits.ascend),
            "transcend" => ("TRANSCEND", limits.transcend),
            "isLock" => ("IS_LOCK", 1),
            _ => return Err(Error::invalid(format!("unknown karma field {field:?}"))),
        };
        let current = self
            .current_i64(
                &format!("SELECT {column} FROM tb_karma WHERE USER_DBID=? AND ITEM_DBID=?"),
                params![self.user_id, dbid],
            )?
            .ok_or_else(|| Error::invalid("that karma is not present in this save"))?;
        let max = max.max(current);
        if !(0..=max).contains(&value) {
            return Err(Error::invalid(format!(
                "{field} must be between 0 and {max}"
            )));
        }
        // Karma has no level column; its level comes from its EXP.
        if field == "ascend" && value < current {
            let growth = Growth::shared();
            let level = growth::level_for_exp(growth.karma_exp(cid), exp);
            let needed = growth.stage_for_level(level);
            if value < needed {
                return Err(Error::invalid(format!(
                    "karma level {level} needs breakthrough {needed}; lower the EXP first"
                )));
            }
        }
        self.conn().execute(
            &format!("UPDATE tb_karma SET {column}=? WHERE USER_DBID=? AND ITEM_DBID=?"),
            params![value, self.user_id, dbid],
        )?;
        self.touch();
        Ok(())
    }

    pub fn equip_karma(&mut self, character_cid: i64, dbid: i64) -> Result<()> {
        self.require_character(character_cid)?;
        if dbid != 0 {
            let owned: i64 = self.conn().query_row(
                "SELECT count(*) FROM tb_karma WHERE USER_DBID=? AND ITEM_DBID=? AND DELETED_DATE=0",
                params![self.user_id, dbid],
                |row| row.get(0),
            )?;
            if owned == 0 {
                return Err(Error::invalid("that karma is not owned in this save"));
            }
        }
        let transaction = self.conn().unchecked_transaction()?;
        if dbid != 0 {
            transaction.execute(
                "UPDATE tb_equip_mount SET KARMA=0
                  WHERE USER_DBID=? AND KARMA=? AND CHARACTER_CID<>?",
                params![self.user_id, dbid, character_cid],
            )?;
        }
        transaction.execute(
            "INSERT INTO tb_equip_mount
                (USER_DBID, CHARACTER_CID, ACC_HEAD, ACC_CHEST, ACC_LEG, ACC_HAND, ACC_FOOT,
                 TALISMAN_1, TALISMAN_2, KARMA, VEHICLE)
             VALUES (?,?,0,0,0,0,0,0,0,?,0)
             ON CONFLICT(USER_DBID, CHARACTER_CID) DO UPDATE SET KARMA=excluded.KARMA",
            params![self.user_id, character_cid, dbid],
        )?;
        transaction.commit()?;
        self.touch();
        Ok(())
    }

    // --------------------------------------------------------------- costumes

    pub fn costumes(&self) -> Result<Vec<Costume>> {
        let mut statement = self.conn().prepare(
            "SELECT COSTUME_DBID, COSTUME_CID, EQUIP_CHARACTER_CID, PARTS_ON, IS_NEW
               FROM tb_costume WHERE USER_DBID=? ORDER BY COSTUME_CID, COSTUME_DBID",
        )?;
        let rows = statement.query_map(params![self.user_id], |row| {
            Ok(Costume {
                dbid: row.get::<_, i64>(0)?.to_string(),
                item: Item::fallback(0, "costume"),
                cid: row.get(1)?,
                equip_character_cid: row.get(2)?,
                parts_on: row.get(3)?,
                is_new: row.get::<_, i64>(4)? != 0,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            let mut costume = row?;
            costume.item = self.catalog.lookup_hint(costume.cid, "costume");
            out.push(costume);
        }
        Ok(out)
    }

    pub fn costume_catalog(&self) -> Result<Vec<CatalogEntry>> {
        let owned: std::collections::HashSet<i64> = self
            .costumes()?
            .into_iter()
            .map(|costume| costume.cid)
            .collect();
        Ok(self
            .catalog
            .entries_in("costume")
            .into_iter()
            .map(|item| CatalogEntry {
                owned: owned.contains(&item.cid),
                item,
            })
            .collect())
    }

    pub fn unlock_costume(&mut self, cid: i64) -> Result<bool> {
        if self.catalog.lookup(cid).category != "costume" {
            return Err(Error::invalid(format!("CID {cid} is not a costume")));
        }
        let exists: i64 = self.conn().query_row(
            "SELECT count(*) FROM tb_costume WHERE USER_DBID=? AND COSTUME_CID=?",
            params![self.user_id, cid],
            |row| row.get(0),
        )?;
        if exists > 0 {
            return Ok(false);
        }
        let next = self.mint_id("tb_costume", "COSTUME_DBID")?;
        self.conn().execute(
            "INSERT INTO tb_costume
                (COSTUME_DBID, USER_DBID, COSTUME_CID, EQUIP_CHARACTER_CID,
                 CREATED_DATE, PARTS_ON, IS_NEW)
             VALUES (?,?,?,0,strftime('%s','now'),1,1)",
            params![next, self.user_id, cid],
        )?;
        self.touch();
        Ok(true)
    }

    pub fn equip_costume(&mut self, dbid: i64, character_cid: i64) -> Result<()> {
        if character_cid != 0 {
            self.require_character(character_cid)?;
        }
        let changed = self.conn().execute(
            "UPDATE tb_costume SET EQUIP_CHARACTER_CID=? WHERE USER_DBID=? AND COSTUME_DBID=?",
            params![character_cid, self.user_id, dbid],
        )?;
        if changed != 1 {
            return Err(Error::invalid("that costume is not owned in this save"));
        }
        self.touch();
        Ok(())
    }

    // ---------------------------------------------------------------- mounts

    pub fn mounts(&self) -> Result<Vec<Vehicle>> {
        let mut statement = self.conn().prepare(
            "SELECT v.VEHICLE_DBID, v.VEHICLE_CID, em.CHARACTER_CID
               FROM tb_vehicle v
               LEFT JOIN tb_equip_mount em
                 ON em.USER_DBID=v.USER_DBID AND em.VEHICLE=v.VEHICLE_DBID
              WHERE v.USER_DBID=? ORDER BY v.VEHICLE_CID, v.VEHICLE_DBID",
        )?;
        let rows = statement.query_map(params![self.user_id], |row| {
            Ok(Vehicle {
                dbid: row.get::<_, i64>(0)?.to_string(),
                item: Item::fallback(0, "mount"),
                cid: row.get(1)?,
                equipped_by: row.get(2)?,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            let mut vehicle = row?;
            vehicle.item = self.catalog.lookup_hint(vehicle.cid, "mount");
            out.push(vehicle);
        }
        Ok(out)
    }

    fn vehicle_by_dbid(&self, dbid: i64) -> Result<Option<Vehicle>> {
        Ok(self
            .mounts()?
            .into_iter()
            .find(|vehicle| vehicle.dbid == dbid.to_string()))
    }

    pub fn mount_catalog(&self) -> Result<Vec<CatalogEntry>> {
        let owned: std::collections::HashSet<i64> = self
            .mounts()?
            .into_iter()
            .map(|vehicle| vehicle.cid)
            .collect();
        Ok(self
            .catalog
            .entries_in("mount")
            .into_iter()
            .map(|item| CatalogEntry {
                owned: owned.contains(&item.cid),
                item,
            })
            .collect())
    }

    pub fn unlock_mount(&mut self, cid: i64) -> Result<bool> {
        if self.catalog.lookup(cid).category != "mount" {
            return Err(Error::invalid(format!("CID {cid} is not a mount")));
        }
        let exists: i64 = self.conn().query_row(
            "SELECT count(*) FROM tb_vehicle WHERE USER_DBID=? AND VEHICLE_CID=?",
            params![self.user_id, cid],
            |row| row.get(0),
        )?;
        if exists > 0 {
            return Ok(false);
        }
        let next = self.mint_id("tb_vehicle", "VEHICLE_DBID")?;
        self.conn().execute(
            "INSERT INTO tb_vehicle (VEHICLE_DBID, USER_DBID, VEHICLE_CID, CREATED_DATE)
             VALUES (?,?,?,CAST(strftime('%s','now','localtime') AS INTEGER))",
            params![next, self.user_id, cid],
        )?;
        self.touch();
        Ok(true)
    }

    pub fn equip_mount(&mut self, character_cid: i64, dbid: i64) -> Result<()> {
        self.require_character(character_cid)?;
        if dbid != 0 {
            let owned: i64 = self.conn().query_row(
                "SELECT count(*) FROM tb_vehicle WHERE USER_DBID=? AND VEHICLE_DBID=?",
                params![self.user_id, dbid],
                |row| row.get(0),
            )?;
            if owned == 0 {
                return Err(Error::invalid("that mount is not owned in this save"));
            }
        }
        let transaction = self.conn().unchecked_transaction()?;
        if dbid != 0 {
            transaction.execute(
                "UPDATE tb_equip_mount SET VEHICLE=0
                  WHERE USER_DBID=? AND VEHICLE=? AND CHARACTER_CID<>?",
                params![self.user_id, dbid, character_cid],
            )?;
        }
        transaction.execute(
            "INSERT INTO tb_equip_mount
                (USER_DBID, CHARACTER_CID, ACC_HEAD, ACC_CHEST, ACC_LEG, ACC_HAND, ACC_FOOT,
                 TALISMAN_1, TALISMAN_2, KARMA, VEHICLE)
             VALUES (?,?,0,0,0,0,0,0,0,0,?)
             ON CONFLICT(USER_DBID, CHARACTER_CID) DO UPDATE SET VEHICLE=excluded.VEHICLE",
            params![self.user_id, character_cid, dbid],
        )?;
        transaction.commit()?;
        self.touch();
        Ok(())
    }

    // ---------------------------------------------------------------- titles

    pub fn titles(&self) -> Result<Vec<TitleEntry>> {
        let bits = self.bitmask_map("tb_title")?;
        let favorites = self.favorite_title_bits()?;
        Ok(self
            .catalog
            .titles()
            .iter()
            .map(|title| {
                let category = title.id / 64;
                let bit = title.id % 64;
                TitleEntry {
                    id: title.id,
                    category,
                    bit,
                    name_fr: title.name_fr.clone(),
                    name_en: title.name_en.clone(),
                    color: title.color.clone(),
                    stats: title.stats.clone(),
                    unlocked: bit_is_set(&bits, category, bit),
                    favorite: bit_is_set(&favorites, category, bit),
                }
            })
            .collect())
    }

    fn favorite_title_bits(&self) -> Result<HashMap<i64, u64>> {
        let mut statement = self
            .conn()
            .prepare("SELECT CATEGORY, FAV_BIT_FIELD FROM tb_title WHERE USER_DBID=?")?;
        let rows = statement.query_map(params![self.user_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, Option<i64>>(1)?.unwrap_or(0),
            ))
        })?;
        let mut out = HashMap::new();
        for row in rows {
            let (category, field) = row?;
            out.insert(category, field as u64);
        }
        Ok(out)
    }

    pub fn set_title_unlocked(&mut self, id: i64, unlocked: bool) -> Result<()> {
        let category = id / 64;
        let bit = id % 64;
        let current = self.read_bitmask("tb_title", category)?;
        let field = set_bit(current, bit, unlocked);
        if unlocked {
            self.upsert_title_field(category, field)?;
        } else {
            // A locked title cannot stay favorited or selected: the game would
            // show a title the account no longer owns. Keep every other
            // favorite in the category untouched.
            let favorites = self
                .favorite_title_bits()?
                .get(&category)
                .copied()
                .unwrap_or(0);
            self.upsert_title_fields(category, field, set_bit(favorites, bit, false))?;
            self.conn().execute(
                "UPDATE tb_user SET TITLE_CID=0 WHERE USER_DBID=? AND TITLE_CID=?",
                params![self.user_id, id],
            )?;
        }
        self.touch();
        Ok(())
    }

    pub fn unlock_all_titles(&mut self) -> Result<i64> {
        let mut masks: HashMap<i64, u64> = HashMap::new();
        for title in self.catalog.titles() {
            *masks.entry(title.id / 64).or_default() |= 1u64 << (title.id % 64);
        }
        for (category, mask) in &masks {
            let current = self.read_bitmask("tb_title", *category)?;
            self.upsert_title_field(*category, current | mask)?;
        }
        self.touch();
        Ok(masks.len() as i64)
    }

    fn upsert_title_field(&self, category: i64, field: u64) -> Result<()> {
        self.conn().execute(
            "INSERT INTO tb_title (USER_DBID, CATEGORY, BIT_FIELD, FAV_BIT_FIELD) VALUES (?,?,?,0)
             ON CONFLICT(USER_DBID, CATEGORY) DO UPDATE SET BIT_FIELD=excluded.BIT_FIELD",
            params![self.user_id, category, field as i64],
        )?;
        Ok(())
    }

    fn upsert_title_fields(&self, category: i64, field: u64, favorites: u64) -> Result<()> {
        self.conn().execute(
            "INSERT INTO tb_title (USER_DBID, CATEGORY, BIT_FIELD, FAV_BIT_FIELD) VALUES (?,?,?,?)
             ON CONFLICT(USER_DBID, CATEGORY) DO UPDATE SET
                 BIT_FIELD=excluded.BIT_FIELD,
                 FAV_BIT_FIELD=excluded.FAV_BIT_FIELD",
            params![self.user_id, category, field as i64, favorites as i64],
        )?;
        Ok(())
    }

    // --------------------------------------------------------------- recipes

    pub fn recipes(&self) -> Result<Vec<Recipe>> {
        let bits = self.bitmask_map("tb_switch")?;
        let owned_by_cid = self.stackable_counts()?;
        let mut owned_by_group: HashMap<i64, i64> = HashMap::new();
        for (cid, count) in &owned_by_cid {
            if let Ok(group) = self.catalog.lookup(*cid).group.parse::<i64>() {
                *owned_by_group.entry(group).or_default() += count;
            }
        }
        let mut out = Vec::with_capacity(self.catalog.recipes().len());
        for seed in self.catalog.recipes() {
            let category = seed.key / 64;
            let bit = seed.key % 64;
            let mut ingredients: Vec<RecipeIngredient> = Vec::new();
            let mut index: HashMap<String, usize> = HashMap::new();
            for ingredient in &seed.ingredients {
                let key = format!("{}:{}", ingredient.kind, ingredient.id);
                if let Some(position) = index.get(&key) {
                    ingredients[*position].qty += 1;
                    continue;
                }
                let resolved = match ingredient.kind.as_str() {
                    "item" => {
                        let item = self.catalog.lookup(ingredient.id);
                        RecipeIngredient {
                            kind: "item".into(),
                            id: ingredient.id,
                            name_fr: item.name_fr.clone(),
                            name_en: item.name_en.clone(),
                            qty: 1,
                            owned: owned_by_cid.get(&ingredient.id).copied().unwrap_or(0),
                            icon_cid: Some(item.cid),
                            icon_path: item.icon_path.clone(),
                        }
                    }
                    _ => {
                        let label = self.catalog.category(&ingredient.id.to_string());
                        let icon_cid = self.catalog.ingredient_icon(ingredient.id);
                        RecipeIngredient {
                            kind: "type".into(),
                            id: ingredient.id,
                            name_fr: label
                                .map(|label| label.label_fr.clone())
                                .unwrap_or_else(|| format!("Category {}", ingredient.id)),
                            name_en: label
                                .map(|label| label.label_en.clone())
                                .unwrap_or_else(|| format!("Category {}", ingredient.id)),
                            qty: 1,
                            owned: owned_by_group.get(&ingredient.id).copied().unwrap_or(0),
                            icon_cid,
                            icon_path: icon_cid
                                .map(|cid| self.catalog.lookup(cid).icon_path)
                                .unwrap_or_default(),
                        }
                    }
                };
                index.insert(key, ingredients.len());
                ingredients.push(resolved);
            }
            let dish = seed
                .dishes
                .first()
                .map(|cid| self.catalog.lookup_hint(*cid, "food"))
                .unwrap_or_else(|| Item::fallback(0, "food"));
            out.push(Recipe {
                key: seed.key,
                category,
                bit,
                tool: seed.tool.clone(),
                known: bit_is_set(&bits, category, bit),
                ingredients,
                dish,
                dishes: seed.dishes.clone(),
                effect_name: seed.effect_name.clone(),
                effects: seed.effects.clone(),
            });
        }
        Ok(out)
    }

    fn stackable_counts(&self) -> Result<HashMap<i64, i64>> {
        let mut statement = self
            .conn()
            .prepare("SELECT ITEM_CID, STACK_CNT FROM tb_stackable_item WHERE USER_DBID=?")?;
        let rows = statement.query_map(params![self.user_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })?;
        let mut out = HashMap::new();
        for row in rows {
            let (cid, count) = row?;
            out.insert(cid, count);
        }
        Ok(out)
    }

    pub fn set_recipe_known(&mut self, key: i64, known: bool) -> Result<()> {
        if self.catalog.recipe(key).is_none() {
            return Err(Error::invalid(format!("unknown recipe key {key}")));
        }
        let category = key / 64;
        let bit = key % 64;
        let current = self.read_bitmask("tb_switch", category)?;
        let field = set_bit(current, bit, known);
        self.conn().execute(
            "INSERT OR REPLACE INTO tb_switch (USER_DBID, CATEGORY, BIT_FIELD) VALUES (?,?,?)",
            params![self.user_id, category, field as i64],
        )?;
        self.touch();
        Ok(())
    }

    pub fn unlock_all_recipes(&mut self) -> Result<i64> {
        let mut masks: HashMap<i64, u64> = HashMap::new();
        for recipe in self.catalog.recipes() {
            *masks.entry(recipe.key / 64).or_default() |= 1u64 << (recipe.key % 64);
        }
        for (category, mask) in &masks {
            let current = self.read_bitmask("tb_switch", *category)?;
            self.conn().execute(
                "INSERT OR REPLACE INTO tb_switch (USER_DBID, CATEGORY, BIT_FIELD) VALUES (?,?,?)",
                params![self.user_id, category, (current | mask) as i64],
            )?;
        }
        self.touch();
        Ok(masks.len() as i64)
    }

    // ------------------------------------------------------------------ bits

    fn bitmask_map(&self, table: &str) -> Result<HashMap<i64, u64>> {
        let mut statement = self.conn().prepare(&format!(
            "SELECT CATEGORY, BIT_FIELD FROM {table} WHERE USER_DBID=?"
        ))?;
        let rows = statement.query_map(params![self.user_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })?;
        let mut out = HashMap::new();
        for row in rows {
            let (category, field) = row?;
            out.insert(category, field as u64);
        }
        Ok(out)
    }

    fn read_bitmask(&self, table: &str, category: i64) -> Result<u64> {
        let field: Option<i64> = self
            .conn()
            .query_row(
                &format!("SELECT BIT_FIELD FROM {table} WHERE USER_DBID=? AND CATEGORY=?"),
                params![self.user_id, category],
                |row| row.get(0),
            )
            .optional()?;
        Ok(field.unwrap_or(0) as u64)
    }

    /// Costume and mount instance ids look random in real saves and fit a
    /// uint32; mint one that is free in the target table.
    fn mint_id(&self, table: &str, column: &str) -> Result<i64> {
        for _ in 0..1000 {
            let candidate = i64::from(rand::random::<u32>().max(1));
            let taken: i64 = self.conn().query_row(
                &format!("SELECT count(*) FROM {table} WHERE {column}=?"),
                params![candidate],
                |row| row.get(0),
            )?;
            if taken == 0 {
                return Ok(candidate);
            }
        }
        Err(Error::invalid("could not allocate a free instance id"))
    }

    fn require_character(&self, cid: i64) -> Result<()> {
        if cid <= 0 {
            return Err(Error::invalid("choose a character first"));
        }
        let owned: i64 = self.conn().query_row(
            "SELECT count(*) FROM tb_character WHERE USER_DBID=? AND CHARACTER_CID=?",
            params![self.user_id, cid],
            |row| row.get(0),
        )?;
        if owned == 0 {
            return Err(Error::invalid("that character is not owned in this save"));
        }
        Ok(())
    }
}

// -------------------------------------------------------------------- types

/// The rewards of one completed quest.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestRewards {
    pub quest_id: i64,
    pub category: String,
    pub name_en: String,
    pub name_fr: String,
    pub gold: i64,
    /// Mercenary Corps EXP. Never granted: it would move the corps level
    /// without the level's own rewards.
    pub adv_exp: i64,
    pub items: Vec<RewardItem>,
    /// Why the editor cannot complete this quest, for a quest in progress.
    pub blocked: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RewardItem {
    pub item: Item,
    pub count: i64,
    pub route: RewardRoute,
}

/// How the editor can hand a reward item out.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RewardRoute {
    Currency,
    /// A `tb_stackable_item` count.
    Stack,
    /// A `tb_vehicle` row, through the same path as unlocking a mount.
    Mount,
    /// A title bit in `tb_title`; a title's item CID is its title ID.
    Title,
    /// A hero item: the hero joins the roster.
    Hero,
    /// A cooked dish: a `tb_cook_item` stack.
    Dish,
    /// Equipment the game data can roll: one new `tb_equipment` row per piece.
    Equipment,
    /// Hero items the game data does not map to a hero, and anything else.
    None,
}

/// Picks one row by weight, skipping rows whose stat is already `taken`.
fn roll_stat<'a>(
    rng: &mut impl rand::Rng,
    choices: &'a [crate::growth::StatChoice],
    taken: &[&str],
) -> Option<&'a crate::growth::StatChoice> {
    let open: Vec<&crate::growth::StatChoice> = choices
        .iter()
        .filter(|choice| !taken.contains(&choice.2.as_str()))
        .collect();
    let total: i64 = open.iter().map(|choice| choice.1).sum();
    if total <= 0 {
        return None;
    }
    let mut pick = rng.gen_range(0..total);
    open.into_iter().find(|choice| {
        pick -= choice.1;
        pick < 0
    })
}

fn reward_route(item: &Item) -> RewardRoute {
    if item.category == "currency" {
        RewardRoute::Currency
    } else if item.category == "mount" {
        RewardRoute::Mount
    } else if item.kind == "ACCOUNT_TITLE" {
        RewardRoute::Title
    } else if Growth::shared().hero_for_item(item.cid).is_some() {
        RewardRoute::Hero
    } else if item.category == "food" {
        RewardRoute::Dish
    } else if Growth::shared().equipment(item.cid).is_some() {
        RewardRoute::Equipment
    } else if item.is_stackable() {
        RewardRoute::Stack
    } else {
        RewardRoute::None
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RewardCount {
    pub item: Item,
    pub count: i64,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RewardGrant {
    pub granted: Vec<RewardCount>,
    pub not_granted: Vec<RewardCount>,
    pub adv_exp_not_granted: i64,
}

/// Adds `count` of an item to a reward list, merging repeats.
fn note(list: &mut Vec<RewardCount>, item: Item, count: i64) {
    match list.iter_mut().find(|seen| seen.item.cid == item.cid) {
        Some(seen) => seen.count += count,
        None => list.push(RewardCount { item, count }),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestRef {
    pub quest_id: i64,
    pub name_en: String,
    pub name_fr: String,
}

/// A hero the game hands out, for the recruit list.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeroEntry {
    pub cid: i64,
    /// The hero's item, for its name and icon.
    pub item: Item,
    pub sources: Vec<String>,
    pub owned: bool,
}

/// What completing a quest did.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestCompletion {
    pub grant: RewardGrant,
    /// Heroes the quest brought onto the roster.
    pub joined: Vec<Item>,
    pub levels_gained: i64,
    pub new_grade: Option<i64>,
    /// The quests the completion started.
    pub started: Vec<QuestRef>,
}

/// Growth ceilings for one hero, karma or the Mercenary Corps. Existing values
/// above a ceiling stay editable because every setter uses `max(limit,
/// current)`; the EXP range already includes the current value.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrowthLimits {
    /// The row's `ASCEND`, clamped to the stages its grade unlocks.
    pub stage: i64,
    /// The breakthrough stages the grade unlocks, the ascension cap.
    pub ascend: i64,
    /// The last breakthrough the region's live servers allow.
    pub max_stage: i64,
    /// The level cap at this stage.
    pub level: i64,
    /// The lowest EXP the row's current level allows.
    pub exp_min: i64,
    /// The highest EXP the row's current level allows. A row at its level cap
    /// sits at the level's start, because the game refunds EXP past the cap.
    pub exp: i64,
    pub transcend: i64,
    /// Active skills, slots 1–4.
    pub skill_low: i64,
    /// Basic skills, slots 5–7.
    pub skill_mid: i64,
    /// The special 801 slot.
    pub skill_special: i64,
}

fn hero_limits(level: i64, exp: i64, ascend: i64, grade: i64) -> GrowthLimits {
    let growth = Growth::shared();
    let unlocked = growth.max_character_stage(grade, REGION);
    let stage = ascend.clamp(0, unlocked);
    let cap = growth.level_cap(stage);
    let (low, high) = growth::exp_range(growth.hero_exp(), level, cap).unwrap_or((exp, exp));
    let skill = |type_value| growth.skill_cap(type_value, stage, REGION).unwrap_or(0);
    GrowthLimits {
        stage,
        ascend: unlocked,
        max_stage: growth.region(REGION).max_character_ascend,
        level: cap,
        exp_min: low.min(exp),
        exp: high.max(exp),
        transcend: growth.max_character_transcend(),
        skill_low: skill(1),
        skill_mid: skill(5),
        skill_special: skill(801),
    }
}

/// Karma has no level column: its EXP is a running total in the table for
/// its rarity, so the EXP cap is the EXP that starts the stage's level cap.
fn karma_limits(cid: i64, exp: i64, ascend: i64, grade: i64) -> GrowthLimits {
    let growth = Growth::shared();
    let unlocked = growth.max_karma_stage(grade, REGION);
    let stage = ascend.clamp(0, unlocked);
    let cap = growth.level_cap(stage);
    let table = growth.karma_exp(cid);
    let high = growth::start_exp(table, cap)
        .or_else(|| table.last().copied())
        .unwrap_or(exp);
    GrowthLimits {
        stage,
        ascend: unlocked,
        max_stage: growth.region(REGION).max_karma_ascend,
        level: cap,
        exp_min: 0,
        exp: high,
        transcend: growth.max_karma_transcend(),
        skill_low: 0,
        skill_mid: 0,
        skill_special: 0,
    }
}

/// The Mercenary Corps has no breakthrough; its level caps at the region's
/// live maximum.
fn corps_limits(level: i64, exp: i64) -> GrowthLimits {
    let growth = Growth::shared();
    let cap = growth.region(REGION).max_advent_level;
    let (low, high) = growth::exp_range(growth.advent_exp(), level, cap).unwrap_or((exp, exp));
    GrowthLimits {
        stage: 0,
        ascend: 0,
        max_stage: 0,
        level: cap,
        exp_min: low.min(exp),
        exp: high.max(exp),
        transcend: 0,
        skill_low: 0,
        skill_mid: 0,
        skill_special: 0,
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub account_id: i64,
    pub player_name: String,
    pub adventure_grade: i64,
    pub adventure_level: i64,
    pub adventure_exp: i64,
    pub play_time: i64,
    pub region_cid: i64,
    pub section_uid: i64,
    pub stamina: i64,
    pub max_stamina: i64,
    pub title_cid: i64,
    pub created_at: String,
    pub last_login: String,
    pub last_logout: String,
    pub position: [i64; 3],
    pub counts: Counts,
    pub currencies: Vec<Currency>,
    /// Breakthrough stages the grade unlocks, the ascension cap for every row.
    pub max_ascend: i64,
    /// The grade's rank name in the game's English and French strings.
    pub adventure_rank_en: String,
    pub adventure_rank_fr: String,
    /// Promotion quests the save records as complete, out of the region's
    /// total. Each one should match a grade above 1.
    pub promotions_completed: i64,
    pub promotions_total: i64,
    pub adventure_limits: GrowthLimits,
    pub story: Story,
}

/// Main-story progress, from the quest tables the save records.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Story {
    pub completed: i64,
    pub total: i64,
    /// The quest in progress, or the first one not done.
    pub current: Option<growth::MainQuest>,
    pub next_promotion: Option<NextPromotion>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NextPromotion {
    pub grade: i64,
    pub rank_en: String,
    pub rank_fr: String,
    /// The main quest the exam waits for.
    pub requires: growth::MainQuest,
    pub story_done: bool,
}

struct OverviewUser {
    account_id: i64,
    region_cid: i64,
    section_uid: i64,
    position: [i64; 3],
    stamina: i64,
    max_stamina: i64,
    title_cid: i64,
    last_login: String,
    last_logout: String,
    created_at: String,
}

#[derive(Default)]
struct AdventStatus {
    grade: i64,
    level: i64,
    exp: i64,
    name: String,
    play_time: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub characters: i64,
    pub currencies: i64,
    pub stackables: i64,
    pub equipment: i64,
    pub gems: i64,
    pub karma: i64,
    pub costumes: i64,
    pub mounts: i64,
    pub titles_unlocked: i64,
    pub titles_total: i64,
    pub recipes_known: i64,
    pub recipes_total: i64,
    pub quests_completed: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Currency {
    pub item: Item,
    pub amount: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stack {
    pub item: Item,
    pub kind: String,
    pub id: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Character {
    pub item: Item,
    pub cid: i64,
    pub level: i64,
    pub exp: i64,
    pub ascend: i64,
    pub hp: i64,
    pub transcend: i64,
    pub transcend_total: i64,
    pub soldier_grade: i64,
    pub soldier_grade_point: i64,
    pub created_at: i64,
    /// False for a story hero whose row the game seeded but who has not
    /// joined the team yet.
    pub joined: bool,
    pub limits: GrowthLimits,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub type_value: i64,
    pub level: i64,
}

fn team_rows(conn: &Connection, user_id: i64) -> Result<Vec<(i64, [i64; 3])>> {
    let mut statement = conn.prepare(
        "SELECT PAGE_ID, SLOT1_CHARACTER_CID, SLOT2_CHARACTER_CID, SLOT3_CHARACTER_CID
           FROM tb_team WHERE USER_DBID=? ORDER BY PAGE_ID",
    )?;
    let rows = statement.query_map(params![user_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            [
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
            ],
        ))
    })?;
    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}

fn selected_team(conn: &Connection, user_id: i64) -> Result<Option<(i64, i64)>> {
    Ok(conn
        .query_row(
            "SELECT SELECTED_TEAM_PAGE_ID, SELECTED_PAGE_SLOT_INDEX
               FROM tb_user WHERE USER_DBID=?",
            params![user_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamSlot {
    pub item: Option<Item>,
    pub cid: i64,
    pub level: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamPage {
    pub page_id: i64,
    pub slots: Vec<TeamSlot>,
    /// True for the page the game currently treats as active.
    pub selected: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadoutEntry {
    pub dbid: String,
    pub item: Item,
    pub enchant_level: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Loadout {
    pub character_cid: i64,
    pub head: Option<LoadoutEntry>,
    pub chest: Option<LoadoutEntry>,
    pub leg: Option<LoadoutEntry>,
    pub hand: Option<LoadoutEntry>,
    pub foot: Option<LoadoutEntry>,
    pub karma: Option<LoadoutEntry>,
    pub vehicle: Option<LoadoutEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Equipment {
    pub dbid: String,
    pub item: Item,
    pub cid: i64,
    pub enchant_level: i64,
    pub exp: i64,
    pub is_lock: bool,
    pub gem_dbid: String,
    pub main_stat_cid: i64,
    pub sub_stat_cids: Vec<i64>,
    pub main_stat_value: i64,
    pub sub_stat_values: Vec<i64>,
    pub has_stat_values: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Gem {
    pub dbid: String,
    pub item: Item,
    pub cid: i64,
    pub stat_info_cid: i64,
    pub is_lock: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Karma {
    pub dbid: String,
    pub item: Item,
    pub cid: i64,
    pub is_lock: bool,
    pub exp: i64,
    pub ascend: i64,
    pub transcend: i64,
    pub equipped_by: Option<i64>,
    /// The level the karma's EXP reaches in its rarity's table.
    pub level: i64,
    pub limits: GrowthLimits,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Costume {
    pub dbid: String,
    pub item: Item,
    pub cid: i64,
    pub equip_character_cid: i64,
    pub parts_on: i64,
    pub is_new: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Vehicle {
    pub dbid: String,
    pub item: Item,
    pub cid: i64,
    pub equipped_by: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    pub item: Item,
    pub owned: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TitleEntry {
    pub id: i64,
    pub category: i64,
    pub bit: i64,
    pub name_fr: String,
    pub name_en: String,
    pub color: String,
    pub stats: Vec<TitleStat>,
    pub unlocked: bool,
    pub favorite: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeIngredient {
    pub kind: String,
    pub id: i64,
    pub name_fr: String,
    pub name_en: String,
    pub qty: i64,
    pub owned: i64,
    pub icon_cid: Option<i64>,
    pub icon_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recipe {
    pub key: i64,
    pub category: i64,
    pub bit: i64,
    pub tool: String,
    pub known: bool,
    pub ingredients: Vec<RecipeIngredient>,
    pub dish: Item,
    pub dishes: Vec<i64>,
    pub effect_name: Option<EffectText>,
    pub effects: Vec<EffectText>,
}

// ------------------------------------------------------------------ helpers

fn bit_is_set(map: &HashMap<i64, u64>, category: i64, bit: i64) -> bool {
    map.get(&category)
        .is_some_and(|field| field >> bit & 1 == 1)
}

fn set_bit(field: u64, bit: i64, value: bool) -> u64 {
    if value {
        field | (1u64 << bit)
    } else {
        field & !(1u64 << bit)
    }
}

fn table_columns(conn: &Connection, table: &str) -> Result<std::collections::HashSet<String>> {
    let mut statement = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = statement.query_map([], |row| row.get::<_, String>(1))?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}
