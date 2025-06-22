use hidapi::{HidApi, HidDevice};
use std::time::{Duration, Instant};
use tauri::Window;

pub fn listen_to_magtek(device: HidDevice, window: Window) {
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

                    if now.duration_since(last_char_time) > Duration::from_millis(150) {
                        if !scan_buffer.is_empty() {
                            window.emit("hid-data", scan_buffer.clone()).ok();
                            scan_buffer.clear();
                        }
                    }

                    scan_buffer.push_str(&part);
                    last_char_time = now;

                    if scan_buffer.contains('\n') || scan_buffer.contains('\r') {
                        let cleaned = scan_buffer.trim().to_string();
                        window.emit("hid-data", cleaned.clone()).ok();
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

pub fn open_magtek_reader(api: &HidApi) -> Option<HidDevice> {
    for device in api.device_list() {
        let vendor_match = device.vendor_id() == 0x0801;
        let manufacturer = device.manufacturer_string().unwrap_or_default();
        let product = device.product_string().unwrap_or_default();

        let name_match = manufacturer.contains("MagTek")
            || manufacturer.contains("Mag-Tek")
            || product.contains("MagTek");

        if vendor_match || name_match {
            return api.open_path(device.path()).ok();
        }
    }
    None
}
