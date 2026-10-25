//! Cross-row checks that SQLite cannot enforce: the game's schema has no
//! foreign keys, so a link can point at a row that is missing or deleted.
//!
//! The checker reports the damage a save already had when it opened. A write is
//! refused only when the edit would add a new broken link, so a save that
//! already carries damage can still be repaired and written.

use std::collections::{BTreeMap, HashSet};

use rusqlite::{Connection, params};
use serde::Serialize;

use crate::error::Result;

/// Broken links found in one save. Empty lists mean the checked links are
/// consistent.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsistencyReport {
    pub dangling_gem_links: Vec<GemLink>,
    pub duplicate_gem_links: Vec<DuplicateGemLink>,
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

impl ConsistencyReport {
    pub fn is_clean(&self) -> bool {
        self.dangling_gem_links.is_empty() && self.duplicate_gem_links.is_empty()
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
        out.join("; ")
    }
}

/// Check the links that the game's schema does not enforce.
pub(crate) fn check(conn: &Connection, user_id: i64) -> Result<ConsistencyReport> {
    if !has_column(conn, "tb_equipment", "GEM_DBID")?
        || !has_column(conn, "tb_equipment", "DELETED_DATE")?
        || !has_column(conn, "tb_gem", "DELETED_DATE")?
    {
        return Ok(ConsistencyReport::default());
    }

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
        return Ok(ConsistencyReport::default());
    }

    let mut live = HashSet::new();
    let mut statement =
        conn.prepare("SELECT ITEM_DBID FROM tb_gem WHERE USER_DBID=? AND DELETED_DATE=0")?;
    let rows = statement.query_map(params![user_id], |row| row.get::<_, i64>(0))?;
    for row in rows {
        live.insert(row?);
    }

    let mut report = ConsistencyReport::default();
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
    Ok(report)
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
