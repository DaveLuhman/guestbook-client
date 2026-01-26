//! Integration tests for ConfigManager: load, save, merge, and with_path.

use guestbook_client::config::config_manager::ConfigManager;
use std::path::PathBuf;

#[test]
fn config_with_path_create_save_reload() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path: PathBuf = dir.path().join("gb_config.json");

    let mgr = ConfigManager::with_path(path.clone());
    mgr.set_server_token("test-token-12345".into());
    mgr.save_config().expect("save_config");

    drop(mgr);

    let mgr2 = ConfigManager::with_path(path);
    let cfg = mgr2.get_config().expect("get_config");
    assert_eq!(cfg.server_token.as_deref(), Some("test-token-12345"));
}

#[test]
fn config_with_path_merge_and_persist_first_run() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path: PathBuf = dir.path().join("gb_config.json");

    let mgr = ConfigManager::with_path(path.clone());
    mgr.set_first_run(false);
    mgr.save_config().expect("save_config");

    drop(mgr);

    let mgr2 = ConfigManager::with_path(path);
    let cfg = mgr2.get_config().expect("get_config");
    assert!(!cfg.first_run);
}
