use crate::config::device_id::compute_device_id;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Config {
    pub server_url: Option<String>,
    pub server_token: Option<String>,
    pub device_id: Option<String>,
    pub device_location: Option<String>,
    pub device_friendly_name: Option<String>,
    pub first_run: bool,
    pub camera_preview_enabled: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server_url: Some("http://localhost:3001/api/v1".to_string()),
            server_token: None,
            device_id: Some(compute_device_id()),
            device_location: None,
            device_friendly_name: None,
            first_run: true,
            camera_preview_enabled: false,
        }
    }
}

pub struct ConfigManager {
    pub config_path: PathBuf,
    pub config: Arc<Mutex<Config>>,
}

impl ConfigManager {
    pub fn new() -> Self {
        let config_path = Self::resolve_config_path();

        // Ensure config directory exists
        if let Some(parent) = config_path.parent() {
            if !parent.exists() {
                if let Err(e) = fs::create_dir_all(parent) {
                    log::warn!("Failed to create config directory {}: {}", parent.display(), e);
                    eprintln!("Warning: Failed to create config directory {}: {}", parent.display(), e);
                }
            }
        }

        // Load existing config
        let loaded_config = Self::load_config(&config_path);
        let config_exists = config_path.exists();
        let config_loaded_successfully = loaded_config.is_some();

        // Merge with defaults
        let merged_config = Self::merge_with_default(loaded_config);

        let manager = Self {
            config_path,
            config: Arc::new(Mutex::new(merged_config)),
        };

        // Only save if this is a new config file, or if we successfully loaded an existing one
        // This prevents overwriting existing configs when parsing fails
        if !config_exists {
            // New config file - save defaults
            if let Err(e) = manager.save_config() {
                log::error!("Failed to save initial config: {}", e);
                eprintln!("Error: Failed to save initial config: {}", e);
            }
        } else if config_loaded_successfully {
            // Successfully loaded existing config - save merged version to ensure new fields are added
            if let Err(e) = manager.save_config() {
                log::error!("Failed to save merged config: {}", e);
                eprintln!("Error: Failed to save merged config: {}", e);
            }
        } else {
            // Config file exists but parsing failed - don't overwrite it!
            log::error!("Config file exists at {} but failed to parse. Not overwriting to prevent data loss.", manager.config_path.display());
            eprintln!("Error: Config file exists but is corrupted. Not overwriting to prevent data loss.");
        }

        manager
    }

    fn resolve_config_path() -> PathBuf {
        // Try to use a platform-specific user data directory, fallback to home
        if let Some(proj_dirs) = directories::ProjectDirs::from("com", "adosoftware", "guestbook") {
            proj_dirs.config_dir().join("gb_config.json")
        } else if let Some(home) = dirs::home_dir() {
            home.join(".adosoftware-guestbook").join("gb_config.json")
        } else {
            PathBuf::from("gb_config.json")
        }
    }

    fn load_config(path: &Path) -> Option<Config> {
        if !path.exists() {
            return None;
        }

        // Read file with error logging
        let data = match fs::read_to_string(path) {
            Ok(data) => data,
            Err(e) => {
                log::warn!("Failed to read config file {}: {}", path.display(), e);
                eprintln!("Warning: Failed to read config file {}: {}", path.display(), e);
                return None;
            }
        };

        // Parse JSON with error logging
        match serde_json::from_str(&data) {
            Ok(config) => Some(config),
            Err(e) => {
                log::error!("Failed to parse config file {}: {}", path.display(), e);
                eprintln!("Error: Failed to parse config file {}: {}", path.display(), e);
                eprintln!("Config file may be corrupted or have an incompatible schema.");
                None
            }
        }
    }

    fn merge_with_default(config: Option<Config>) -> Config {
        let mut default = Config::default();
        if let Some(cfg) = config {
            // Merge fields, prioritizing loaded config
            if let Some(server_url) = cfg.server_url {
                default.server_url = Some(server_url);
            }
            if let Some(server_token) = cfg.server_token {
                default.server_token = Some(server_token);
            }
            if let Some(device_id) = cfg.device_id {
                default.device_id = Some(device_id);
            }
            if let Some(device_location) = cfg.device_location {
                default.device_location = Some(device_location);
            }
            if let Some(device_friendly_name) = cfg.device_friendly_name {
                default.device_friendly_name = Some(device_friendly_name);
            }
            default.first_run = cfg.first_run;
            default.camera_preview_enabled = cfg.camera_preview_enabled;
        }
        default
    }

    pub fn save_config(&self) -> io::Result<()> {
        // Handle mutex poisoning gracefully
        let config = self.config.lock()
            .map_err(|e: PoisonError<_>| {
                let msg = format!("Mutex poisoned: {}", e);
                log::error!("{}", msg);
                io::Error::new(io::ErrorKind::Other, msg)
            })?;

        // Ensure parent directory exists
        if let Some(parent) = self.config_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)
                    .map_err(|e| {
                        log::error!("Failed to create config directory {}: {}", parent.display(), e);
                        e
                    })?;
            }
        }

        // Serialize config
        let data = serde_json::to_string_pretty(&*config)
            .map_err(|e| {
                log::error!("Failed to serialize config: {}", e);
                io::Error::new(io::ErrorKind::InvalidData, format!("Serialization error: {}", e))
            })?;

        // Atomic write: write to temp file first, then rename
        let temp_path = self.config_path.with_extension("tmp");

        // Write to temp file
        fs::write(&temp_path, data.as_bytes())
            .map_err(|e| {
                log::error!("Failed to write temp config file {}: {}", temp_path.display(), e);
                e
            })?;

        // Atomic rename (atomic on Linux/Unix, best-effort on Windows)
        fs::rename(&temp_path, &self.config_path)
            .map_err(|e| {
                log::error!("Failed to rename temp config file to {}: {}", self.config_path.display(), e);
                // Try to clean up temp file
                let _ = fs::remove_file(&temp_path);
                e
            })?;

        log::debug!("Config saved successfully to {}", self.config_path.display());
        Ok(())
    }

    pub fn set<T, F: Fn(&mut Config, T)>(&self, value: T, f: F) {
        {
            let mut config = self.config.lock()
                .map_err(|e: PoisonError<_>| {
                    log::error!("Mutex poisoned while setting config: {}", e);
                    eprintln!("Error: Config mutex is poisoned. Application state may be corrupted.");
                })
                .ok();

            if let Some(ref mut cfg) = config {
                f(cfg, value);
            } else {
                return; // Don't save if we couldn't acquire the lock
            }
        }

        if let Err(e) = self.save_config() {
            log::error!("Failed to save config after set operation: {}", e);
            eprintln!("Error: Failed to save config: {}", e);
        }
    }

    pub fn set_server_token(&self, server_token: String) {
        self.set(server_token, |c, v| c.server_token = Some(v));
    }

    pub fn set_first_run(&self, first_run: bool) {
        self.set(first_run, |c, v| c.first_run = v);
    }

    pub fn set_camera_preview_enabled(&self, enabled: bool) {
        self.set(enabled, |c, v| c.camera_preview_enabled = v);
    }

    /// Get a copy of the current config (for direct access from Rust code)
    pub fn get_config(&self) -> Result<Config, String> {
        self.config.lock()
            .map_err(|e: PoisonError<_>| {
                let msg = format!("Config mutex poisoned: {}", e);
                log::error!("{}", msg);
                msg
            })
            .map(|config| config.clone())
    }
}

// Optionally, you can provide a global singleton instance using lazy_static or once_cell

#[tauri::command]
pub fn get_full_config(config_manager: State<'_, ConfigManager>) -> Result<Config, String> {
    config_manager.config.lock()
        .map_err(|e: PoisonError<_>| {
            let msg = format!("Config mutex poisoned: {}", e);
            log::error!("{}", msg);
            msg
        })
        .map(|config| config.clone())
}

#[tauri::command]
pub fn set_camera_preview_enabled(
    enabled: bool,
    config_manager: State<'_, ConfigManager>,
) -> Result<(), String> {
    config_manager.set_camera_preview_enabled(enabled);
    Ok(())
}
