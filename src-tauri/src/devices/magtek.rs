use hidapi::{HidApi, HidDevice};
use regex::Regex;
use serde::Serialize;
use std::time::{Duration, Instant};
use tauri::Window;

#[derive(Serialize)]
pub struct CardData {
    pub id: String,
    pub name: String,
}

fn parse_card_data(data: &str) -> Option<CardData> {
    let data = data.trim();
    let track1 = data.split('?').next().unwrap_or(data);
    let parts: Vec<&str> = track1.split('^').collect();
    if parts.len() >= 3 {
        let name = parts[1].trim().to_string();
        let after_name = parts[2];
        let id_re = Regex::new(r"(\d{7})").unwrap();
        if let Some(cap) = id_re.captures(after_name) {
            let id = cap.get(1).unwrap().as_str().to_string();
            return Some(CardData { id, name });
        }
    }
    None
}

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
                            if let Some(card) = parse_card_data(&scan_buffer) {
                                window.emit("magtek-data", card).ok();
                            } else {
                                window.emit("hid-data", scan_buffer.clone()).ok();
                            }
                            scan_buffer.clear();
                        }
                    }

                    scan_buffer.push_str(&part);
                    last_char_time = now;

                    if scan_buffer.contains('\n') || scan_buffer.contains('\r') {
                        let cleaned = scan_buffer.trim().to_string();
                        if let Some(card) = parse_card_data(&cleaned) {
                            window.emit("magtek-data", card).ok();
                        } else {
                            window.emit("hid-data", cleaned.clone()).ok();
                        }
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
