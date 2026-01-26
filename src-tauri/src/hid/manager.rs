use crate::devices::barcode::{listen_to_barcode, open_symbol_scanner};
use crate::devices::magtek::{listen_to_magtek, open_magtek_reader};
use hidapi::HidApi;
use log::warn;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Emitter, WebviewWindow};

#[cfg(target_os = "linux")]
use std::thread;


#[derive(Debug, Clone, PartialEq)]
pub enum DeviceConnectionState {
    Connected,
    Disconnected,
    Error(String),
}

#[derive(Debug, Clone)]
pub struct DeviceStatus {
    pub state: DeviceConnectionState,
    pub last_seen: Option<Instant>,
    pub error_count: u32,
    pub last_error: Option<String>,
}

impl Default for DeviceStatus {
    fn default() -> Self {
        Self {
            state: DeviceConnectionState::Disconnected,
            last_seen: None,
            error_count: 0,
            last_error: None,
        }
    }
}

pub struct HIDManager {
    pub barcode_status: Arc<Mutex<DeviceStatus>>,
    pub msr_status: Arc<Mutex<DeviceStatus>>,
    pub window: Arc<Mutex<Option<WebviewWindow>>>,
}

impl HIDManager {
    pub fn new() -> Self {
        Self {
            barcode_status: Arc::new(Mutex::new(DeviceStatus::default())),
            msr_status: Arc::new(Mutex::new(DeviceStatus::default())),
            window: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_window(&self, window: WebviewWindow) {
        let mut window_guard = self.window.lock().unwrap();
        *window_guard = Some(window);
    }

    pub fn get_barcode_connected(&self) -> bool {
        let status = self.barcode_status.lock().unwrap();
        matches!(status.state, DeviceConnectionState::Connected)
    }

    pub fn get_msr_connected(&self) -> bool {
        let status = self.msr_status.lock().unwrap();
        matches!(status.state, DeviceConnectionState::Connected)
    }

    pub fn get_barcode_status(&self) -> DeviceStatus {
        self.barcode_status.lock().unwrap().clone()
    }

    pub fn get_msr_status(&self) -> DeviceStatus {
        self.msr_status.lock().unwrap().clone()
    }

    pub fn start_device_monitoring(&self) {
        let barcode_status = Arc::clone(&self.barcode_status);
        let msr_status = Arc::clone(&self.msr_status);
        let window = Arc::clone(&self.window);

        // Start monitoring thread
        std::thread::spawn(move || {
            loop {
                // Check if both devices are connected
                let both_connected = {
                    let barcode = barcode_status.lock().unwrap();
                    let msr = msr_status.lock().unwrap();
                    matches!(barcode.state, DeviceConnectionState::Connected) &&
                    matches!(msr.state, DeviceConnectionState::Connected)
                };

                if both_connected {
                    // Both devices connected - no need to check frequently
                    std::thread::sleep(Duration::from_secs(60)); // Check every minute when both connected
                    continue;
                }

                // One or both devices missing - check every 15 seconds
                let api = match HidApi::new() {
                    Ok(api) => api,
                    Err(_) => {
                        std::thread::sleep(Duration::from_secs(15));
                        continue;
                    }
                };

                // Try to reconnect barcode scanner if not connected
                {
                    let barcode = barcode_status.lock().unwrap();
                    if !matches!(barcode.state, DeviceConnectionState::Connected) {
                        drop(barcode); // Release lock before calling reconnect
                        Self::attempt_reconnect_barcode_static(&barcode_status, &api, &window).ok();
                    }
                }

                // Try to reconnect MSR reader if not connected
                {
                    let msr = msr_status.lock().unwrap();
                    if !matches!(msr.state, DeviceConnectionState::Connected) {
                        drop(msr); // Release lock before calling reconnect
                        Self::attempt_reconnect_msr_static(&msr_status, &api, &window).ok();
                    }
                }

                std::thread::sleep(Duration::from_secs(15));
            }
        });
    }

    #[allow(dead_code)]
    fn attempt_reconnect_all(&self) -> Result<(), String> {
        let api = HidApi::new().map_err(|e| format!("Failed to initialize HID API: {}", e))?;

        // Try to reconnect barcode scanner
        self.attempt_reconnect_barcode(&api)?;

        // Try to reconnect MSR reader
        self.attempt_reconnect_msr(&api)?;

        Ok(())
    }

    // Generic helper for device reconnection
    fn attempt_reconnect_device<F, L>(
        status: &Arc<Mutex<DeviceStatus>>,
        api: &HidApi,
        window: &Arc<Mutex<Option<WebviewWindow>>>,
        device_kind: &str,
        open_fn: F,
        listen_fn: L,
    ) -> Result<(), String>
    where
        F: Fn(&HidApi) -> Option<hidapi::HidDevice>,
        L: Fn(hidapi::HidDevice, WebviewWindow),
    {
        let mut device_status = status.lock().unwrap();

        if matches!(device_status.state, DeviceConnectionState::Connected) {
            return Ok(()); // Already connected
        }

        match open_fn(api) {
            Some(device) => {
                device_status.state = DeviceConnectionState::Connected;
                device_status.last_seen = Some(Instant::now());
                device_status.error_count = 0;
                device_status.last_error = None;

                if let Some(window_ref) = window.lock().unwrap().as_ref() {
                    window_ref
                        .emit(
                            "device-status",
                            serde_json::json!({
                                "device": device_kind,
                                "status": "connected"
                            }),
                        )
                        .ok();

                    // Start listening on the new device
                    listen_fn(device, window_ref.clone());
                }
                Ok(())
            }
            None => {
                let error_msg = format!("No compatible {} found", device_kind);
                device_status.state = DeviceConnectionState::Disconnected;
                device_status.error_count += 1;
                device_status.last_error = Some(error_msg.clone());
                Err(error_msg)
            }
        }
    }

    fn attempt_reconnect_barcode_static(
        barcode_status: &Arc<Mutex<DeviceStatus>>,
        api: &HidApi,
        window: &Arc<Mutex<Option<WebviewWindow>>>,
    ) -> Result<(), String> {
        Self::attempt_reconnect_device(
            barcode_status,
            api,
            window,
            "barcode",
            open_symbol_scanner,
            listen_to_barcode,
        )
    }

    fn attempt_reconnect_msr_static(
        msr_status: &Arc<Mutex<DeviceStatus>>,
        api: &HidApi,
        window: &Arc<Mutex<Option<WebviewWindow>>>,
    ) -> Result<(), String> {
        Self::attempt_reconnect_device(
            msr_status,
            api,
            window,
            "msr",
            open_magtek_reader,
            listen_to_magtek,
        )
    }

    fn attempt_reconnect_barcode(&self, api: &HidApi) -> Result<(), String> {
        Self::attempt_reconnect_device(
            &self.barcode_status,
            api,
            &self.window,
            "barcode",
            open_symbol_scanner,
            listen_to_barcode,
        )
    }

    fn attempt_reconnect_msr(&self, api: &HidApi) -> Result<(), String> {
        Self::attempt_reconnect_device(
            &self.msr_status,
            api,
            &self.window,
            "msr",
            open_magtek_reader,
            listen_to_magtek,
        )
    }

    pub fn start_initial_connection(&self) -> Result<(), String> {
        let api = HidApi::new().map_err(|e| format!("Failed to initialize HID API: {}", e))?;

        // Try to connect barcode scanner (don't fail if not found)
        self.attempt_reconnect_barcode(&api).ok();

        // Try to connect MSR reader (don't fail if not found)
        self.attempt_reconnect_msr(&api).ok();

        // Start monitoring for disconnections
        self.start_device_monitoring();

        // Start USB device hot-plug monitoring
        self.start_usb_hotplug_monitoring();

        Ok(())
    }

    pub fn mark_device_error(&self, device_type: &str, error: String) {
        match device_type {
            "barcode" => {
                let mut status = self.barcode_status.lock().unwrap();
                status.state = DeviceConnectionState::Error(error.clone());
                status.error_count += 1;
                status.last_error = Some(error);
            }
            "msr" => {
                let mut status = self.msr_status.lock().unwrap();
                status.state = DeviceConnectionState::Error(error.clone());
                status.error_count += 1;
                status.last_error = Some(error);
            }
            _ => warn!("Unknown device type for error marking: {}", device_type),
        }
    }

    #[cfg(target_os = "linux")]
    fn start_usb_hotplug_monitoring(&self) {
        let barcode_status = Arc::clone(&self.barcode_status);
        let msr_status = Arc::clone(&self.msr_status);
        let window = Arc::clone(&self.window);

        thread::spawn(move || {
            Self::efficient_polling_monitoring(barcode_status, msr_status, window);
        });
    }

    #[cfg(target_os = "linux")]
    fn efficient_polling_monitoring(
        barcode_status: Arc<Mutex<DeviceStatus>>,
        msr_status: Arc<Mutex<DeviceStatus>>,
        window: Arc<Mutex<Option<WebviewWindow>>>,
    ) {
        let mut last_devices = std::collections::HashSet::new();
        let mut last_check = Instant::now();

        loop {
            let now = Instant::now();

            // Only check every 500ms for hot-plug detection (faster than regular monitoring)
            if now.duration_since(last_check) >= Duration::from_millis(500) {
                last_check = now;

                // Get current HID devices
                let current_devices = match HidApi::new() {
                    Ok(api) => {
                        api.device_list()
                            .map(|d| (d.vendor_id(), d.product_id()))
                            .collect::<std::collections::HashSet<_>>()
                    }
                    Err(_) => {
                        std::collections::HashSet::new()
                    }
                };

                // Check for new devices
                for (vendor_id, product_id) in &current_devices {
                    if !last_devices.contains(&(*vendor_id, *product_id)) {

                        // Check if this matches our target devices
                        let is_barcode = *vendor_id == 0x05e0 ||
                                       Self::is_barcode_device(*vendor_id, *product_id);
                        let is_msr = *vendor_id == 0x0801 ||
                                   Self::is_msr_device(*vendor_id, *product_id);

                        if is_barcode || is_msr {
                            // Give the device a moment to be ready
                            std::thread::sleep(Duration::from_millis(200));

                            // Try to connect immediately
                            if let Ok(api) = HidApi::new() {
                                if is_barcode {
                                    let _ = Self::attempt_reconnect_barcode_static(&barcode_status, &api, &window);
                                }
                                if is_msr {
                                    let _ = Self::attempt_reconnect_msr_static(&msr_status, &api, &window);
                                }
                            }
                        }
                    }
                }

                // Check for removed devices
                for (vendor_id, product_id) in &last_devices {
                    if !current_devices.contains(&(*vendor_id, *product_id)) {

                        // Mark as disconnected if it was one of our target devices
                        let is_barcode = *vendor_id == 0x05e0 ||
                                       Self::is_barcode_device(*vendor_id, *product_id);
                        let is_msr = *vendor_id == 0x0801 ||
                                   Self::is_msr_device(*vendor_id, *product_id);

                        if is_barcode {
                            let mut status = barcode_status.lock().unwrap();
                            status.state = DeviceConnectionState::Disconnected;
                            if let Some(window) = window.lock().unwrap().as_ref() {
                                window.emit("device-status", serde_json::json!({
                                    "device": "barcode",
                                    "status": "disconnected"
                                })).ok();
                            }
                        }
                        if is_msr {
                            let mut status = msr_status.lock().unwrap();
                            status.state = DeviceConnectionState::Disconnected;
                            if let Some(window) = window.lock().unwrap().as_ref() {
                                window.emit("device-status", serde_json::json!({
                                    "device": "msr",
                                    "status": "disconnected"
                                })).ok();
                            }
                        }
                    }
                }

                last_devices = current_devices;
            }

            // Small sleep to prevent busy waiting
            std::thread::sleep(Duration::from_millis(50));
        }
    }


    #[cfg(not(target_os = "linux"))]
    fn start_usb_hotplug_monitoring(&self) {
        // On non-Linux systems, we rely on the periodic monitoring
        log::info!("USB hot-plug monitoring not implemented for this platform, using periodic monitoring");
    }

    #[allow(dead_code)]
    pub(crate) fn is_barcode_device(vendor_id: u16, product_id: u16) -> bool {
        // Add more barcode scanner vendor/product IDs as needed
        vendor_id == 0x05e0 || // Symbol/Zebra
        (vendor_id == 0x0acd && product_id == 0x2030) || // Honeywell
        (vendor_id == 0x05f9 && product_id == 0x220a)    // Datalogic
    }

    #[allow(dead_code)]
    pub(crate) fn is_msr_device(vendor_id: u16, product_id: u16) -> bool {
        // Add more MSR reader vendor/product IDs as needed
        vendor_id == 0x0801 || // MagTek
        (vendor_id == 0x0bda && product_id == 0x0161) || // Realtek
        (vendor_id == 0x1a86 && product_id == 0x7523)    // CH340
    }
}

#[cfg(test)]
mod tests {
    use super::HIDManager;

    #[test]
    fn is_barcode_device_unit_symbol() {
        assert!(HIDManager::is_barcode_device(0x05e0, 0));
    }

    #[test]
    fn is_barcode_device_unit_honeywell() {
        assert!(HIDManager::is_barcode_device(0x0acd, 0x2030));
    }

    #[test]
    fn is_barcode_device_unit_datalogic() {
        assert!(HIDManager::is_barcode_device(0x05f9, 0x220a));
    }

    #[test]
    fn is_barcode_device_unit_unknown_false() {
        assert!(!HIDManager::is_barcode_device(0x1234, 0x5678));
    }

    #[test]
    fn is_msr_device_unit_magtek() {
        assert!(HIDManager::is_msr_device(0x0801, 0));
    }

    #[test]
    fn is_msr_device_unit_realtek() {
        assert!(HIDManager::is_msr_device(0x0bda, 0x0161));
    }

    #[test]
    fn is_msr_device_unit_ch340() {
        assert!(HIDManager::is_msr_device(0x1a86, 0x7523));
    }

    #[test]
    fn is_msr_device_unit_unknown_false() {
        assert!(!HIDManager::is_msr_device(0x9999, 0x9999));
    }
}

impl Default for HIDManager {
    fn default() -> Self {
        Self::new()
    }
}
