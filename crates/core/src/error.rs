use std::path::PathBuf;

/// Everything that can go wrong while reading or writing a save.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("{0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Crypto(String),
    #[error("{0}")]
    Invalid(String),
    #[error("No save is open.")]
    NotOpen,
    #[error("{0}")]
    Schema(String),
    #[error("Save file not found: {path}", path = .0.display())]
    Missing(PathBuf),
}

pub type Result<T> = std::result::Result<T, Error>;

impl Error {
    /// Stable machine-readable kind, mirrored by the desktop command error.
    pub fn kind(&self) -> &'static str {
        match self {
            Error::Io(_) | Error::Missing(_) => "io",
            Error::Sqlite(_) => "sqlite",
            Error::Json(_) => "json",
            Error::Crypto(_) => "crypto",
            Error::Invalid(_) => "invalid",
            Error::NotOpen => "notOpen",
            Error::Schema(_) => "schema",
        }
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        Error::Invalid(message.into())
    }

    pub fn schema(message: impl Into<String>) -> Self {
        Error::Schema(message.into())
    }
}
