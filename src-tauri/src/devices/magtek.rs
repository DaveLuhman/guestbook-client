use hidapi::{HidApi, HidDevice};
use regex::Regex;
use serde::Serialize;
use tauri::{Emitter, Window};
use log::{info, warn, error};
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

fn parse_card_data(data: &str) -> Option<CardData> {
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

pub fn listen_to_magtek(device: HidDevice, window: Window) {
    info!("Starting MagTek reader listener thread");
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
                            info!("MagTek card swiped: {} - {}", card.onecard, card.name);
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
                        error!("MagTek reader failed after {} consecutive errors, stopping listener", max_consecutive_errors);
                        window.emit("hid-error", format!("MagTek reader failed: {}", e)).ok();
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
        assert_eq!(card.onecard, "1234567");
        assert_eq!(card.name, "DOE/JOHN");
    }

    #[test]
    fn parse_invalid_track() {
        let data = "%B12^BAD^";
        assert!(parse_card_data(data).is_none());
    }
}
