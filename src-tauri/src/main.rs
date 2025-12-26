// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod api;
mod config;
mod devices;
mod hid;
mod logging;

#[cfg(debug_assertions)]
mod debug_logging;
#[cfg(debug_assertions)]
mod debug_server;
use api::devices::{register_device, send_heartbeat, reset_device, check_network_availability};
use config::config_manager::{get_full_config, set_camera_preview_enabled, ConfigManager};
use devices::barcode::{listen_to_barcode, open_symbol_scanner};
use devices::magtek::{listen_to_magtek, open_magtek_reader};
use hid::manager::{HIDManager, DeviceConnectionState};
use tauri::WebviewWindow;
use tauri::Manager;
use tauri::Listener;

use api::entries::{submit_entry, CardData};
use std::sync::{Arc, Mutex};
use std::process::{Command, Child, Stdio};
use std::path::PathBuf;
use std::io::{BufRead, BufReader};

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
    // Debounce: ignore if this is the same ID as the most recently scanned
    {
        let last_id = last_scanned_id.0.lock().unwrap();
        if let Some(ref last) = *last_id {
            if last == &onecard {
                log::debug!("Ignoring duplicate scan (debounce): {}", onecard);
                return Ok(()); // Return success silently for duplicates
            }
        }
    }

    // Update last scanned ID
    {
        let mut last_id = last_scanned_id.0.lock().unwrap();
        *last_id = Some(onecard.clone());
    }

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
    let mut config = config_manager.get_config()?;
    config.device_friendly_name = Some(device_name);
    config.device_location = Some(device_location);
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
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// Scanner process state holder
struct ScannerProc(Mutex<Option<Child>>);
// Last error from scanner process
struct ScannerError(Arc<Mutex<Option<String>>>);
// Last scanned barcode ID for debouncing (ignore duplicates)
struct LastScannedId(Arc<Mutex<Option<String>>>);

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

#[tauri::command]
async fn start_camera_sidecar(
    app: tauri::AppHandle,
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

    log::info!("Starting camera sidecar...");

    // Find the camera sidecar binary/script
    // Priority order:
    // 1. Bundled binary in AppImage resources (production)
    // 2. Development paths (Python script)
    // 3. System installation path

    let mut script_path = None;

    // Try to find bundled binary in AppImage resources first
    // In Tauri, resources are bundled and accessible via the resource directory
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled_binary = resource_dir.join("camera_sidecar");
        if bundled_binary.exists() && bundled_binary.is_file() {
            log::info!("Found bundled camera sidecar binary at: {:?}", bundled_binary);
            script_path = Some(bundled_binary);
        } else {
            log::debug!("Bundled binary not found at: {:?}", bundled_binary);
        }
    } else {
        log::debug!("Could not access resource directory (may not be in AppImage)");
    }

    // If not found in resources, try development paths (Python script)
    if script_path.is_none() {
        let script_paths = vec![
            // Development path (when running from project root)
            PathBuf::from("sidecar/camera_sidecar.py"),
            // Development path (when running from src-tauri/)
            PathBuf::from("../sidecar/camera_sidecar.py"),
            // Alternative development path
            PathBuf::from("../../sidecar/camera_sidecar.py"),
            // System installation path
            PathBuf::from("/usr/share/guestbook-kiosk/sidecar/camera_sidecar.py"),
        ];

        for path in &script_paths {
            if path.exists() {
                script_path = Some(path.canonicalize().map_err(|e| {
                    format!("Failed to canonicalize path {:?}: {}", path, e)
                })?);
                break;
            }
        }
    }

    let script_path = script_path.ok_or_else(|| {
        format!(
            "Could not find camera sidecar binary or script. Checked bundled resources and paths: sidecar/camera_sidecar.py, ../sidecar/camera_sidecar.py, /usr/share/guestbook-kiosk/sidecar/camera_sidecar.py"
        )
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
            for line in stderr_reader.lines() {
                if let Ok(line) = line {
                    log::error!("[Camera Sidecar PID {}] {}", child_id, line);
                    // Store last error line for frontend access
                    if let Ok(mut err_guard) = error_state.lock() {
                        *err_guard = Some(line.clone());
                    }
                }
            }
        });
    }

    // Capture stdout for logging
    if let Some(stdout) = child.stdout.take() {
        let stdout_reader = BufReader::new(stdout);
        let child_id = child.id();
        std::thread::spawn(move || {
            for line in stdout_reader.lines() {
                if let Ok(line) = line {
                    log::info!("[Camera Sidecar PID {}] {}", child_id, line);
                }
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

    // Build the Tauri builder with conditional devtools plugin
    let builder = {
        let mut b = tauri::Builder::default()
            .plugin(tauri_plugin_http::init())
            .plugin(tauri_plugin_shell::init());
        #[cfg(debug_assertions)] // only enable instrumentation in development builds
        {
            b = b.plugin(tauri_plugin_devtools::init());
        }
        b
    };
    builder
        .plugin(crabcamera::init())
        .manage(config_manager)
        .manage(hid_manager)
        .manage(scanner_proc)
        .manage(scanner_error)
        .manage(last_scanned_id)
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
            submit_first_run_config,
            send_heartbeat_command,
            check_network_availability_command,
            log_error,
            test_logging,
            restart_appliance,
            reset_device_command,
            submit_swipe_entry,
            submit_barcode_entry,
            submit_manual_entry,
            get_app_version,
            start_camera_sidecar,
            stop_camera_sidecar,
            get_camera_sidecar_status,
            #[cfg(debug_assertions)]
            log_frontend_message,
        ])
        .setup(|app| {
            // Start debug HTTP server for remote log viewing (debug builds only)
            #[cfg(debug_assertions)]
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
