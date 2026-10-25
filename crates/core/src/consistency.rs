//! Cross-row checks that SQLite cannot enforce: the game's schema has no
//! foreign keys, so a link can point at a row that is missing or deleted.
//!
//! The checker reports the damage a save already had when it opened. A write is
//! refused only when the edit would add a new broken link, so a save that
//! already carries damage can still be repaired and written.

use std::collections::{BTreeMap, HashSet};

use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;

use crate::error::Result;

/// Broken links found in one save. Empty lists mean the checked links are
/// consistent.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsistencyReport {
    pub dangling_gem_links: Vec<GemLink>,
    pub duplicate_gem_links: Vec<DuplicateGemLink>,
    pub team_issues: Vec<TeamIssue>,
}

/// An equipment row whose `GEM_DBID` names no live gem.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GemLink {
    pub equipment_dbid: String,
    pub gem_dbid: String,
}

/// One gem instance linked from more than one live equipment row.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGemLink {
    pub gem_dbid: String,
    pub equipment_dbids: Vec<String>,
}

/// A saved team page that the game would not accept as-is.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamIssue {
    pub page_id: i64,
    pub kind: String,
    pub detail: String,
}

impl ConsistencyReport {
    pub fn is_clean(&self) -> bool {
        self.dangling_gem_links.is_empty()
            && self.duplicate_gem_links.is_empty()
            && self.team_issues.is_empty()
    }

    /// The problems that are not in `baseline`. A save that already had a
    /// broken link may keep it; a new one blocks the write.
    pub fn new_since(&self, baseline: &Self) -> Self {
        Self {
            dangling_gem_links: self
                .dangling_gem_links
                .iter()
                .filter(|link| !baseline.dangling_gem_links.contains(link))
                .cloned()
                .collect(),
            duplicate_gem_links: self
                .duplicate_gem_links
                .iter()
                .filter(|link| !baseline.duplicate_gem_links.contains(link))
                .cloned()
                .collect(),
            team_issues: self
                .team_issues
                .iter()
                .filter(|issue| !baseline.team_issues.contains(issue))
                .cloned()
                .collect(),
        }
    }

    pub fn details(&self) -> String {
        let mut out = Vec::new();
        for link in &self.dangling_gem_links {
            out.push(format!(
                "equipment {} links gem {}, which is missing or deleted",
                link.equipment_dbid, link.gem_dbid
            ));
        }
        for link in &self.duplicate_gem_links {
            out.push(format!(
                "gem {} is linked to pieces {}",
                link.gem_dbid,
                link.equipment_dbids.join(", ")
            ));
        }
        for issue in &self.team_issues {
            out.push(issue.detail.clone());
        }
        out.join("; ")
    }
}

/// Check the links and team rules that the game's schema does not enforce.
pub(crate) fn check(conn: &Connection, user_id: i64) -> Result<ConsistencyReport> {
    let mut report = ConsistencyReport::default();
    if has_column(conn, "tb_equipment", "GEM_DBID")?
        && has_column(conn, "tb_equipment", "DELETED_DATE")?
        && has_column(conn, "tb_gem", "DELETED_DATE")?
    {
        check_gem_links(conn, user_id, &mut report)?;
    }
    check_teams(conn, user_id, &mut report)?;
    Ok(report)
}

fn check_gem_links(conn: &Connection, user_id: i64, report: &mut ConsistencyReport) -> Result<()> {
    let mut links: BTreeMap<i64, Vec<i64>> = BTreeMap::new();
    let mut statement = conn.prepare(
        "SELECT ITEM_DBID, GEM_DBID FROM tb_equipment
          WHERE USER_DBID=? AND DELETED_DATE=0 AND GEM_DBID<>0
          ORDER BY ITEM_DBID",
    )?;
    let rows = statement.query_map(params![user_id], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
    })?;
    for row in rows {
        let (equipment, gem) = row?;
        links.entry(gem).or_default().push(equipment);
    }
    if links.is_empty() {
        return Ok(());
    }

    let mut live = HashSet::new();
    let mut statement =
        conn.prepare("SELECT ITEM_DBID FROM tb_gem WHERE USER_DBID=? AND DELETED_DATE=0")?;
    let rows = statement.query_map(params![user_id], |row| row.get::<_, i64>(0))?;
    for row in rows {
        live.insert(row?);
    }

    for (gem, pieces) in links {
        if !live.contains(&gem) {
            for equipment in &pieces {
                report.dangling_gem_links.push(GemLink {
                    equipment_dbid: equipment.to_string(),
                    gem_dbid: gem.to_string(),
                });
            }
        }
        if pieces.len() > 1 {
            report.duplicate_gem_links.push(DuplicateGemLink {
                gem_dbid: gem.to_string(),
                equipment_dbids: pieces.iter().map(ToString::to_string).collect(),
            });
        }
    }
    Ok(())
}

fn check_teams(conn: &Connection, user_id: i64, report: &mut ConsistencyReport) -> Result<()> {
    let team_columns = [
        "PAGE_ID",
        "SLOT1_CHARACTER_CID",
        "SLOT2_CHARACTER_CID",
        "SLOT3_CHARACTER_CID",
    ];
    for column in team_columns {
        if !has_column(conn, "tb_team", column)? {
            return Ok(());
        }
    }

    let owned: Option<HashSet<i64>> = if has_column(conn, "tb_character", "CHARACTER_CID")? {
        let mut owned = HashSet::new();
        let mut statement =
            conn.prepare("SELECT CHARACTER_CID FROM tb_character WHERE USER_DBID=?")?;
        let rows = statement.query_map(params![user_id], |row| row.get::<_, i64>(0))?;
        for row in rows {
            owned.insert(row?);
        }
        Some(owned)
    } else {
        None
    };

    let mut teams = Vec::new();
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
    for row in rows {
        teams.push(row?);
    }

    for (page_id, slots) in &teams {
        let filled = slots.iter().filter(|cid| **cid != 0).count();
        if filled == 0 {
            report.team_issues.push(TeamIssue {
                page_id: *page_id,
                kind: "empty-page".into(),
                detail: format!("team page {page_id} has no characters"),
            });
        }

        let mut positions: BTreeMap<i64, Vec<usize>> = BTreeMap::new();
        for (index, cid) in slots.iter().enumerate() {
            if *cid != 0 {
                positions.entry(*cid).or_default().push(index + 1);
            }
        }
        for (cid, slots_with_cid) in positions {
            if slots_with_cid.len() > 1 {
                report.team_issues.push(TeamIssue {
                    page_id: *page_id,
                    kind: "duplicate-character".into(),
                    detail: format!(
                        "team page {page_id} lists character {cid} in slots {}",
                        slots_with_cid
                            .iter()
                            .map(ToString::to_string)
                            .collect::<Vec<_>>()
                            .join(" and ")
                    ),
                });
            }
        }

        let first_empty = slots.iter().position(|cid| *cid == 0);
        if let Some(index) = first_empty
            && slots[index..].iter().any(|cid| *cid != 0)
        {
            report.team_issues.push(TeamIssue {
                page_id: *page_id,
                kind: "slot-gap".into(),
                detail: format!("team page {page_id} has an empty slot before a filled one"),
            });
        }

        if let Some(owned) = &owned {
            for (index, cid) in slots.iter().enumerate() {
                if *cid != 0 && !owned.contains(cid) {
                    report.team_issues.push(TeamIssue {
                        page_id: *page_id,
                        kind: "missing-character".into(),
                        detail: format!(
                            "team page {page_id} slot {} names character {cid}, which is not owned",
                            index + 1
                        ),
                    });
                }
            }
        }
    }

    if has_column(conn, "tb_user", "SELECTED_TEAM_PAGE_ID")?
        && has_column(conn, "tb_user", "SELECTED_PAGE_SLOT_INDEX")?
    {
        let selected: Option<(i64, i64)> = conn
            .query_row(
                "SELECT SELECTED_TEAM_PAGE_ID, SELECTED_PAGE_SLOT_INDEX
                   FROM tb_user WHERE USER_DBID=?",
                params![user_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        if let Some((page_id, slot_index)) = selected {
            match teams.iter().find(|(id, _)| *id == page_id) {
                None => report.team_issues.push(TeamIssue {
                    page_id,
                    kind: "active-page-missing".into(),
                    detail: format!("the active team page {page_id} does not exist"),
                }),
                Some((_, slots)) => {
                    if !(0..3).contains(&slot_index) {
                        report.team_issues.push(TeamIssue {
                            page_id,
                            kind: "active-slot-out-of-range".into(),
                            detail: format!(
                                "the active team slot index {slot_index} on page {page_id} is out of range"
                            ),
                        });
                    } else if slots[slot_index as usize] == 0 {
                        report.team_issues.push(TeamIssue {
                            page_id,
                            kind: "active-slot-empty".into(),
                            detail: format!("the active team slot on page {page_id} is empty"),
                        });
                    }
                }
            }
        }
    }

    Ok(())
}

fn has_column(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let exists: i64 = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?",
        [table],
        |row| row.get(0),
    )?;
    if exists == 0 {
        return Ok(false);
    }
    let mut statement = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = statement.query_map([], |row| row.get::<_, String>(1))?;
    for row in rows {
        if row? == column {
            return Ok(true);
        }
    }
    Ok(false)
}
