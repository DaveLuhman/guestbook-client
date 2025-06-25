use hidapi::{HidApi, HidDevice};
use std::time::{Duration, Instant};
use tauri::{Emitter, Window};

pub fn listen_to_barcode(device: HidDevice, window: Window) {
    std::thread::spawn(move || {
        let mut buffer = [0u8; 64];
        let mut scan_buffer = String::new();
        let mut last_char_time = Instant::now();

        loop {
            match device.read(&mut buffer) {
                Ok(size) => {
                    let now = Instant::now();
                    let raw_data = &buffer[..size];
                    let part = String::from_utf8_lossy(raw_data);

                    // If too much time passed between characters, flush early
                    if now.duration_since(last_char_time) > Duration::from_millis(150) {
                        scan_buffer.clear();
                    }

                    scan_buffer.push_str(&part);
                    last_char_time = now;

                    // Attempt auto-flush if it looks like a 7–9 digit scan
                    let cleaned = scan_buffer.replace(|c: char| !c.is_ascii_digit(), "");

                    if cleaned.len() == 7 || cleaned.len() == 9 {
                        window.emit("barcode-data", cleaned.clone()).ok();
                        scan_buffer.clear();
                    }
                }
                Err(e) => {
                    window.emit("hid-error", e.to_string()).ok();
                    break;
                }
            }
        }
    });
}

pub fn open_symbol_scanner(api: &HidApi) -> Option<HidDevice> {
    for device in api.device_list() {
        let vendor_match = device.vendor_id() == 0x05e0;
        let manufacturer = device.manufacturer_string().unwrap_or_default();
        let product = device.product_string().unwrap_or_default();

        let name_match = manufacturer.contains("Symbol")
            || manufacturer.contains("Zebra")
            || product.contains("Scanner");

        if vendor_match || name_match {
            return api.open_path(device.path()).ok();
        }
    }
    None
}
