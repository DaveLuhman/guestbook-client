use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use crate::config::device_id::{compute_device_id};
use tauri::State;


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Config {
    pub server_url: Option<String>,
    pub server_token: Option<String>,
    pub device_id: Option<String>,
    pub device_location: Option<String>,
    pub device_friendly_name: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server_url: None,

            server_token: None,
            device_id: Some(compute_device_id()),
            device_location: None,
            device_friendly_name: None,
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
        if let Some(parent) = config_path.parent() {
            if !parent.exists() {
                let _ = fs::create_dir_all(parent);
            }
        }
        let config = Self::load_config(&config_path);
        let merged_config = Self::merge_with_default(config);
        let manager = Self {
            config_path,
            config: Arc::new(Mutex::new(merged_config)),
        };
        manager.save_config().ok();
        manager
    }

    fn resolve_config_path() -> PathBuf {
        // Try to use a platform-specific user data directory, fallback to home
        if let Some(proj_dirs) = directories::ProjectDirs::from("com", "wolfpack", "guestbook") {
            proj_dirs.config_dir().join("wg_config.json")
        } else if let Some(home) = dirs::home_dir() {
            home.join(".wolfpack-guestbook").join("wg_config.json")
        } else {
            PathBuf::from("wg_config.json")
        }
    }

    fn load_config(path: &Path) -> Option<Config> {
        if path.exists() {
            let data = fs::read_to_string(path).ok()?;
            serde_json::from_str(&data).ok()
        } else {
            None
        }
    }

    fn merge_with_default(config: Option<Config>) -> Config {
        let mut default = Config::default();
        if let Some(cfg) = config {
            // Merge fields, prioritizing loaded config
            if let Some(server_url) = cfg.server_url { default.server_url = Some(server_url); }
            if let Some(server_token) = cfg.server_token { default.server_token = Some(server_token); }
            if let Some(device_id) = cfg.device_id { default.device_id = Some(device_id); }
            if let Some(device_location) = cfg.device_location { default.device_location = Some(device_location); }
            if let Some(device_friendly_name) = cfg.device_friendly_name { default.device_friendly_name = Some(device_friendly_name); }
        }
        default
    }

    pub fn save_config(&self) -> io::Result<()> {
        let config = self.config.lock().unwrap();
        if let Some(parent) = self.config_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)?;
            }
        }
        let data = serde_json::to_string_pretty(&*config)?;
        let mut file = fs::File::create(&self.config_path)?;
        file.write_all(data.as_bytes())?;
        // Event emission stub: config changed
        Ok(())
    }

    pub fn get<T: Clone, F: Fn(&Config) -> T>(&self, f: F) -> T {
        let config = self.config.lock().unwrap();
        f(&*config)
    }

    pub fn set<T, F: Fn(&mut Config, T)>(&self, value: T, f: F) {
        {
            let mut config = self.config.lock().unwrap();
            f(&mut *config, value);
        }
        let _ = self.save_config();
    }


    pub fn get_server_url(&self) -> Option<String> {
        self.get(|c| c.server_url.clone())
    }
    pub fn set_server_url(&self, server_url: String) -> Result<(), String> {
        if !server_url.starts_with("http") {
            return Err("Invalid server URL".to_string());
        }
        self.set(Some(server_url), |c, v| c.server_url = v);
        Ok(())
    }

    pub fn get_server_token(&self) -> Option<String> {
        self.get(|c| c.server_token.clone())
    }
    pub fn set_server_token(&self, token: String) {
        self.set(Some(token), |c, v| c.server_token = v);
    }

    pub fn get_device_id(&self) -> Option<String> {
        self.get(|c| c.device_id.clone())
    }
    pub fn set_device_id(&self, device_id: String) {
        self.set(Some(device_id), |c, v| c.device_id = v);
    }

    pub fn get_device_location(&self) -> Option<String> {
        self.get(|c| c.device_location.clone())
    }
    pub fn set_device_location(&self, device_location: String) {
        self.set(Some(device_location), |c, v| c.device_location = v);
    }

    pub fn get_device_friendly_name(&self) -> Option<String> {
        self.get(|c| c.device_friendly_name.clone())
    }
    pub fn set_device_friendly_name(&self, device_friendly_name: String) {
        self.set(Some(device_friendly_name), |c, v| c.device_friendly_name = v);
    }


    pub fn config_exists(&self) -> bool {
        self.config_path.exists()
    }
}

// Optionally, you can provide a global singleton instance using lazy_static or once_cell

#[tauri::command]
pub fn get_full_config(config_manager: State<'_, ConfigManager>) -> Config {
    config_manager.config.lock().unwrap().clone()
}
