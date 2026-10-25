//! Small JSON settings store kept next to the app's data.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// `en` or `fr`; the catalog carries both.
    pub language: String,
    /// `system`, `light` or `dark`.
    pub theme: String,
    /// Tighter table rows for large inventories.
    pub compact_rows: bool,
    /// Show catalog entries whose name could not be resolved.
    pub show_unknown: bool,
    /// Last folder or file the user opened, offered on the start screen.
    pub last_folder: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: "en".into(),
            theme: "system".into(),
            compact_rows: false,
            show_unknown: true,
            last_folder: None,
        }
    }
}

impl Settings {
    fn validate(&self) -> Result<(), String> {
        if !matches!(self.language.as_str(), "en" | "fr") {
            return Err(format!("unsupported language {:?}", self.language));
        }
        if !matches!(self.theme.as_str(), "system" | "light" | "dark") {
            return Err(format!("unsupported theme {:?}", self.theme));
        }
        Ok(())
    }
}

pub struct SettingsStore {
    path: PathBuf,
    current: Settings,
}

impl SettingsStore {
    pub fn open(path: PathBuf) -> Self {
        let current = fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str::<Settings>(&text).ok())
            .filter(|settings| settings.validate().is_ok())
            .unwrap_or_default();
        Self { path, current }
    }

    pub fn current(&self) -> &Settings {
        &self.current
    }

    pub fn replace(&mut self, settings: Settings) -> Result<Settings, String> {
        settings.validate()?;
        write_atomic(&self.path, &settings)?;
        self.current = settings.clone();
        Ok(settings)
    }
}

fn write_atomic(path: &Path, settings: &Settings) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| "settings path has no parent".to_string())?;
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let temporary = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(&temporary, text).map_err(|error| error.to_string())?;
    fs::rename(&temporary, path).map_err(|error| error.to_string())
}
