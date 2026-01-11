use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use log;
// Temporarily commented out until rxing API is verified
// use rxing::{BarcodeFormat, MultiFormatReader, Reader, BinaryBitmap};
// use rxing::common::HybridBinarizer;
// use rxing::RGBLuminanceSource;
use tauri::Emitter;
use crate::camera::capture::Frame;

#[allow(dead_code)]
pub struct BarcodeDecoder {
    width: u32,
    height: u32,
    roi_w: f64,
    roi_h: f64,
    scan_fps: f64,
    enabled: Arc<Mutex<bool>>,
    running: Arc<Mutex<bool>>,
    last_code: Arc<Mutex<Option<(String, Instant)>>>,
    dedupe_window: Duration,
    app_handle: Option<tauri::AppHandle>,
}

impl BarcodeDecoder {
    pub async fn new(
        width: u32,
        height: u32,
        roi_w: f64,
        roi_h: f64,
        scan_fps: f64,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<Self, String> {
        Ok(Self {
            width,
            height,
            roi_w,
            roi_h,
            scan_fps,
            enabled: Arc::new(Mutex::new(true)),
            running: Arc::new(Mutex::new(true)),
            last_code: Arc::new(Mutex::new(None)),
            dedupe_window: Duration::from_secs(2), // 2 second dedupe window
            app_handle,
        })
    }

    pub fn set_enabled(&self, enabled: bool) {
        *self.enabled.lock().unwrap() = enabled;
        log::info!("Barcode decoder {}", if enabled { "enabled" } else { "disabled" });
    }

    #[allow(dead_code)]
    pub async fn process_frame(&self, frame: Frame) -> Result<(), String> {
        // Check if enabled
        if !*self.enabled.lock().unwrap() {
            return Ok(());
        }

        // Decode JPEG to image
        let img = match image::load_from_memory(&frame.data) {
            Ok(img) => img,
            Err(e) => {
                log::debug!("Failed to decode JPEG frame: {}", e);
                return Ok(());
            }
        };

        // Apply ROI cropping
        let (roi_x, roi_y, roi_w, roi_h) = self.calculate_roi(img.width(), img.height());

        // Crop image to ROI
        let cropped = img.crop_imm(
            roi_x,
            roi_y,
            roi_w,
            roi_h,
        );

        // TODO: Fix RGBLuminanceSource construction - rxing 0.5 API needs verification
        // For now, barcode decoding is stubbed out to allow compilation
        // The actual API may require:
        // - RGBLuminanceSource::new(width, height, data)
        // - Or a builder pattern
        // - Or struct field initialization
        // Once the correct API is confirmed, uncomment and fix the code below:

        // Convert to RGB format for rxing (when API is fixed)
        let _rgb_img = cropped.to_rgb8();
        let _width = _rgb_img.width() as usize;
        let _height = _rgb_img.height() as usize;
        let _rgb_data = _rgb_img.as_raw().to_vec();

        log::debug!("Barcode decoding temporarily stubbed - rxing API needs verification");
        Ok(())
    }

    #[allow(dead_code)]
    fn calculate_roi(&self, img_w: u32, img_h: u32) -> (u32, u32, u32, u32) {
        let roi_w_px = (img_w as f64 * self.roi_w) as u32;
        let roi_h_px = (img_h as f64 * self.roi_h) as u32;
        let roi_x = (img_w - roi_w_px) / 2;
        let roi_y = (img_h - roi_h_px) / 2;
        (roi_x, roi_y, roi_w_px, roi_h_px)
    }

    #[allow(dead_code)]
    async fn handle_scan(&self, code: String) {
        // Deduplicate scans
        let now = Instant::now();
        {
            let mut last = self.last_code.lock().unwrap();
            if let Some((ref last_code, ref last_time)) = *last {
                if last_code == &code && now.duration_since(*last_time) < self.dedupe_window {
                    log::debug!("Ignoring duplicate scan: {} (dedupe)", code);
                    return;
                }
            }
            *last = Some((code.clone(), now));
        }

        log::info!("Barcode scan detected: {}", code);

        // Emit event to frontend
        if let Some(app) = &self.app_handle {
            let payload = serde_json::json!({
                "code": code,
                "symbology": "CODE39",
                "ts": std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as i64,
            });

            if let Err(e) = app.emit("camera:scan", payload) {
                log::error!("Failed to emit camera:scan event: {}", e);
            }
        }
    }

    pub async fn stop(&self) {
        *self.running.lock().unwrap() = false;
        log::info!("Barcode decoder stopped");
    }
}
