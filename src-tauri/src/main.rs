// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod devices;
mod hid;
mod config;
use devices::barcode::{listen_to_barcode, open_symbol_scanner};
use devices::magtek::{listen_to_magtek, open_magtek_reader};
use tauri::Manager;
use config::config_manager::{ConfigManager, get_full_config};
use config::config_manager::Config;

#[tauri::command]
fn get_hid_devices() -> Vec<String> {
    hid::list_devices()
        .into_iter()
        .map(|d| {
            format!(
                "{}:{} - {} ({:?})",
                d.vendor_id(),
                d.product_id(),
                d.product_string().unwrap_or("Unknown"),
                d.path()
            )
        })
        .collect()
}
#[tauri::command]
fn start_barcode_listener(window: tauri::Window) -> Result<(), String> {
    let api = hidapi::HidApi::new().map_err(|e| e.to_string())?;

    match open_symbol_scanner(&api) {
        Some(device) => {
            listen_to_barcode(device, window);
            Ok(())
        }
        None => Err("No compatible barcode scanner found.".into()),
    }
}

#[tauri::command]
fn start_magtek_listener(window: tauri::Window) -> Result<(), String> {
    let api = hidapi::HidApi::new().map_err(|e| e.to_string())?;

    match open_magtek_reader(&api) {
        Some(device) => {
            listen_to_magtek(device, window);
            Ok(())
        }
        None => Err("No compatible MagTek reader found.".into()),
    }
}
#[tauri::command]
async fn show_first_run_window(app: tauri::AppHandle) {
    let first_run_window = app.get_webview_window("firstRun").unwrap();
    first_run_window.show().unwrap();
    first_run_window.set_focus().unwrap();
}

#[tauri::command]
fn submit_first_run_config(
    config_manager: tauri::State<ConfigManager>,
    config: Config,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Save config
    {
        let mut lock = config_manager.config.lock().unwrap();
        *lock = config.clone();
    }
    config_manager.save_config().map_err(|e| e.to_string())?;
    // Hide firstRun, show main
    if let Some(first_run_window) = app.get_webview_window("firstRun") {
        first_run_window.hide().ok();
    }
    if let Some(main_window) = app.get_webview_window("main") {
        main_window.show().ok();
        main_window.set_focus().ok();
    }
    Ok(())
}

fn main() {
    #[cfg(debug_assertions)] // only enable instrumentation in development builds
    let devtools = tauri_plugin_devtools::init();

    let mut builder = tauri::Builder::default();

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(devtools);
    }
    builder
        .manage(ConfigManager::new())
        .invoke_handler(tauri::generate_handler![
            get_hid_devices,
            start_barcode_listener,
            start_magtek_listener,
            show_first_run_window,
            get_full_config,
            submit_first_run_config,
        ])
        .setup(|app| {
            let config_manager = app.state::<ConfigManager>();
            // On startup, check for config file
            if !config_manager.config_exists() {
                // Hide main window, show firstRun window
                if let Some(main_window) = app.get_webview_window("main") {
                    main_window.hide().ok();
                }
                if let Some(first_run_window) = app.get_webview_window("firstRun") {
                    first_run_window.show().ok();
                    first_run_window.set_focus().ok();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
