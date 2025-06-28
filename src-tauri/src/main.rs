// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod devices;
mod hid;
use devices::barcode::{listen_to_barcode, open_symbol_scanner};
use devices::magtek::{listen_to_magtek, open_magtek_reader};
use tauri::Manager;

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

fn main() {
    #[cfg(debug_assertions)] // only enable instrumentation in development builds
    let devtools = tauri_plugin_devtools::init();

    let mut builder = tauri::Builder::default();

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(devtools);
    }
    builder
        .invoke_handler(tauri::generate_handler![
            get_hid_devices,
            start_barcode_listener,
            start_magtek_listener,
            show_first_run_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
