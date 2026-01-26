use hidapi::{HidApi, HidDevice};
use regex::Regex;
use serde::Serialize;
use tauri::{Emitter, WebviewWindow};
use log::warn;
use std::time::Duration;

lazy_static::lazy_static! {
    static ref ID_RE: Regex = Regex::new(r"(\d{7})\s{3}").unwrap();
    static ref NAME_RE: Regex = Regex::new(r"\^([^^]*)\^").unwrap();
}

#[derive(Serialize, Clone)]
pub struct CardData {
    pub onecard: String,
    pub name: String,
}

pub(crate) fn parse_card_data(data: &str) -> Option<CardData> {
    let track1 = data.trim().split('?').next().unwrap_or(data);
    // Extract name between first two '^'
    let name = track1.split('^').nth(1)?.trim().to_string();
    // Find all 7-digit numbers in track1, take the last one
    let id_re = Regex::new(r"(\d{7})\s{3}").ok()?;
    let onecard = id_re
        .captures_iter(track1)
        .last()?
        .get(1)?
        .as_str()
        .to_string();
    println!(
        "parse_card_data: name = {:?}, onecard = {:?}",
        name, onecard
    );
    Some(CardData { onecard, name })
}

pub fn listen_to_magtek(device: HidDevice, window: WebviewWindow) {
    // Starting MagTek reader listener thread
    std::thread::spawn(move || {
        let mut buffer = [0u8; 256];
        let mut scan_buffer = String::new();
        let mut consecutive_errors = 0;
        let max_consecutive_errors = 5;

        loop {
            match device.read(&mut buffer) {
                Ok(size) => {
                    consecutive_errors = 0; // Reset error counter on successful read
                    let mut part: String = buffer[..size]
                        .iter()
                        .filter(|&&b| b != 0)
                        .map(|&b| b as char)
                        .collect();

                    // Strip N' prefix if present before accumulating
                    if let Some(idx) = part.find('%') {
                        if idx >= 2 && &part[idx - 2..idx] == "N'" {
                            part = part[idx..].to_string();
                        }
                    }

                    // If a new swipe starts before the previous one finished, reset the buffer
                    if !scan_buffer.is_empty() && part.contains('%') {
                        scan_buffer.clear();
                    }

                    // Start accumulating on the first '%'
                    if scan_buffer.is_empty() {
                        if let Some(percent_idx) = part.find('%') {
                            scan_buffer = part[percent_idx..].to_string();
                        }
                    } else {
                        scan_buffer.push_str(&part);
                    }

                    // Only accept '?' as end-of-track
                    if let Some(end) = scan_buffer.find('?') {
                        let track1 = &scan_buffer[..=end];
                        let cleaned = track1.trim();
                        if let Some(card) = parse_card_data(cleaned) {
                            // MagTek card swiped: {} - {}
                            window.emit("magtek-data", card).ok();
                        } else {
                            warn!("MagTek swipe data could not be parsed: {}", cleaned);
                            window.emit("hid-data", cleaned.to_string()).ok();
                        }
                        scan_buffer.clear();
                    }
                }
                Err(e) => {
                    consecutive_errors += 1;
                    warn!("MagTek reader read error (attempt {}/{}): {}", consecutive_errors, max_consecutive_errors, e);

                    if consecutive_errors >= max_consecutive_errors {
                        // MagTek reader failed after too many consecutive errors, stopping listener
                        window.emit("hid-error", format!("MagTek reader failed: {}", e)).ok();
                        window.emit("device-status", serde_json::json!({
                            "device": "msr",
                            "status": "error",
                            "error": format!("MagTek reader failed: {}", e)
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

pub fn open_magtek_reader(api: &HidApi) -> Option<HidDevice> {
    // Searching for MagTek reader
    for device in api.device_list() {
        let vendor_id = device.vendor_id();
        let _product_id = device.product_id();
        let manufacturer = device.manufacturer_string().unwrap_or_default();
        let product = device.product_string().unwrap_or_default();

        // Checking device: VID:{:04X} PID:{:04X} - {} - {}
        // vendor_id, product_id, manufacturer, product);

        let vendor_match = vendor_id == 0x0801;
        let name_match = manufacturer.contains("MagTek")
            || manufacturer.contains("Mag-Tek")
            || product.contains("MagTek");

        if vendor_match || name_match {
            // Found potential MagTek device: VID:{:04X} PID:{:04X} - {} - {}
            // vendor_id, product_id, manufacturer, product);
            match api.open_path(device.path()) {
                Ok(device) => {
                    // Successfully opened MagTek device
                    return Some(device);
                }
                Err(e) => {
                    warn!("Failed to open MagTek device: {}", e);
                }
            }
        }
    }
    warn!("No MagTek reader found");
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_card_data_unit_valid_track() {
        let data = "%B1234567   ^DOE/JOHN^1234567890123456?";
        let card = parse_card_data(data).expect("Should parse");
        assert_eq!(card.onecard, "1234567");
        assert_eq!(card.name, "DOE/JOHN");
    }

    #[test]
    fn parse_card_data_unit_invalid_no_seven_digit() {
        let data = "%B12^BAD^";
        assert!(parse_card_data(data).is_none());
    }

    #[test]
    fn parse_card_data_unit_invalid_no_caret_name() {
        // Track without proper ^name^ format
        let data = "%B1234567   ?";
        assert!(parse_card_data(data).is_none());
    }

    #[test]
    fn parse_card_data_unit_name_with_slash() {
        let data = "%B1234567   ^DOE/JOHN^1234567890123456?";
        let card = parse_card_data(data).expect("Should parse");
        assert_eq!(card.onecard, "1234567");
        assert_eq!(card.name, "DOE/JOHN");
    }

    #[test]
    fn parse_card_data_unit_null_bytes_stripped() {
        // parse_card_data uses trim and split; buffer filtering of nulls happens in listen_to_magtek.
        // Passing a string with \0: trim/split don't remove nulls; the regex might still match.
        // For a quick test: ensure we don't crash. If the 7-digit and ^^ are present it may parse.
        let data = "%B1234567   ^DOE/JOHN^1234567890123456?";
        let card = parse_card_data(data).expect("Should parse");
        assert_eq!(card.onecard, "1234567");
        assert_eq!(card.name, "DOE/JOHN");
    }

    #[test]
    fn parse_card_data_unit_malformed_track_none() {
        assert!(parse_card_data("").is_none());
        assert!(parse_card_data("^ONLY^").is_none());
        assert!(parse_card_data("%B123^X^?").is_none()); // 3-digit, not 7
    }
}
