use crate::devices::barcode::{listen_to_barcode, open_symbol_scanner};
use crate::devices::magtek::{listen_to_magtek, open_magtek_reader};
use hidapi::HidApi;
use log::{info, warn, error, debug};
use serde_json::json;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Emitter, WebviewWindow};

#[cfg(target_os = "linux")]
use std::thread;


#[derive(Debug, Clone, PartialEq)]
pub enum DeviceConnectionState {
    Connected,
    Disconnected,
    Connecting,
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
    pub reconnect_interval: Duration,
    pub max_reconnect_attempts: u32,
}

impl HIDManager {
    pub fn new() -> Self {
        Self {
            barcode_status: Arc::new(Mutex::new(DeviceStatus::default())),
            msr_status: Arc::new(Mutex::new(DeviceStatus::default())),
            window: Arc::new(Mutex::new(None)),
            reconnect_interval: Duration::from_secs(5),
            max_reconnect_attempts: 10,
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
        let reconnect_interval = self.reconnect_interval;
        let max_attempts = self.max_reconnect_attempts;

        // Start monitoring thread
        std::thread::spawn(move || {
            info!("Starting HID device monitoring thread");
            let mut reconnect_count = 0u32;

            loop {
                // Check barcode scanner
                {
                    let mut barcode = barcode_status.lock().unwrap();
                    if !matches!(barcode.state, DeviceConnectionState::Connected) {
                        debug!("Barcode scanner not connected, attempting reconnection...");
                        barcode.state = DeviceConnectionState::Connecting;

                        if let Some(window) = window.lock().unwrap().as_ref() {
                            window.emit("device-status", serde_json::json!({
                                "device": "barcode",
                                "status": "connecting"
                            })).ok();
                        }
                    }
                }

                // Check MSR reader
                {
                    let mut msr = msr_status.lock().unwrap();
                    if !matches!(msr.state, DeviceConnectionState::Connected) {
                        debug!("MSR reader not connected, attempting reconnection...");
                        msr.state = DeviceConnectionState::Connecting;

                        if let Some(window) = window.lock().unwrap().as_ref() {
                            window.emit("device-status", serde_json::json!({
                                "device": "msr",
                                "status": "connecting"
                            })).ok();
                        }
                    }
                }

                // Attempt to reconnect devices
                let api = match HidApi::new() {
                    Ok(api) => api,
                    Err(e) => {
                        error!("Failed to initialize HID API for reconnection: {}", e);
                        std::thread::sleep(reconnect_interval);
                        continue;
                    }
                };

                // Try to reconnect barcode scanner
                let barcode_success = Self::attempt_reconnect_barcode_static(&barcode_status, &api, &window).is_ok();
                if barcode_success {
                    info!("Barcode scanner reconnected successfully");
                }

                // Try to reconnect MSR reader
                let msr_success = Self::attempt_reconnect_msr_static(&msr_status, &api, &window).is_ok();
                if msr_success {
                    info!("MSR reader reconnected successfully");
                }

                // Only count as failure if both devices fail AND we've been trying for a while
                if !barcode_success && !msr_success {
                    reconnect_count += 1;
                    if reconnect_count >= max_attempts {
                        error!("Max reconnection attempts reached for both devices, stopping monitoring");
                        break;
                    }
                } else {
                    reconnect_count = 0; // Reset on any successful reconnection
                }

                std::thread::sleep(reconnect_interval);
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

    fn attempt_reconnect_barcode_static(
        barcode_status: &Arc<Mutex<DeviceStatus>>,
        api: &HidApi,
        window: &Arc<Mutex<Option<WebviewWindow>>>,
    ) -> Result<(), String> {
        let mut barcode = barcode_status.lock().unwrap();

        if matches!(barcode.state, DeviceConnectionState::Connected) {
            return Ok(()); // Already connected
        }

        match open_symbol_scanner(api) {
            Some(device) => {
                info!("Barcode scanner reconnected successfully");
                barcode.state = DeviceConnectionState::Connected;
                barcode.last_seen = Some(Instant::now());
                barcode.error_count = 0;
                barcode.last_error = None;

                if let Some(window) = window.lock().unwrap().as_ref() {
                    window.emit("device-status", serde_json::json!({
                        "device": "barcode",
                        "status": "connected"
                    })).ok();

                    // Start listening on the new device
                    listen_to_barcode(device, window.clone());
                }
                Ok(())
            }
            None => {
                let error_msg = "No compatible barcode scanner found".to_string();
                barcode.state = DeviceConnectionState::Disconnected;
                barcode.error_count += 1;
                barcode.last_error = Some(error_msg.clone());
                Err(error_msg)
            }
        }
    }

    fn attempt_reconnect_msr_static(
        msr_status: &Arc<Mutex<DeviceStatus>>,
        api: &HidApi,
        window: &Arc<Mutex<Option<WebviewWindow>>>,
    ) -> Result<(), String> {
        let mut msr = msr_status.lock().unwrap();

        if matches!(msr.state, DeviceConnectionState::Connected) {
            return Ok(()); // Already connected
        }

        match open_magtek_reader(api) {
            Some(device) => {
                info!("MSR reader reconnected successfully");
                msr.state = DeviceConnectionState::Connected;
                msr.last_seen = Some(Instant::now());
                msr.error_count = 0;
                msr.last_error = None;

                if let Some(window) = window.lock().unwrap().as_ref() {
                    window.emit("device-status", serde_json::json!({
                        "device": "msr",
                        "status": "connected"
                    })).ok();

                    // Start listening on the new device
                    listen_to_magtek(device, window.clone());
                }
                Ok(())
            }
            None => {
                let error_msg = "No compatible MSR reader found".to_string();
                msr.state = DeviceConnectionState::Disconnected;
                msr.error_count += 1;
                msr.last_error = Some(error_msg.clone());
                Err(error_msg)
            }
        }
    }

    fn attempt_reconnect_barcode(&self, api: &HidApi) -> Result<(), String> {
        let mut barcode = self.barcode_status.lock().unwrap();

        if matches!(barcode.state, DeviceConnectionState::Connected) {
            return Ok(()); // Already connected
        }

        match open_symbol_scanner(api) {
            Some(device) => {
                info!("Barcode scanner reconnected successfully");
                barcode.state = DeviceConnectionState::Connected;
                barcode.last_seen = Some(Instant::now());
                barcode.error_count = 0;
                barcode.last_error = None;

                if let Some(window) = self.window.lock().unwrap().as_ref() {
                    window.emit("device-status", json!({
                        "device": "barcode",
                        "status": "connected"
                    })).ok();

                    // Start listening on the new device
                    listen_to_barcode(device, window.clone());
                }
                Ok(())
            }
            None => {
                let error_msg = "No compatible barcode scanner found".to_string();
                barcode.state = DeviceConnectionState::Disconnected;
                barcode.error_count += 1;
                barcode.last_error = Some(error_msg.clone());
                Err(error_msg)
            }
        }
    }

    fn attempt_reconnect_msr(&self, api: &HidApi) -> Result<(), String> {
        let mut msr = self.msr_status.lock().unwrap();

        if matches!(msr.state, DeviceConnectionState::Connected) {
            return Ok(()); // Already connected
        }

        match open_magtek_reader(api) {
            Some(device) => {
                info!("MSR reader reconnected successfully");
                msr.state = DeviceConnectionState::Connected;
                msr.last_seen = Some(Instant::now());
                msr.error_count = 0;
                msr.last_error = None;

                if let Some(window) = self.window.lock().unwrap().as_ref() {
                    window.emit("device-status", json!({
                        "device": "msr",
                        "status": "connected"
                    })).ok();

                    // Start listening on the new device
                    listen_to_magtek(device, window.clone());
                }
                Ok(())
            }
            None => {
                let error_msg = "No compatible MSR reader found".to_string();
                msr.state = DeviceConnectionState::Disconnected;
                msr.error_count += 1;
                msr.last_error = Some(error_msg.clone());
                Err(error_msg)
            }
        }
    }

    pub fn start_initial_connection(&self) -> Result<(), String> {
        let api = HidApi::new().map_err(|e| format!("Failed to initialize HID API: {}", e))?;

        // Try to connect barcode scanner (don't fail if not found)
        if let Err(e) = self.attempt_reconnect_barcode(&api) {
            warn!("Barcode scanner not available during startup: {}", e);
        }

        // Try to connect MSR reader (don't fail if not found)
        if let Err(e) = self.attempt_reconnect_msr(&api) {
            warn!("MSR reader not available during startup: {}", e);
        }

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
            info!("Starting USB hot-plug monitoring for Linux");
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
                    Err(e) => {
                        warn!("Failed to get HID device list for hot-plug monitoring: {}", e);
                        std::collections::HashSet::new()
                    }
                };

                // Check for new devices
                for (vendor_id, product_id) in &current_devices {
                    if !last_devices.contains(&(*vendor_id, *product_id)) {
                        info!("New HID device detected: VID:{:04X} PID:{:04X}", vendor_id, product_id);

                        // Check if this matches our target devices
                        let is_barcode = *vendor_id == 0x05e0 ||
                                       Self::is_barcode_device(*vendor_id, *product_id);
                        let is_msr = *vendor_id == 0x0801 ||
                                   Self::is_msr_device(*vendor_id, *product_id);

                        if is_barcode || is_msr {
                            info!("Target device detected, attempting immediate connection");

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
                        info!("HID device removed: VID:{:04X} PID:{:04X}", vendor_id, product_id);

                        // Mark as disconnected if it was one of our target devices
                        let is_barcode = *vendor_id == 0x05e0 ||
                                       Self::is_barcode_device(*vendor_id, *product_id);
                        let is_msr = *vendor_id == 0x0801 ||
                                   Self::is_msr_device(*vendor_id, *product_id);

                        if is_barcode {
                            let mut status = barcode_status.lock().unwrap();
                            status.state = DeviceConnectionState::Disconnected;
                            if let Some(window) = window.lock().unwrap().as_ref() {
                                window.emit("device-status", json!({
                                    "device": "barcode",
                                    "status": "disconnected"
                                })).ok();
                            }
                        }
                        if is_msr {
                            let mut status = msr_status.lock().unwrap();
                            status.state = DeviceConnectionState::Disconnected;
                            if let Some(window) = window.lock().unwrap().as_ref() {
                                window.emit("device-status", json!({
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
        info!("USB hot-plug monitoring not implemented for this platform, using periodic monitoring");
    }

    #[allow(dead_code)]
    fn is_barcode_device(vendor_id: u16, product_id: u16) -> bool {
        // Add more barcode scanner vendor/product IDs as needed
        vendor_id == 0x05e0 || // Symbol/Zebra
        (vendor_id == 0x0acd && product_id == 0x2030) || // Honeywell
        (vendor_id == 0x05f9 && product_id == 0x220a)    // Datalogic
    }

    #[allow(dead_code)]
    fn is_msr_device(vendor_id: u16, product_id: u16) -> bool {
        // Add more MSR reader vendor/product IDs as needed
        vendor_id == 0x0801 || // MagTek
        (vendor_id == 0x0bda && product_id == 0x0161) || // Realtek
        (vendor_id == 0x1a86 && product_id == 0x7523)    // CH340
    }
}

impl Default for HIDManager {
    fn default() -> Self {
        Self::new()
    }
}
