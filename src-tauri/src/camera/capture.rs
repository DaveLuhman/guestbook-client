use std::sync::{Arc, Mutex};
use std::process::Command;
use crossbeam_channel::{bounded, Receiver, Sender};
use log;

#[allow(dead_code)]
pub struct Frame {
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub format: FrameFormat,
    pub seq: u64,
}

#[derive(Debug, Clone, Copy)]
#[allow(dead_code)]
pub enum FrameFormat {
    Rgb888,
    Yuv420,
    Jpeg,
}

#[allow(dead_code)]
pub struct CameraCapture {
    main_width: u32,
    main_height: u32,
    preview_width: u32,
    preview_height: u32,
    process: Option<std::process::Child>,
    main_frame_rx: Receiver<Frame>,
    preview_frame_rx: Receiver<Frame>,
    _main_frame_tx: Sender<Frame>,
    _preview_frame_tx: Sender<Frame>,
    running: Arc<Mutex<bool>>,
    seq_counter: Arc<Mutex<u64>>,
}

impl CameraCapture {
    pub fn new(
        main_width: u32,
        main_height: u32,
        preview_width: u32,
        preview_height: u32,
    ) -> Result<Self, String> {
        Self::new_with_handle(main_width, main_height, preview_width, preview_height, None)
    }

    pub fn new_with_handle(
        main_width: u32,
        main_height: u32,
        preview_width: u32,
        preview_height: u32,
        runtime_handle: Option<tokio::runtime::Handle>,
    ) -> Result<Self, String> {
        log::info!(
            "Initializing camera capture: main={}x{}, preview={}x{}",
            main_width,
            main_height,
            preview_width,
            preview_height
        );

        // Check if rpicam-vid is available
        let rpicam_check = Command::new("rpicam-vid")
            .arg("--help")
            .output();

        if rpicam_check.is_err() {
            return Err("rpicam-vid not found. Please install libcamera-apps package.".to_string());
        }

        // Create bounded channels for frames (capacity: 1 for latest-frame-only)
        let (main_tx, main_rx) = bounded::<Frame>(1);
        let (preview_tx, preview_rx) = bounded::<Frame>(1);

        let running = Arc::new(Mutex::new(true));
        let seq_counter = Arc::new(Mutex::new(0u64));

        // Spawn rpicam-vid process with MJPEG output
        let process = Self::spawn_capture_process(
            main_width,
            main_height,
            preview_width,
            preview_height,
            main_tx.clone(),
            preview_tx.clone(),
            running.clone(),
            seq_counter.clone(),
            runtime_handle,
        )?;

        Ok(Self {
            main_width,
            main_height,
            preview_width,
            preview_height,
            process: Some(process),
            main_frame_rx: main_rx,
            preview_frame_rx: preview_rx,
            _main_frame_tx: main_tx,
            _preview_frame_tx: preview_tx,
            running,
            seq_counter,
        })
    }

    fn spawn_capture_process(
        main_w: u32,
        main_h: u32,
        preview_w: u32,
        preview_h: u32,
        main_tx: Sender<Frame>,
        preview_tx: Sender<Frame>,
        running: Arc<Mutex<bool>>,
        seq_counter: Arc<Mutex<u64>>,
        runtime_handle: Option<tokio::runtime::Handle>,
    ) -> Result<std::process::Child, String> {
        // Use rpicam-vid with MJPEG output to stdout
        // We'll parse the MJPEG stream to extract individual frames
        use std::process::{Command as StdCommand, Stdio};
        let mut cmd = StdCommand::new("rpicam-vid");
        cmd.args(&[
            "--width", &main_w.to_string(),
            "--height", &main_h.to_string(),
            "--codec", "mjpeg",
            "--timeout", "0",  // Run indefinitely
            "--inline",  // Output to stdout
            "--output", "-",
            "--nopreview",
        ]);

        let mut child = cmd
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn rpicam-vid: {}", e))?;

        // Spawn background task to parse MJPEG stream
        let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

        let main_tx_clone = main_tx.clone();
        let preview_tx_clone = preview_tx.clone();
        let running_clone = running.clone();
        let seq_counter_clone = seq_counter.clone();

        // Get the Tokio runtime handle - use provided handle or try to get current one
        let handle = runtime_handle
            .or_else(|| tokio::runtime::Handle::try_current().ok())
            .ok_or_else(|| "No Tokio runtime available. Camera capture must be started from an async context.")?;

        handle.spawn(async move {
            use tokio::io::AsyncReadExt;
            let mut reader = tokio::io::BufReader::new(tokio::process::ChildStdout::from_std(stdout).map_err(|e| {
                log::error!("Failed to convert stdout: {}", e);
            }).unwrap());
            let mut buffer = vec![0u8; 4096];
            let mut frame_buffer = Vec::new();
            let mut in_frame = false;
            let mut skip_preview_counter = 0u32;

            loop {
                // Check if we should stop
                if !*running_clone.lock().unwrap() {
                    break;
                }

                // Read chunk
                match reader.read(&mut buffer).await {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let chunk = &buffer[..n];

                        // Parse MJPEG stream
                        // MJPEG frames are delimited by JPEG markers (0xFF 0xD8 start, 0xFF 0xD9 end)
                        for &byte in chunk {
                            if !in_frame {
                                frame_buffer.clear();
                                if byte == 0xFF {
                                    frame_buffer.push(byte);
                                    in_frame = true;
                                }
                            } else {
                                frame_buffer.push(byte);

                                // Check for JPEG end marker
                                if frame_buffer.len() >= 2 {
                                    let len = frame_buffer.len();
                                    if frame_buffer[len - 2] == 0xFF && frame_buffer[len - 1] == 0xD9 {
                                        // Complete JPEG frame
                                        let seq = {
                                            let mut counter = seq_counter_clone.lock().unwrap();
                                            *counter += 1;
                                            *counter
                                        };

                                        // Create main frame
                                        let main_frame = Frame {
                                            data: frame_buffer.clone(),
                                            width: main_w,
                                            height: main_h,
                                            format: FrameFormat::Jpeg,
                                            seq,
                                        };

                                        // Send main frame (drop if channel full - latest-frame-only)
                                        let _ = main_tx_clone.try_send(main_frame);

                                        // Send preview frame every other frame
                                        skip_preview_counter += 1;
                                        if skip_preview_counter % 2 == 0 {
                                            // Downscale for preview (simplified - in production would use proper scaling)
                                            let preview_frame = Frame {
                                                data: frame_buffer.clone(), // Will be scaled in preview manager
                                                width: preview_w,
                                                height: preview_h,
                                                format: FrameFormat::Jpeg,
                                                seq,
                                            };

                                            // Send preview frame (drop if channel full)
                                            let _ = preview_tx_clone.try_send(preview_frame);
                                        }

                                        frame_buffer.clear();
                                        in_frame = false;
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Error reading from rpicam-vid: {}", e);
                        break;
                    }
                }
            }
        });

        // Spawn error reader
        handle.spawn(async move {
            use tokio::io::AsyncBufReadExt;
            let mut reader = tokio::io::BufReader::new(tokio::process::ChildStderr::from_std(stderr).map_err(|e| {
                log::error!("Failed to convert stderr: {}", e);
            }).unwrap());
            let mut line = String::new();
            while reader.read_line(&mut line).await.is_ok() {
                if !line.trim().is_empty() {
                    log::warn!("[rpicam-vid] {}", line.trim());
                }
                line.clear();
            }
        });

        Ok(child)
    }

    pub fn get_main_frame(&self) -> Option<Frame> {
        self.main_frame_rx.try_recv().ok()
    }

    pub fn get_preview_frame(&self) -> Option<Frame> {
        self.preview_frame_rx.try_recv().ok()
    }

    pub fn stop(&mut self) -> Result<(), String> {
        log::info!("Stopping camera capture...");

        *self.running.lock().unwrap() = false;

        if let Some(mut process) = self.process.take() {
            process.kill().map_err(|e| format!("Failed to kill rpicam-vid: {}", e))?;
            let _ = process.wait();
            log::info!("Camera capture process stopped");
        }

        Ok(())
    }
}

impl Drop for CameraCapture {
    fn drop(&mut self) {
        *self.running.lock().unwrap() = false;
        if let Some(mut process) = self.process.take() {
            let _ = process.kill();
            let _ = process.wait();
        }
    }
}
