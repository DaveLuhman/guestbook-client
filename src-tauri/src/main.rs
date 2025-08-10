// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod api;
mod config;
mod devices;
mod hid;
mod logging;
use api::devices::{register_device, send_heartbeat};
use config::config_manager::{get_full_config, ConfigManager};
use devices::barcode::{listen_to_barcode, open_symbol_scanner};
use devices::magtek::{listen_to_magtek, open_magtek_reader};
use tauri::Manager;

use api::entries::{submit_entry, CardData};

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
    log::info!("Attempting to start barcode scanner listener");
    let api = hidapi::HidApi::new().map_err(|e| {
        log::error!("Failed to initialize HID API: {}", e);
        e.to_string()
    })?;

    match open_symbol_scanner(&api) {
        Some(device) => {
            log::info!("Barcode scanner found, starting listener");
            listen_to_barcode(device, window);
            Ok(())
        }
        None => {
            log::warn!("No compatible barcode scanner found");
            Err("No compatible barcode scanner found.".into())
        }
    }
}

#[tauri::command]
fn start_magtek_listener(window: tauri::Window) -> Result<(), String> {
    log::info!("Attempting to start MagTek reader listener");
    let api = hidapi::HidApi::new().map_err(|e| {
        log::error!("Failed to initialize HID API: {}", e);
        e.to_string()
    })?;

    match open_magtek_reader(&api) {
        Some(device) => {
            log::info!("MagTek reader found, starting listener");
            listen_to_magtek(device, window);
            Ok(())
        }
        None => {
            log::warn!("No compatible MagTek reader found");
            Err("No compatible MagTek reader found.".into())
        }
    }
}
#[tauri::command]
async fn submit_swipe_entry(
    config_manager: tauri::State<'_, ConfigManager>,
    name: String,
    onecard: String,
) -> Result<(), String> {
    submit_entry(config_manager, CardData { name, onecard })
        .await
        .unwrap();
    Ok(())
}
#[tauri::command]
async fn submit_barcode_entry(
    config_manager: tauri::State<'_, ConfigManager>,
    onecard: String,
) -> Result<(), String> {
    let name = "Barcode".to_string();
    submit_entry(config_manager, CardData { name, onecard })
        .await
        .unwrap();
    Ok(())
}

#[tauri::command]
async fn submit_manual_entry(
    config_manager: tauri::State<'_, ConfigManager>,
    onecard: String,
) -> Result<(), String> {
    let name = "Manual Entry".to_string();
    submit_entry(config_manager, CardData { name, onecard })
        .await
        .unwrap();
    Ok(())
}

#[tauri::command]
async fn first_run_trigger(app: tauri::AppHandle) {
    let main_window = app.get_webview_window("main").unwrap();
    let first_run_window = app.get_webview_window("firstRun").unwrap();
    first_run_window.show().unwrap();
    main_window.hide().unwrap();
    first_run_window.set_focus().unwrap();
}

#[tauri::command]
async fn submit_first_run_config(
    config_manager: tauri::State<'_, ConfigManager>,
    device_name: String,
    device_location: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut config = get_full_config(config_manager.clone());
    config.device_friendly_name = Some(device_name);
    config.device_location = Some(device_location);
    config.first_run = false;
    // Save config
    {
        let mut lock = config_manager.config.lock().unwrap();
        *lock = config.clone();
    }
    config_manager.save_config().map_err(|e| e.to_string())?;
    register_device(config_manager.clone()).await?;
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

#[tauri::command]
async fn send_heartbeat_command(
    config_manager: tauri::State<'_, ConfigManager>,
) -> Result<(), String> {
    log::info!("Sending heartbeat to server");
    match send_heartbeat(config_manager).await {
        Ok(_) => {
            log::info!("Heartbeat sent successfully");
            Ok(())
        }
        Err(e) => {
            log::error!("Heartbeat failed: {}", e);
            Err(e)
        }
    }
}

#[tauri::command]
async fn log_error(
    level: String,
    source: String,
    message: String,
    timestamp: String,
) -> Result<(), String> {
    match level.as_str() {
        "low" => log::debug!("[{}] {}: {}", source, timestamp, message),
        "medium" => log::info!("[{}] {}: {}", source, timestamp, message),
        "high" => log::warn!("[{}] {}: {}", source, timestamp, message),
        "critical" => log::error!("[{}] {}: {}", source, timestamp, message),
        _ => log::info!("[{}] {}: {}", source, timestamp, message),
    }
    Ok(())
}

#[tauri::command]
async fn test_logging() -> Result<(), String> {
    log::debug!("This is a debug message");
    log::info!("This is an info message");
    log::warn!("This is a warning message");
    log::error!("This is an error message");
    Ok(())
}

#[tauri::command]
async fn restart_appliance(app: tauri::AppHandle) -> Result<(), String> {
    log::info!("Restart appliance command received");

    // Log the restart attempt
    log::info!("Initiating application restart...");

    // Use spawn to avoid blocking the current thread
    tauri::async_runtime::spawn(async move {
        // Small delay to ensure the response is sent back to the frontend
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Log the restart action
        log::info!("Executing application restart...");

        // Restart the application
        app.restart();
    });

    Ok(())
}

fn main() {
    // Set WebKitGTK compositing mode to disabled on Linux to prevent image artifacting
    #[cfg(target_os = "linux")]
    {
        // Additional WebKitGTK settings for better Linux compatibility
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        std::env::set_var("WEBKIT_DISABLE_GPU_PROCESS", "1");

        // Alternative approach: You could also modify window creation in tauri.conf.json
        // to add "transparent: true" or other rendering hints if needed
    }

    #[cfg(debug_assertions)] // only enable instrumentation in development builds
    let devtools = tauri_plugin_devtools::init();

    let mut builder = tauri::Builder::default().plugin(tauri_plugin_http::init());

    // Initialize logging before creating the app
    let config_manager = ConfigManager::new();
    if let Err(e) = logging::init_logging(&config_manager.config_path) {
        eprintln!("Failed to initialize logging: {}", e);
    } else {
        log::info!("Logging system initialized successfully");
    }

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(devtools);
    }
    builder
        .manage(config_manager)
        .invoke_handler(tauri::generate_handler![
            get_hid_devices,
            start_barcode_listener,
            start_magtek_listener,
            first_run_trigger,
            get_full_config,
            submit_first_run_config,
            send_heartbeat_command,
            log_error,
            test_logging,
            restart_appliance,
            submit_swipe_entry,
            submit_barcode_entry,
            submit_manual_entry,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
