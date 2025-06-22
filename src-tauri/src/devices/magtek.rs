use hidapi::{HidApi, HidDevice};
use regex::Regex;
use serde::Serialize;
use std::time::{Duration, Instant};
use tauri::{Emitter, Window};

lazy_static::lazy_static! {
    static ref ID_RE: Regex = Regex::new(r"(\d{7})\s{3}").unwrap();
    static ref NAME_RE: Regex = Regex::new(r"(?<=\^)(.*?)(?=\^)").unwrap();
}

#[derive(Serialize, Clone)]
pub struct CardData {
    pub id: String,
    pub name: String,
}

fn parse_card_data(data: &str) -> Option<CardData> {
    let track1 = data.trim().split('?').next().unwrap_or(data);

    let id_caps = ID_RE.captures(track1)?;
    let name_caps = NAME_RE.captures(track1)?;

    let id = id_caps.get(1)?.as_str().to_string();
    let name = name_caps.get(1)?.as_str().to_string();

    Some(CardData { id, name })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_valid_track() {
        let data = "%B1234567   ^DOE/JOHN^1234567890123456?";
        let card = parse_card_data(data).expect("Should parse");
        assert_eq!(card.id, "1234567");
        assert_eq!(card.name, "DOE/JOHN");
    }

    #[test]
    fn parse_invalid_track() {
        let data = "%B12^BAD^";
        assert!(parse_card_data(data).is_none());
    }
}
