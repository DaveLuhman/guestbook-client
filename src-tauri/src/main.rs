// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod api;
mod camera;
mod config;
mod devices;
mod hid;
mod logging;

#[cfg(debug_assertions)]
mod debug_logging;
#[cfg(feature = "debug-server")]
mod debug_server;
use api::devices::{register_device, send_heartbeat, reset_device, check_network_availability, clear_orphaned_state};
use config::config_manager::{get_full_config, set_camera_preview_enabled, ConfigManager};
use devices::barcode::{listen_to_barcode, open_symbol_scanner};
use devices::magtek::{listen_to_magtek, open_magtek_reader};
use hid::manager::{HIDManager, DeviceConnectionState};
use camera::manager::{CameraManager, CameraOptions, CameraStatus};
use tauri::WebviewWindow;
use tauri::Manager;
use tauri::Listener;

use api::entries::{submit_entry, CardData};
use std::sync::{Arc, Mutex};
use std::process::{Command, Child, Stdio};
use std::path::PathBuf;
use std::io::{BufRead, BufReader};
use url::Url;
use once_cell::sync::Lazy;
use regex::Regex;

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
    last_scanned_id: tauri::State<'_, LastScannedId>,
    onecard: String,
) -> Result<(), String> {
    // Debounce: check if this is the same ID as the most recently scanned within the last 15 seconds
    // Update timestamp immediately after check to prevent race conditions from rapid scans
    const DEBOUNCE_WINDOW_SECS: u64 = 15;
    {
        let mut last_id = last_scanned_id.0.lock().unwrap();
        if let Some((ref last_onecard, ref last_timestamp)) = *last_id {
            if last_onecard == &onecard {
                let elapsed = last_timestamp.elapsed();
                if elapsed.as_secs() < DEBOUNCE_WINDOW_SECS {
                    let remaining = DEBOUNCE_WINDOW_SECS - elapsed.as_secs();
                    log::debug!(
                        "Ignoring duplicate scan (debounce): {} (scanned {}s ago, {}s remaining)",
                        onecard,
                        elapsed.as_secs(),
                        remaining
                    );
                    return Err(format!(
                        "Barcode already submitted recently. Please wait {} second{} before scanning again.",
                        remaining,
                        if remaining == 1 { "" } else { "s" }
                    ));
                }
                // If more than 15 seconds have passed, allow the scan to proceed
            }
        }
        // Update timestamp immediately to prevent race conditions from rapid duplicate scans
        // This blocks subsequent scans even if the HTTP request is still in progress
        *last_id = Some((onecard.clone(), std::time::Instant::now()));
    }

    // Submit the entry to the API
    let name = "Barcode".to_string();
    let submit_result = submit_entry(config_manager, CardData { name, onecard: onecard.clone() })
        .await
        .map_err(|e| format!("Failed to submit barcode entry: {}", e));

    // If submission failed, clear the timestamp to allow retry
    if submit_result.is_err() {
        let mut last_id = last_scanned_id.0.lock().unwrap();
        // Only clear if it's the same onecard (don't clear if a different barcode was scanned)
        if let Some((ref stored_onecard, _)) = *last_id {
            if stored_onecard == &onecard {
                *last_id = None;
            }
        }
    }

    submit_result?;

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

// Compile regex once at startup instead of on every call
static EVENT_HANDLER_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"on\w+\s*=").expect("valid regex"));

/// Validates and sanitizes a server URL to prevent code injection and ensure it's a valid URL.
/// Returns the sanitized URL or an error message.
fn validate_and_sanitize_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("Server URL is required".to_string());
    }

    // Check for dangerous patterns that could indicate code injection
    let dangerous_patterns = [
        "javascript:",
        "data:",
        "vbscript:",
        "<script",
        "</script>",
        "<iframe",
        "<object",
        "<embed",
        "eval(",
        "expression(",
    ];

    let url_lower = trimmed.to_lowercase();
    if dangerous_patterns.iter().any(|p| url_lower.contains(p)) {
        return Err("Invalid URL: contains potentially dangerous content".to_string());
    }

    if EVENT_HANDLER_RE.is_match(trimmed) {
        return Err("Invalid URL: contains event handler patterns".to_string());
    }

    // Add default scheme if missing
    let url_to_parse = if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        format!("http://{}", trimmed)
    } else {
        trimmed.to_string()
    };

    let parsed = Url::parse(&url_to_parse)
        .map_err(|e| format!("Invalid URL format: {}", e))?;

    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err("Only http:// and https:// URLs are allowed".to_string()),
    }

    if parsed.host().is_none() {
        return Err("URL must include a valid hostname".to_string());
    }

    // Extract all URL components before modifying the URL
    // Explicitly preserve the port if it was specified in the original URL
    // The port() method returns Some(port) only if explicitly set (non-default)
    let port = parsed.port();
    let scheme = parsed.scheme();
    let host = parsed.host_str().ok_or_else(|| "Invalid host".to_string())?;
    let mut path = parsed.path().to_string();
    let query = parsed.query();
    let fragment = parsed.fragment();

    // Trim trailing slashes on the path (except root)
    if path != "/" {
        path = path.trim_end_matches('/').to_string();
    }

    // Reconstruct URL with explicit port preservation
    let mut result = format!("{}://{}", scheme, host);
    if let Some(port_num) = port {
        result.push_str(&format!(":{}", port_num));
    }
    result.push_str(&path);
    if let Some(q) = query {
        result.push('?');
        result.push_str(q);
    }
    if let Some(f) = fragment {
        result.push('#');
        result.push_str(f);
    }

    Ok(result)
}

#[tauri::command]
async fn validate_and_sanitize_url_command(url: String) -> Result<String, String> {
    validate_and_sanitize_url(&url)
}

#[tauri::command]
async fn submit_first_run_config(
    config_manager: tauri::State<'_, ConfigManager>,
    device_name: String,
    device_location: String,
    server_url: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Validate and sanitize the server URL
    let sanitized_url = validate_and_sanitize_url(&server_url)?;

    let mut config = config_manager.get_config()?;
    config.device_friendly_name = Some(device_name.trim().to_string());
    config.device_location = Some(device_location.trim().to_string());
    config.server_url = Some(sanitized_url);
    config.first_run = false;
    // Save config
    {
        let mut lock = config_manager.config.lock()
            .map_err(|e| format!("Failed to acquire config lock: {}", e))?;
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

/// IPC command to perform a lightweight network availability check.
#[tauri::command]
async fn check_network_availability_command(
    config_manager: tauri::State<'_, ConfigManager>,
) -> Result<bool, String> {
    check_network_availability(config_manager).await
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

#[cfg(debug_assertions)]
#[tauri::command]
async fn log_frontend_message(
    level: String,
    message: String,
    target: Option<String>,
) -> Result<(), String> {
    debug_logging::add_frontend_log(level, message, target);
    Ok(())
}

#[tauri::command]
async fn log_error(
    level: String,
    source: String,
    message: String,
    timestamp: String,
) -> Result<(), String> {
    let log_message = format!("[{}] {}: {}", source, timestamp, message);
    match level.as_str() {
        "low" => {
            log::debug!("{}", log_message);
            #[cfg(debug_assertions)]
            debug_logging::add_backend_log("DEBUG".to_string(), source.clone(), log_message.clone());
        }
        "medium" => {
            log::info!("{}", log_message);
            #[cfg(debug_assertions)]
            debug_logging::add_backend_log("INFO".to_string(), source.clone(), log_message.clone());
        }
        "high" => {
            log::warn!("{}", log_message);
            #[cfg(debug_assertions)]
            debug_logging::add_backend_log("WARN".to_string(), source.clone(), log_message.clone());
        }
        "critical" => {
            log::error!("{}", log_message);
            #[cfg(debug_assertions)]
            debug_logging::add_backend_log("ERROR".to_string(), source.clone(), log_message.clone());
        }
        _ => {
            log::info!("{}", log_message);
            #[cfg(debug_assertions)]
            debug_logging::add_backend_log("INFO".to_string(), source.clone(), log_message.clone());
        }
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
fn clear_orphaned_state_command(
    config_manager: tauri::State<'_, ConfigManager>,
) -> Result<(), String> {
    log::info!("Clear orphaned state command received");
    clear_orphaned_state(config_manager)
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
async fn camera_start(
    camera_manager: tauri::State<'_, Arc<Mutex<CameraManager>>>,
    options: Option<CameraOptions>,
) -> Result<(), String> {
    // start is now synchronous, so we can call it directly
    camera_manager.lock().unwrap().start(options)
}

#[tauri::command]
fn camera_stop(
    camera_manager: tauri::State<'_, Arc<Mutex<CameraManager>>>,
) -> Result<(), String> {
    // stop is now synchronous, so we can call it directly
    camera_manager.lock().unwrap().stop()
}

#[tauri::command]
fn camera_set_preview_enabled(
    camera_manager: tauri::State<'_, Arc<Mutex<CameraManager>>>,
    enabled: bool,
) -> Result<(), String> {
    camera_manager.lock().unwrap().set_preview_enabled(enabled)
}

#[tauri::command]
fn camera_set_scanning_enabled(
    camera_manager: tauri::State<'_, Arc<Mutex<CameraManager>>>,
    enabled: bool,
) -> Result<(), String> {
    camera_manager.lock().unwrap().set_scanning_enabled(enabled)
}

#[tauri::command]
fn camera_get_status(
    camera_manager: tauri::State<'_, Arc<Mutex<CameraManager>>>,
) -> Result<CameraStatus, String> {
    Ok(camera_manager.lock().unwrap().get_status())
}

#[tauri::command]
fn camera_get_preview_frame(
    camera_manager: tauri::State<'_, Arc<Mutex<CameraManager>>>,
) -> Result<Option<Vec<u8>>, String> {
    Ok(camera_manager.lock().unwrap().get_latest_preview_frame())
}

// Scanner process state holder
struct ScannerProc(Mutex<Option<Child>>);
// Last error from scanner process
struct ScannerError(Arc<Mutex<Option<String>>>);
// Last scanned barcode ID for debouncing (ignore duplicates within time window)
// Stores (onecard_id, timestamp) to allow time-based debouncing
struct LastScannedId(Arc<Mutex<Option<(String, std::time::Instant)>>>);

#[tauri::command]
async fn get_camera_sidecar_status(
    scanner: tauri::State<'_, ScannerProc>,
    scanner_error: tauri::State<'_, ScannerError>,
) -> Result<serde_json::Value, String> {
    let mut proc_guard = scanner.0.lock().map_err(|e| format!("Failed to lock scanner state: {}", e))?;
    let error_guard = scanner_error.0.lock().map_err(|e| format!("Failed to lock error state: {}", e))?;

    let mut status = serde_json::json!({
        "running": false,
        "pid": None::<u32>,
        "exited": false,
        "exit_code": None::<i32>,
        "last_error": error_guard.as_ref().map(|s| s.as_str()),
    });

    if let Some(ref mut child) = *proc_guard {
        status["running"] = serde_json::Value::Bool(true);
        status["pid"] = serde_json::Value::Number(child.id().into());

        // Check if process has exited (try_wait requires mutable access)
        if let Ok(Some(exit_status)) = child.try_wait() {
            status["exited"] = serde_json::Value::Bool(true);
            status["running"] = serde_json::Value::Bool(false);
            if let Some(code) = exit_status.code() {
                status["exit_code"] = serde_json::Value::Number(code.into());
            }
        }
    }

    Ok(status)
}

/// Check if a camera is available on the system.
/// For PCI-connected cameras (non-hot-swappable), this checks:
/// - V4L2 devices (/dev/video*)
/// - libcamera devices (for Raspberry Pi cameras)
/// - sysfs video devices (/sys/class/video4linux/)
fn check_camera_available() -> bool {
    // Check for V4L2 devices (/dev/video*)
    // Match names like "video0", "video1", etc. but not just "video"
    if let Ok(entries) = std::fs::read_dir("/dev") {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if let Some(suffix) = name.strip_prefix("video") {
                    if !suffix.is_empty() && suffix.chars().all(|c| c.is_ascii_digit()) {
                        log::info!("Found V4L2 camera device: {:?}", path);
                        return true;
                    }
                }
            }
        }
    }

    // Check for libcamera devices (Raspberry Pi cameras)
    // Try using libcamera-hello --list-cameras command with timeout protection
    // Use timeout command if available, otherwise try direct call (may hang)
    if Command::new("timeout").arg("--version").output().is_ok() {
        // Use timeout command to prevent hanging
        if let Ok(output) = Command::new("timeout")
            .arg("5") // 5 second timeout
            .arg("libcamera-hello")
            .arg("--list-cameras")
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                // If the command succeeds and outputs camera info, we have a camera
                if !stdout.trim().is_empty() && stdout.contains("Available cameras") {
                    log::info!("Found libcamera device(s)");
                    return true;
                }
            }
        }
    } else {
        // Fallback: try direct call (may hang, but better than nothing)
        // Only proceed if libcamera-hello exists
        if Command::new("libcamera-hello").arg("--version").output().is_ok() {
            log::debug!("timeout command not available, trying libcamera-hello directly (may hang)");
            if let Ok(output) = Command::new("libcamera-hello")
                .arg("--list-cameras")
                .output()
            {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    if !stdout.trim().is_empty() && stdout.contains("Available cameras") {
                        log::info!("Found libcamera device(s)");
                        return true;
                    }
                }
            }
        }
    }

    // Check sysfs for video devices (/sys/class/video4linux/)
    if let Ok(entries) = std::fs::read_dir("/sys/class/video4linux") {
        let count = entries.count();
        if count > 0 {
            log::info!("Found {} video device(s) in sysfs", count);
            return true;
        }
    }

    log::warn!("No camera devices detected on the system");
    false
}

#[tauri::command]
async fn start_camera_sidecar(
    scanner: tauri::State<'_, ScannerProc>,
    scanner_error: tauri::State<'_, ScannerError>,
) -> Result<(), String> {
    let mut proc_guard = scanner.0.lock().map_err(|e| format!("Failed to lock scanner state: {}", e))?;

    // Check if process has exited and needs restart
    if let Some(ref mut child) = *proc_guard {
        if let Ok(Some(_)) = child.try_wait() {
            log::warn!("Camera sidecar process has exited, restarting...");
            // Process exited, remove it so we can start a new one
            proc_guard.take();
        } else {
            log::info!("Camera sidecar is already running");
            return Ok(());
        }
    }

    // Check if camera is available before starting sidecar
    log::info!("Checking for camera availability...");
    if !check_camera_available() {
        log::warn!("No camera detected on system. Skipping camera sidecar startup.");
        return Err("No camera detected on system. Camera sidecar will not start.".to_string());
    }

    log::info!("Camera detected, starting camera sidecar...");

    // Find the camera sidecar binary/script
    // Priority order:
    // 1. /opt/guestbook/sidecar/ (primary production location)
    // 2. /usr/share/guestbook-kiosk/sidecar/ (alternative production location)
    // 3. Development paths (Python script for local development)
    //
    // Note: The sidecar is NOT bundled in the AppImage. It must be installed separately
    // via the setup script to /opt/guestbook/sidecar/ (preferred) or /usr/share/guestbook-kiosk/sidecar/

    let mut script_path = None;

    let search_paths = vec![
        // Primary production location: /opt/guestbook/sidecar/ (check binary first, then Python script)
        PathBuf::from("/opt/guestbook/sidecar/camera_sidecar"),
        PathBuf::from("/opt/guestbook/sidecar/camera_sidecar.py"),
        // Alternative production location: /usr/share/guestbook-kiosk/sidecar/
        PathBuf::from("/usr/share/guestbook-kiosk/sidecar/camera_sidecar"),
        PathBuf::from("/usr/share/guestbook-kiosk/sidecar/camera_sidecar.py"),
        // Development paths (Python script for local development)
        PathBuf::from("sidecar/camera_sidecar.py"),
        PathBuf::from("../sidecar/camera_sidecar.py"),
        PathBuf::from("../../sidecar/camera_sidecar.py"),
    ];

    for path in &search_paths {
        if path.exists() {
            script_path = Some(path.canonicalize().map_err(|e| {
                format!("Failed to canonicalize path {:?}: {}", path, e)
            })?);
            log::debug!("Found camera sidecar at: {:?}", script_path);
            break;
        }
    }

    let script_path = script_path.ok_or_else(|| {
        "Could not find camera sidecar binary or script. \
            Expected locations:\n\
            - /opt/guestbook/sidecar/camera_sidecar (primary production location)\n\
            - /usr/share/guestbook-kiosk/sidecar/camera_sidecar (alternative production)\n\
            - sidecar/camera_sidecar.py (development)\n\
            \n\
            The camera sidecar must be installed separately via the setup script from the admin portal. \
            Contact your administrator if the sidecar is missing.".to_string()
    })?;

    log::info!("Found camera sidecar at: {:?}", script_path);

    // Determine if it's a binary or Python script
    let is_binary = script_path.extension().is_none() || script_path.extension() != Some(std::ffi::OsStr::new("py"));

    // Spawn process - use binary directly or python3 for script
    let mut child = if is_binary {
        log::info!("Starting camera sidecar as binary: {:?}", script_path);
        Command::new(&script_path)
    } else {
        log::info!("Starting camera sidecar as Python script: {:?}", script_path);
        let mut cmd = Command::new("python3");
        cmd.arg(&script_path);
        cmd
    }
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn camera sidecar: {} (path: {:?})", e, script_path))?;

    // Capture stderr for logging and error tracking
    // Clear previous error
    {
        let mut err_guard = scanner_error.0.lock().map_err(|e| format!("Failed to lock error state: {}", e))?;
        *err_guard = None;
    }

    let error_state = Arc::clone(&scanner_error.0);
    if let Some(stderr) = child.stderr.take() {
        let stderr_reader = BufReader::new(stderr);
        let child_id = child.id();
        std::thread::spawn(move || {
            for line in stderr_reader.lines().map_while(Result::ok) {
                log::error!("[Camera Sidecar PID {}] {}", child_id, line);
                // Store last error line for frontend access
                if let Ok(mut err_guard) = error_state.lock() {
                    *err_guard = Some(line.clone());
                }
            }
        });
    }

    // Capture stdout for logging
    if let Some(stdout) = child.stdout.take() {
        let stdout_reader = BufReader::new(stdout);
        let child_id = child.id();
        std::thread::spawn(move || {
            for line in stdout_reader.lines().map_while(Result::ok) {
                log::info!("[Camera Sidecar PID {}] {}", child_id, line);
            }
        });
    }

    // Check if process is still alive after a brief moment
    let child_id = child.id();
    std::thread::sleep(std::time::Duration::from_millis(100));
    if let Ok(Some(_)) = child.try_wait() {
        return Err("Camera sidecar process exited immediately after start. Check logs for errors.".to_string());
    }

    *proc_guard = Some(child);
    log::info!("Camera sidecar started successfully (PID: {})", child_id);

    Ok(())
}

#[tauri::command]
async fn stop_camera_sidecar(
    scanner: tauri::State<'_, ScannerProc>,
) -> Result<(), String> {
    let mut proc_guard = scanner.0.lock().map_err(|e| format!("Failed to lock scanner state: {}", e))?;

    if let Some(mut child) = proc_guard.take() {
        log::info!("Stopping camera sidecar...");
        child.kill().map_err(|e| format!("Failed to kill camera sidecar: {}", e))?;
        // Wait for process to exit (with timeout)
        let _ = child.wait();
        log::info!("Camera sidecar stopped");
    } else {
        log::info!("Camera sidecar was not running");
    }

    Ok(())
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

    // Initialize debug logging (HTTP server started in setup callback)
    #[cfg(debug_assertions)]
    {
        debug_logging::init_debug_logging();
        log::info!("Debug logging initialized");
    }

    // Initialize HID manager
    let hid_manager = HIDManager::new();

    // Initialize scanner process state
    let scanner_proc = ScannerProc(Mutex::new(None));
    let scanner_error = ScannerError(Arc::new(Mutex::new(None)));
    let last_scanned_id = LastScannedId(Arc::new(Mutex::new(None)));

    // Initialize camera manager
    let camera_manager = CameraManager::new();

    // Build the Tauri builder with conditional devtools plugin
    let builder = {
        let b = tauri::Builder::default()
            .plugin(tauri_plugin_http::init())
            .plugin(tauri_plugin_shell::init());
        #[cfg(debug_assertions)] // only enable instrumentation in development builds
        {
            b.plugin(tauri_plugin_devtools::init())
        }
        #[cfg(not(debug_assertions))]
        {
            b
        }
    };
    builder
        .manage(config_manager)
        .manage(hid_manager)
        .manage(scanner_proc)
        .manage(scanner_error)
        .manage(last_scanned_id)
        .manage(Arc::new(Mutex::new(camera_manager)))
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
            set_camera_preview_enabled,
            validate_and_sanitize_url_command,
            submit_first_run_config,
            send_heartbeat_command,
            check_network_availability_command,
            log_error,
            test_logging,
            restart_appliance,
            reset_device_command,
            clear_orphaned_state_command,
            submit_swipe_entry,
            submit_barcode_entry,
            submit_manual_entry,
            get_app_version,
            start_camera_sidecar,
            stop_camera_sidecar,
            get_camera_sidecar_status,
            camera_start,
            camera_stop,
            camera_set_preview_enabled,
            camera_set_scanning_enabled,
            camera_get_status,
            camera_get_preview_frame,
            #[cfg(debug_assertions)]
            log_frontend_message,
        ])
        .setup(|app| {
            // Start debug HTTP server for remote log viewing (debug builds only)
            #[cfg(feature = "debug-server")]
            {
                let debug_port = 7314;
                // Use Tauri's async runtime to spawn the server task
                tauri::async_runtime::spawn(async move {
                    match debug_server::start_debug_server(debug_port).await {
                        Ok(_handle) => {
                            log::info!("Debug log server started successfully on port {}", debug_port);
                        }
                        Err(e) => {
                            eprintln!("Failed to start debug log server: {}", e);
                        }
                    }
                });
            }

            // Get the main window and HID manager
            let window = app.get_webview_window("main").unwrap();
            let hid_manager = app.state::<HIDManager>();

            // Set the window in the HID manager
            hid_manager.set_window(window.clone());

            // Start initial device connection and monitoring
            if let Err(e) = hid_manager.start_initial_connection() {
                log::error!("Failed to start HID device monitoring: {}", e);
            }

            // Initialize camera manager with app handle
            if let Some(camera_manager) = app.try_state::<Arc<Mutex<CameraManager>>>() {
                {
                    let mut manager = camera_manager.lock().unwrap();
                    manager.set_app_handle(app.handle().clone());
                }

                // Get config to check if preview should be enabled
                let preview_enabled = if let Some(config_manager) = app.try_state::<ConfigManager>() {
                    config_manager.get_config()
                        .ok()
                        .map(|c| c.camera_preview_enabled)
                        .unwrap_or(false)
                } else {
                    false
                };

                // Start camera on app start (safe mode)
                // Start is now synchronous, so we can call it directly
                if let Err(e) = camera_manager.lock().unwrap().start(None) {
                    log::warn!("Failed to start camera on app start: {}", e);
                } else {
                    // Enable preview if configured
                    if preview_enabled {
                        if let Err(e) = camera_manager.lock().unwrap().set_preview_enabled(true) {
                            log::warn!("Failed to enable camera preview: {}", e);
                        }
                    }
                }
            }

            // Camera preview will be served via Tauri command (get_camera_preview_frame)
            // This avoids the complexity of custom protocol registration in Tauri 2.0

            // Cleanup scanner sidecar on app exit
            let app_handle = app.handle().clone();
            app_handle.clone().listen("tauri://close-requested", move |_| {
                log::info!("App closing, stopping camera sidecar...");
                if let Some(scanner_proc) = app_handle.try_state::<ScannerProc>() {
                    if let Ok(mut proc_guard) = scanner_proc.0.lock() {
                        if let Some(mut child) = proc_guard.take() {
                            if let Err(e) = child.kill() {
                                log::error!("Failed to kill camera sidecar on exit: {}", e);
                            } else {
                                let _ = child.wait();
                                log::info!("Camera sidecar stopped on app exit");
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
    }