//! Raw database browser: list the save's tables, page through rows, and edit a
//! single cell. This is the escape hatch for fields the typed screens do not
//! cover, so every identifier is validated against `sqlite_master` before it is
//! interpolated into SQL.

use rusqlite::types::ValueRef;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::save::SaveSession;

/// A single SQLite cell. Integers are carried as decimal strings because item
/// and instance ids exceed JavaScript's safe integer range.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum RawValue {
    Null,
    Integer(String),
    Real(f64),
    Text(String),
    /// Base64, read-only. Blobs are shown but never written by the editor.
    Blob(String),
}

impl RawValue {
    pub fn integer(value: i64) -> Self {
        RawValue::Integer(value.to_string())
    }

    fn to_sql(&self) -> Result<rusqlite::types::Value> {
        use rusqlite::types::Value;
        Ok(match self {
            RawValue::Null => Value::Null,
            RawValue::Integer(text) => Value::Integer(
                text.parse::<i64>()
                    .map_err(|_| Error::invalid(format!("{text:?} is not a 64-bit integer")))?,
            ),
            RawValue::Real(number) => Value::Real(*number),
            RawValue::Text(text) => Value::Text(text.clone()),
            RawValue::Blob(_) => return Err(Error::invalid("blob columns are read-only")),
        })
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawTable {
    pub name: String,
    pub rows: i64,
    pub columns: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawColumn {
    pub name: String,
    /// Declared SQLite type, e.g. `INTEGER` or `TEXT`.
    pub kind: String,
    pub not_null: bool,
    pub primary_key: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawRow {
    /// SQLite `rowid`, as a string. Stable for the lifetime of the open save.
    pub rowid: String,
    pub cells: Vec<RawValue>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawPage {
    pub table: String,
    pub columns: Vec<RawColumn>,
    pub rows: Vec<RawRow>,
    pub total: i64,
    pub offset: i64,
    pub limit: i64,
    /// The search text used to filter rows, if any.
    pub search: Option<String>,
}

impl SaveSession {
    /// Every user table in the save, with row and column counts.
    pub fn raw_tables(&self) -> Result<Vec<RawTable>> {
        let conn = self.conn();
        let mut statement = conn.prepare(
            "SELECT name FROM sqlite_master
              WHERE type='table' AND name NOT LIKE 'sqlite_%'
              ORDER BY name",
        )?;
        let names: Vec<String> = statement
            .query_map([], |row| row.get(0))?
            .collect::<std::result::Result<_, _>>()?;
        let mut out = Vec::with_capacity(names.len());
        for name in names {
            let rows: i64 = conn.query_row(
                &format!("SELECT count(*) FROM {}", quote(&name)),
                [],
                |row| row.get(0),
            )?;
            let columns = columns(conn, &name)?.len() as i64;
            out.push(RawTable {
                name,
                rows,
                columns,
            });
        }
        Ok(out)
    }

    /// One page of rows, optionally filtered by a substring across all columns.
    pub fn raw_page(
        &self,
        table: &str,
        offset: i64,
        limit: i64,
        search: Option<&str>,
    ) -> Result<RawPage> {
        let table = validate_table(self.conn(), table)?;
        let offset = offset.max(0);
        let limit = limit.clamp(1, 500);
        let columns = columns(self.conn(), &table)?;
        let search = search.map(str::trim).filter(|text| !text.is_empty());

        let mut where_clause = String::new();
        let mut values: Vec<rusqlite::types::Value> = Vec::new();
        if let Some(text) = search {
            let conditions: Vec<String> = columns
                .iter()
                .map(|column| format!("CAST({} AS TEXT) LIKE ?", quote(&column.name)))
                .collect();
            where_clause = format!(" WHERE {}", conditions.join(" OR "));
            let pattern = format!("%{text}%");
            values = columns
                .iter()
                .map(|_| rusqlite::types::Value::Text(pattern.clone()))
                .collect();
        }

        let total: i64 = self.conn().query_row(
            &format!("SELECT count(*) FROM {}{where_clause}", quote(&table)),
            rusqlite::params_from_iter(values.iter()),
            |row| row.get(0),
        )?;

        let projection = columns
            .iter()
            .map(|column| quote(&column.name))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT rowid, {projection} FROM {}{where_clause} ORDER BY rowid LIMIT ? OFFSET ?",
            quote(&table)
        );
        let mut statement = self.conn().prepare(&sql)?;
        let mut bound = values;
        bound.push(rusqlite::types::Value::Integer(limit));
        bound.push(rusqlite::types::Value::Integer(offset));
        let mut rows = statement.query(rusqlite::params_from_iter(bound.iter()))?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            let rowid = row.get::<_, i64>(0)?;
            let mut cells = Vec::with_capacity(columns.len());
            for index in 0..columns.len() {
                cells.push(read_cell(row.get_ref(index + 1)?));
            }
            out.push(RawRow {
                rowid: rowid.to_string(),
                cells,
            });
        }

        Ok(RawPage {
            table,
            columns,
            rows: out,
            total,
            offset,
            limit,
            search: search.map(str::to_string),
        })
    }

    /// Write one cell, addressed by `rowid`. The table, column and row are all
    /// checked before the update so a stale UI cannot write into another table.
    pub fn raw_update(
        &mut self,
        table: &str,
        rowid: i64,
        column: &str,
        value: &RawValue,
    ) -> Result<()> {
        let table = validate_table(self.conn(), table)?;
        let columns = columns(self.conn(), &table)?;
        let Some(target) = columns.iter().find(|candidate| candidate.name == column) else {
            return Err(Error::invalid(format!(
                "{column:?} is not a column of {table}"
            )));
        };
        if target.name == "USER_DBID" {
            return Err(Error::invalid(
                "USER_DBID identifies the account and cannot be edited",
            ));
        }
        let sql_value = value.to_sql()?;

        let changed = self.conn().execute(
            &format!(
                "UPDATE {} SET {}=? WHERE rowid=?",
                quote(&table),
                quote(&target.name)
            ),
            params![sql_value, rowid],
        )?;
        if changed != 1 {
            return Err(Error::invalid(
                "that row no longer exists; refresh the table",
            ));
        }
        self.touch();
        Ok(())
    }
}

fn read_cell(value: ValueRef<'_>) -> RawValue {
    match value {
        ValueRef::Null => RawValue::Null,
        ValueRef::Integer(number) => RawValue::integer(number),
        ValueRef::Real(number) => RawValue::Real(number),
        ValueRef::Text(bytes) => RawValue::Text(String::from_utf8_lossy(bytes).into_owned()),
        ValueRef::Blob(bytes) => RawValue::Blob(base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            bytes,
        )),
    }
}

fn validate_table(conn: &Connection, table: &str) -> Result<String> {
    let found: Option<String> = conn
        .query_row(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            params![table],
            |row| row.get(0),
        )
        .optional()?;
    found.ok_or_else(|| Error::invalid(format!("{table:?} is not a table in this save")))
}

fn columns(conn: &Connection, table: &str) -> Result<Vec<RawColumn>> {
    let mut statement = conn.prepare(&format!("PRAGMA table_info({})", quote(table)))?;
    let rows = statement.query_map([], |row| {
        Ok(RawColumn {
            name: row.get(1)?,
            kind: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            not_null: row.get::<_, i64>(3)? != 0,
            primary_key: row.get::<_, i64>(5)? != 0,
        })
    })?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}

/// Quote an SQLite identifier. Names come from the schema, but quoting keeps
/// odd table names safe and makes the generated SQL readable.
fn quote(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('"', "\"\""))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn raw_values_keep_64_bit_ids_exact() {
        let value = RawValue::integer(9_007_199_254_740_993);
        let json = serde_json::to_string(&value).expect("serialize");
        assert_eq!(json, r#"{"type":"integer","value":"9007199254740993"}"#);
        let back: RawValue = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(back, value);
    }

    #[test]
    fn blobs_are_not_writable() {
        let blob = RawValue::Blob("AA==".into());
        assert!(blob.to_sql().is_err());
    }

    #[test]
    fn identifiers_are_quoted() {
        assert_eq!(quote("tb_user"), "\"tb_user\"");
        assert_eq!(quote("odd\"name"), "\"odd\"\"name\"");
    }
}
