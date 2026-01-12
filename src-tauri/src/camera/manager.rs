use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicU32, Ordering};
use serde::{Deserialize, Serialize};

use crate::camera::capture::CameraCapture;
use crate::camera::preview::PreviewManager;
use crate::camera::barcode::BarcodeDecoder;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CameraProfile {
    Profile60,
    Profile102,
    Profile120,
}

impl CameraProfile {
    pub fn from_env() -> Self {
        if let Ok(variant) = std::env::var("IMX708_VARIANT") {
            match variant.as_str() {
                "60" => Self::Profile60,
                "102" => Self::Profile102,
                "120" => Self::Profile120,
                _ => Self::Profile102, // Default
            }
        } else {
            Self::Profile102 // Default to 102°
        }
    }

    pub fn main_resolution(&self) -> (u32, u32) {
        match self {
            Self::Profile60 => (1920, 1080),
            Self::Profile102 => (2304, 1296),
            Self::Profile120 => (2304, 1296),
        }
    }

    pub fn roi_scale(&self) -> f64 {
        match self {
            Self::Profile60 => 1.0,  // No ROI needed
            Self::Profile102 => 0.70,
            Self::Profile120 => 0.60,
        }
    }

    pub fn scan_fps(&self) -> f64 {
        match self {
            Self::Profile60 => 7.0,
            Self::Profile102 => 5.0,
            Self::Profile120 => 4.0,
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            Self::Profile60 => "60°",
            Self::Profile102 => "102°",
            Self::Profile120 => "120°",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraOptions {
    pub preview_fps: Option<f64>,
    pub scan_fps: Option<f64>,
    pub roi_w: Option<f64>,
    pub roi_h: Option<f64>,
}

impl Default for CameraOptions {
    fn default() -> Self {
        Self {
            preview_fps: Some(8.0),
            scan_fps: None, // Will use profile default
            roi_w: None,    // Will use profile default
            roi_h: None,    // Will use profile default
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraStatus {
    pub running: bool,
    pub preview_enabled: bool,
    pub scanning_enabled: bool,
    pub active_profile: String,
    pub last_error: Option<String>,
}

pub struct CameraManager {
    capture: Arc<Mutex<Option<CameraCapture>>>,
    preview: Arc<Mutex<Option<PreviewManager>>>,
    decoder: Arc<Mutex<Option<BarcodeDecoder>>>,
    profile: CameraProfile,
    preview_enabled: Arc<Mutex<bool>>,
    scanning_enabled: Arc<Mutex<bool>>,
    last_error: Arc<Mutex<Option<String>>>,
    app_handle: Option<tauri::AppHandle>,
}

impl CameraManager {
    pub fn new() -> Self {
        Self {
            capture: Arc::new(Mutex::new(None)),
            preview: Arc::new(Mutex::new(None)),
            decoder: Arc::new(Mutex::new(None)),
            profile: CameraProfile::from_env(),
            preview_enabled: Arc::new(Mutex::new(false)),
            scanning_enabled: Arc::new(Mutex::new(true)),
            last_error: Arc::new(Mutex::new(None)),
            app_handle: None,
        }
    }

    pub fn set_app_handle(&mut self, app: tauri::AppHandle) {
        self.app_handle = Some(app);
    }

    pub fn start(&self, options: Option<CameraOptions>) -> Result<(), String> {
        // Extract values we need before any locking to avoid holding guard across await
        let options = options.unwrap_or_default();
        let profile = self.profile;

        // Determine effective settings
        let preview_fps = options.preview_fps.unwrap_or(8.0);
        let scan_fps = options.scan_fps.unwrap_or(profile.scan_fps());
        let roi_scale = options.roi_w.unwrap_or(profile.roi_scale());
        let roi_h = options.roi_h.unwrap_or(roi_scale);

        let (main_w, main_h) = profile.main_resolution();
        let preview_w = 640u32;
        let preview_h = 360u32;

        log::info!(
            "Starting camera with profile {}: main={}x{}, preview={}x{}, scan_fps={:.1}, roi={:.2}",
            profile.name(),
            main_w,
            main_h,
            preview_w,
            preview_h,
            scan_fps,
            roi_scale
        );

        // Extract app_handle before any operations
        let app_handle_clone = self.app_handle.as_ref().map(|h| h.clone());

        // Get the runtime handle for passing to CameraCapture
        // Since start() might be called from async context, try to get current handle
        let runtime_handle = tokio::runtime::Handle::try_current()
            .map_err(|_| {
                log::warn!("No Tokio runtime handle available in start() - camera capture may fail");
            })
            .ok();

        // Start capture subsystem (synchronous)
        let capture = CameraCapture::new_with_handle(main_w, main_h, preview_w, preview_h, runtime_handle)
            .map_err(|e| {
                let err_msg = format!("Failed to start camera capture: {}", e);
                {
                    *self.last_error.lock().unwrap() = Some(err_msg.clone());
                }
                err_msg
            })?;

        // Start preview subsystem
        let preview = PreviewManager::new(preview_w, preview_h, preview_fps);

        // Start barcode decoder (BarcodeDecoder::new is async, use blocking runtime)
        let decoder = tokio::runtime::Handle::current().block_on(BarcodeDecoder::new(
            main_w,
            main_h,
            roi_scale,
            roi_h,
            scan_fps,
            app_handle_clone,
        ))
        .map_err(|e| {
            let err_msg = format!("Failed to start barcode decoder: {}", e);
            {
                *self.last_error.lock().unwrap() = Some(err_msg.clone());
            }
            err_msg
        })?;

        // Store references (drop lock before spawning tasks)
        {
            *self.capture.lock().unwrap() = Some(capture);
            *self.preview.lock().unwrap() = Some(preview);
            *self.decoder.lock().unwrap() = Some(decoder);
        }

        // Spawn background tasks to process frames (clone Arcs before spawning)
        let capture_ref = self.capture.clone();
        let preview_ref = self.preview.clone();
        let decoder_ref = self.decoder.clone();
        let preview_enabled_ref = self.preview_enabled.clone();
        let scanning_enabled_ref = self.scanning_enabled.clone();

        // Process main frames for barcode decoding
        let capture_ref2 = capture_ref.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs_f64(1.0 / scan_fps));
            loop {
                interval.tick().await;

                let scanning_enabled = *scanning_enabled_ref.lock().unwrap();
                if !scanning_enabled {
                    continue;
                }

                // Get frame data (clone to avoid holding MutexGuard across await)
                let frame_data = {
                    let capture_guard = capture_ref2.lock().unwrap();
                    if let Some(capture) = capture_guard.as_ref() {
                        capture.get_main_frame().map(|f| f.data.clone())
                    } else {
                        None
                    }
                };

                if let Some(frame_data) = frame_data {
                    // TODO: Fix barcode processing - need to restructure to avoid Send issues
                    // The issue is that process_frame requires &self but we can't hold MutexGuard across await
                    // Options:
                    // 1. Use a channel to send frames to a dedicated decoder task
                    // 2. Restructure process_frame to take needed data as parameters
                    // 3. Use spawn_blocking with block_on
                    // For now, just log that we're receiving frames
                    log::debug!("Frame received for barcode processing ({} bytes) - processing disabled due to Send safety", frame_data.len());
                }
            }
        });

        // Process preview frames
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs_f64(1.0 / preview_fps));
            loop {
                interval.tick().await;

                if !*preview_enabled_ref.lock().unwrap() {
                    continue;
                }

                let frame_data = {
                    let capture_guard = capture_ref.lock().unwrap();
                    if let Some(capture) = capture_guard.as_ref() {
                        capture.get_preview_frame().map(|f| f.data)
                    } else {
                        None
                    }
                };

                if let Some(data) = frame_data {
                    let data_len = data.len();
                    let preview_guard = preview_ref.lock().unwrap();
                    if let Some(preview) = preview_guard.as_ref() {
                        preview.update_frame(data);
                        log::debug!("Updated preview frame ({} bytes)", data_len);
                    }
                } else {
                    // Log occasionally when no frames are available
                    static FRAME_MISS_COUNT: AtomicU32 = AtomicU32::new(0);
                    let count = FRAME_MISS_COUNT.fetch_add(1, Ordering::Relaxed);
                    if count % 30 == 0 { // Log every 30 misses (~4 seconds at 8 FPS)
                        log::debug!("No preview frames available from capture (miss count: {})", count);
                    }
                }
            }
        });

        // Clear any previous errors (drop lock before returning)
        {
            *self.last_error.lock().unwrap() = None;
        }

        log::info!("Camera started successfully");
        Ok(())
    }

    pub fn stop(&self) -> Result<(), String> {
        log::info!("Stopping camera...");

        // Extract decoders/preview/capture from locks
        let decoder = self.decoder.lock().unwrap().take();
        let preview = self.preview.lock().unwrap().take();
        let capture = self.capture.lock().unwrap().take();

        // Stop decoder first (async - use blocking runtime)
        if let Some(decoder) = decoder {
            tokio::runtime::Handle::current().block_on(decoder.stop());
        }

        // Stop preview (async - use blocking runtime)
        if let Some(preview) = preview {
            tokio::runtime::Handle::current().block_on(preview.stop());
        }

        // Stop capture last (synchronous)
        if let Some(mut capture) = capture {
            capture.stop().map_err(|e| {
                format!("Error stopping camera capture: {}", e)
            })?;
        }

        log::info!("Camera stopped");
        Ok(())
    }

    pub fn set_preview_enabled(&self, enabled: bool) -> Result<(), String> {
        *self.preview_enabled.lock().unwrap() = enabled;

        if let Some(preview) = self.preview.lock().unwrap().as_ref() {
            preview.set_enabled(enabled);
        }

        log::info!("Preview {}", if enabled { "enabled" } else { "disabled" });
        Ok(())
    }

    pub fn set_scanning_enabled(&self, enabled: bool) -> Result<(), String> {
        *self.scanning_enabled.lock().unwrap() = enabled;

        if let Some(decoder) = self.decoder.lock().unwrap().as_ref() {
            decoder.set_enabled(enabled);
        }

        log::info!("Scanning {}", if enabled { "enabled" } else { "disabled" });
        Ok(())
    }

    pub fn get_status(&self) -> CameraStatus {
        let running = self.capture.lock().unwrap().is_some();
        let preview_enabled = *self.preview_enabled.lock().unwrap();
        let scanning_enabled = *self.scanning_enabled.lock().unwrap();
        let last_error = self.last_error.lock().unwrap().clone();

        CameraStatus {
            running,
            preview_enabled,
            scanning_enabled,
            active_profile: self.profile.name().to_string(),
            last_error,
        }
    }

    pub fn get_latest_preview_frame(&self) -> Option<Vec<u8>> {
        self.preview.lock().unwrap()
            .as_ref()
            .and_then(|p| p.get_latest_frame())
    }
}

impl Default for CameraManager {
    fn default() -> Self {
        Self::new()
    }
}
