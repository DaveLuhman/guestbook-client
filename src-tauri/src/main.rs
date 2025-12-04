// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod api;
mod config;
mod devices;
mod hid;
mod logging;
use api::devices::{register_device, send_heartbeat, reset_device};
use config::config_manager::{get_full_config, ConfigManager};
use devices::barcode::{listen_to_barcode, open_symbol_scanner};
use devices::magtek::{listen_to_magtek, open_magtek_reader};
use hid::manager::{HIDManager, DeviceConnectionState};
use tauri::WebviewWindow;
use tauri::Manager;

use api::entries::{submit_entry, CardData};

#[tauri::command]
fn get_hid_devices() -> Vec<String> {
    hid::list_devices()
        .into_iter()
        .map(|d| {
            format!(
                "VID:{:04X} PID:{:04X} - {} - {} ({:?})",
                d.vendor_id(),
                d.product_id(),
                d.manufacturer_string().unwrap_or("Unknown"),
                d.product_string().unwrap_or("Unknown"),
                d.path()
            )
        })
        .collect()
}
#[tauri::command]
fn start_barcode_listener(
    window: WebviewWindow,
    hid_manager: tauri::State<'_, HIDManager>,
) -> Result<(), String> {
    log::info!("Attempting to start barcode scanner listener");
    let api = hidapi::HidApi::new().map_err(|e| {
        log::error!("Failed to initialize HID API: {}", e);
        e.to_string()
    })?;

    match open_symbol_scanner(&api) {
        Some(device) => {
            log::info!("Barcode scanner found, starting listener");
            listen_to_barcode(device, window);

            // Update HID manager status
            {
                let mut status = hid_manager.barcode_status.lock().unwrap();
                status.state = DeviceConnectionState::Connected;
                status.last_seen = Some(std::time::Instant::now());
                status.error_count = 0;
                status.last_error = None;
            }

            Ok(())
        }
        None => {
            log::warn!("No compatible barcode scanner found");
            hid_manager.mark_device_error("barcode", "No compatible barcode scanner found".to_string());
            Err("No compatible barcode scanner found.".into())
        }
    }
}

#[tauri::command]
fn start_magtek_listener(
    window: WebviewWindow,
    hid_manager: tauri::State<'_, HIDManager>,
) -> Result<(), String> {
    log::info!("Attempting to start MagTek reader listener");

    // Give USB device time to be ready on Raspberry Pi
    std::thread::sleep(std::time::Duration::from_secs(2));

    let api = hidapi::HidApi::new().map_err(|e| {
        log::error!("Failed to initialize HID API: {}", e);
        e.to_string()
    })?;

    match open_magtek_reader(&api) {
        Some(device) => {
            log::info!("MagTek reader found, starting listener");
            listen_to_magtek(device, window);

            // Update HID manager status
            {
                let mut status = hid_manager.msr_status.lock().unwrap();
                status.state = DeviceConnectionState::Connected;
                status.last_seen = Some(std::time::Instant::now());
                status.error_count = 0;
                status.last_error = None;
            }

            Ok(())
        }
        None => {
            log::warn!("No compatible MagTek reader found");
            hid_manager.mark_device_error("msr", "No compatible MSR reader found".to_string());
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
        .map_err(|e| format!("Failed to submit swipe entry: {}", e))?;
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
        .map_err(|e| format!("Failed to submit barcode entry: {}", e))?;
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
        .map_err(|e| format!("Failed to submit manual entry: {}", e))?;
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
fn get_device_status(hid_manager: tauri::State<'_, HIDManager>) -> Result<serde_json::Value, String> {
    let barcode_status = hid_manager.get_barcode_status();
    let msr_status = hid_manager.get_msr_status();

    Ok(serde_json::json!({
        "barcode": {
            "connected": matches!(barcode_status.state, DeviceConnectionState::Connected),
            "state": format!("{:?}", barcode_status.state),
            "error_count": barcode_status.error_count,
            "last_error": barcode_status.last_error,
            "last_seen": barcode_status.last_seen.map(|t| t.elapsed().as_secs())
        },
        "msr": {
            "connected": matches!(msr_status.state, DeviceConnectionState::Connected),
            "state": format!("{:?}", msr_status.state),
            "error_count": msr_status.error_count,
            "last_error": msr_status.last_error,
            "last_seen": msr_status.last_seen.map(|t| t.elapsed().as_secs())
        }
    }))
}

#[tauri::command]
fn get_barcode_connected(hid_manager: tauri::State<'_, HIDManager>) -> bool {
    hid_manager.get_barcode_connected()
}

#[tauri::command]
fn get_msr_connected(hid_manager: tauri::State<'_, HIDManager>) -> bool {
    hid_manager.get_msr_connected()
}

#[tauri::command]
fn test_device_detection() -> Result<String, String> {
    let api = hidapi::HidApi::new().map_err(|e| format!("Failed to initialize HID API: {}", e))?;

    let mut result = String::new();
    result.push_str("=== HID Device Detection Test ===\n\n");

    // Test barcode scanner detection
    result.push_str("Testing barcode scanner detection:\n");
    match open_symbol_scanner(&api) {
        Some(_) => result.push_str("✓ Barcode scanner found and opened\n"),
        None => result.push_str("✗ No barcode scanner found\n"),
    }

    // Test MSR reader detection
    result.push_str("\nTesting MSR reader detection:\n");
    match open_magtek_reader(&api) {
        Some(_) => result.push_str("✓ MSR reader found and opened\n"),
        None => result.push_str("✗ No MSR reader found\n"),
    }

    // List all devices
    result.push_str("\nAll HID devices:\n");
    for device in api.device_list() {
        result.push_str(&format!(
            "VID:{:04X} PID:{:04X} - {} - {} ({:?})\n",
            device.vendor_id(),
            device.product_id(),
            device.manufacturer_string().unwrap_or("Unknown"),
            device.product_string().unwrap_or("Unknown"),
            device.path()
        ));
    }

    Ok(result)
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

#[tauri::command]
async fn reset_device_command(
    config_manager: tauri::State<'_, ConfigManager>,
) -> Result<(), String> {
    log::info!("Reset device command received");
    match reset_device(config_manager).await {
        Ok(_) => {
            log::info!("Device reset completed successfully");
            Ok(())
        }
        Err(e) => {
            log::error!("Device reset failed: {}", e);
            Err(e)
        }
    }
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn main() {
    // Set WebKitGTK compositing mode to disabled on Linux to prevent image artifacting
    #[cfg(target_os = "linux")]
    {
        // Additional WebKitGTK settings for better Linux compatibility
        unsafe {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
            std::env::set_var("WEBKIT_DISABLE_GPU_PROCESS", "1");
            // GStreamer: make audio stable on headless Pi + fix plugin discovery
            std::env::set_var("GST_AUDIO_SINK", "alsasink");
            std::env::set_var(
                "GST_PLUGIN_SYSTEM_PATH_1_0",
                "/usr/lib/aarch64-linux-gnu/gstreamer-1.0",
            );
            std::env::set_var(
                "GST_PLUGIN_SCANNER",
                "/usr/lib/aarch64-linux-gnu/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner",
            );
        }
        // Alternative approach: You could also modify window creation in tauri.conf.json
        // to add "transparent: true" or other rendering hints if needed
    }

    // Initialize config manager
    let config_manager = ConfigManager::new();

    // Initialize logging only when devtools is NOT being used (devtools has its own logger)
    #[cfg(not(debug_assertions))]
    {
        if let Err(e) = logging::init_logging(&config_manager.config_path) {
            eprintln!("Failed to initialize logging: {}", e);
        } else {
            log::info!("Logging system initialized successfully");
        }
    }

    // Initialize HID manager
    let hid_manager = HIDManager::new();

    // Build the Tauri builder with conditional devtools plugin
    let builder = {
        let mut b = tauri::Builder::default().plugin(tauri_plugin_http::init());
        #[cfg(debug_assertions)] // only enable instrumentation in development builds
        {
            b = b.plugin(tauri_plugin_devtools::init());
        }
        b
    };
    builder
        .manage(config_manager)
        .manage(hid_manager)
        .invoke_handler(tauri::generate_handler![
            get_hid_devices,
            start_barcode_listener,
            start_magtek_listener,
            get_device_status,
            get_barcode_connected,
            get_msr_connected,
            test_device_detection,
            first_run_trigger,
            get_full_config,
            submit_first_run_config,
            send_heartbeat_command,
            log_error,
            test_logging,
            restart_appliance,
            reset_device_command,
            submit_swipe_entry,
            submit_barcode_entry,
            submit_manual_entry,
            get_app_version,
        ])
        .setup(|app| {
            // Get the main window and HID manager
            let window = app.get_webview_window("main").unwrap();
            let hid_manager = app.state::<HIDManager>();

            // Set the window in the HID manager
            hid_manager.set_window(window.clone());

            // Start initial device connection and monitoring
            if let Err(e) = hid_manager.start_initial_connection() {
                log::error!("Failed to start HID device monitoring: {}", e);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
