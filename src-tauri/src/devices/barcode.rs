use hidapi::{HidApi, HidDevice};
use std::time::{Duration, Instant};
use tauri::{Emitter, WebviewWindow};
use log::warn;
use regex::Regex;

pub fn listen_to_barcode(device: HidDevice, window: WebviewWindow) {
    std::thread::spawn(move || {
        let mut buffer = [0u8; 64];
        let mut scan_buffer = String::new();
        let mut last_char_time = Instant::now();
        let mut consecutive_errors = 0;
        let max_consecutive_errors = 5;

        loop {
            match device.read(&mut buffer) {
                Ok(size) => {
                    consecutive_errors = 0; // Reset error counter on successful read
                    let now = Instant::now();
                    let raw_data = &buffer[..size];
                    let part = String::from_utf8_lossy(raw_data);

                    // If too much time passed between characters, flush early
                    if now.duration_since(last_char_time) > Duration::from_millis(150) {
                        scan_buffer.clear();
                    }

                    scan_buffer.push_str(&part);
                    last_char_time = now;

                    // Try to parse barcode in format ^1234567^
                    // First, try regex pattern for ^(\d+)^ format
                    if let Ok(re) = Regex::new(r"^\^(\d+)\^$") {
                        if let Some(caps) = re.captures(&scan_buffer.trim()) {
                            if let Some(onecard) = caps.get(1) {
                                let onecard_str = onecard.as_str();
                                // Validate it's 7 digits (OneCard format)
                                if onecard_str.len() == 7 {
                                    // Barcode scanned successfully
                                    window.emit("barcode-data", onecard_str.to_string()).ok();
                                    scan_buffer.clear();
                                    continue;
                                }
                            }
                        }
                    }

                    // Fallback: Attempt auto-flush if it looks like a 7–9 digit scan (legacy format)
                    let cleaned = scan_buffer.replace(|c: char| !c.is_ascii_digit(), "");

                    if cleaned.len() == 7 || cleaned.len() == 9 {
                        // Barcode scanned successfully
                        window.emit("barcode-data", cleaned.clone()).ok();
                        scan_buffer.clear();
                    }
                }
                Err(e) => {
                    consecutive_errors += 1;
                    warn!("Barcode scanner read error (attempt {}/{}): {}", consecutive_errors, max_consecutive_errors, e);

                    if consecutive_errors >= max_consecutive_errors {
                        // Barcode scanner failed after too many consecutive errors, stopping listener
                        window.emit("hid-error", format!("Barcode scanner failed: {}", e)).ok();
                        window.emit("device-status", serde_json::json!({
                            "device": "barcode",
                            "status": "error",
                            "error": format!("Barcode scanner failed: {}", e)
                        })).ok();
                        break;
                    }

                    // Wait a bit before retrying
                    std::thread::sleep(Duration::from_millis(100));
                }
            }
        }
    });
}

pub fn open_symbol_scanner(api: &HidApi) -> Option<HidDevice> {
    // Searching for barcode scanner
    for device in api.device_list() {
        let vendor_id = device.vendor_id();
        let _product_id = device.product_id();
        let manufacturer = device.manufacturer_string().unwrap_or_default();
        let product = device.product_string().unwrap_or_default();

        // Checking device: VID:{:04X} PID:{:04X} - {} - {}
        // vendor_id, product_id, manufacturer, product);

        let vendor_match = vendor_id == 0x05e0;
        let name_match = manufacturer.contains("Symbol")
            || manufacturer.contains("Zebra")
            || product.contains("Scanner");

        if vendor_match || name_match {
            // Found potential barcode scanner: VID:{:04X} PID:{:04X} - {} - {}
            // vendor_id, product_id, manufacturer, product);
            match api.open_path(device.path()) {
                Ok(device) => {
                    // Successfully opened barcode scanner
                    return Some(device);
                }
                Err(e) => {
                    warn!("Failed to open barcode scanner: {}", e);
                }
            }
        }
    }
    warn!("No barcode scanner found");
    None
}
