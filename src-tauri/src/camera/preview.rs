use std::sync::{Arc, Mutex};
use log;

#[allow(dead_code)]
pub struct PreviewManager {
    width: u32,
    height: u32,
    target_fps: f64,
    latest_frame: Arc<Mutex<Option<Vec<u8>>>>,
    enabled: Arc<Mutex<bool>>,
    running: Arc<Mutex<bool>>,
}

impl PreviewManager {
    pub fn new(width: u32, height: u32, target_fps: f64) -> Self {
        Self {
            width,
            height,
            target_fps,
            latest_frame: Arc::new(Mutex::new(None)),
            enabled: Arc::new(Mutex::new(false)),
            running: Arc::new(Mutex::new(true)),
        }
    }

    pub fn set_enabled(&self, enabled: bool) {
        *self.enabled.lock().unwrap() = enabled;
        log::info!("Preview manager {}", if enabled { "enabled" } else { "disabled" });
    }

    pub fn update_frame(&self, jpeg_data: Vec<u8>) {
        // Always update the latest frame - the enabled check is done in the manager's loop
        // This ensures frames are available when preview is enabled
        let mut frame = self.latest_frame.lock().unwrap();
        *frame = Some(jpeg_data);
    }

    pub fn get_latest_frame(&self) -> Option<Vec<u8>> {
        self.latest_frame.lock().unwrap().clone()
    }

    pub async fn stop(&self) {
        *self.running.lock().unwrap() = false;
        *self.latest_frame.lock().unwrap() = None;
        log::info!("Preview manager stopped");
    }
}
