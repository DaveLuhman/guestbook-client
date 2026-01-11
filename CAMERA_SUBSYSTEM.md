# Camera + Barcode Subsystem

This document describes the Rust-first camera and barcode scanning subsystem that replaces the external Python "camera sidecar" process.

## Architecture

The camera subsystem consists of three main components:

1. **Capture Subsystem** (`src-tauri/src/camera/capture.rs`)
   - Uses `rpicam-vid` subprocess to capture frames from Raspberry Pi IMX708 camera
   - Outputs MJPEG stream which is parsed to extract individual JPEG frames
   - Maintains separate channels for main (barcode detection) and preview frames
   - Uses bounded channels (capacity: 1) for latest-frame-only logic

2. **Preview Subsystem** (`src-tauri/src/camera/preview.rs`)
   - Stores only the latest preview frame as JPEG bytes
   - Provides frames to frontend via Tauri command `camera_get_preview_frame`
   - Can be enabled/disabled independently of scanning

3. **Barcode Decoder** (`src-tauri/src/camera/barcode.rs`)
   - Uses `rxing` crate (Rust port of ZXing) for Code 39 barcode detection
   - Applies ROI (Region of Interest) cropping for wide-angle lens support
   - Deduplicates scans within a 2-second window
   - Emits `camera:scan` events to frontend via Tauri events

## Configuration Profiles

The subsystem supports three lens profiles for IMX708:

- **60°**: Main 1920x1080, ROI disabled (1.0), scan_fps ~7
- **102°** (default): Main 2304x1296, ROI 0.70, scan_fps ~5
- **120°**: Main 2304x1296, ROI 0.60, scan_fps ~4

Profile selection:
- Set `IMX708_VARIANT` environment variable to `60`, `102`, or `120`
- Defaults to `102°` if not set

## Tauri Commands

- `camera_start(options?: CameraOptions)` - Start camera subsystem
- `camera_stop()` - Stop camera subsystem
- `camera_set_preview_enabled(enabled: boolean)` - Enable/disable preview
- `camera_set_scanning_enabled(enabled: boolean)` - Enable/disable scanning
- `camera_get_status()` - Get current camera status
- `camera_get_preview_frame()` - Get latest preview frame as JPEG bytes

## Frontend Integration

### Preview Display

The frontend updates preview frames by polling `camera_get_preview_frame` at ~8 FPS:

```typescript
setInterval(async () => {
  const frameData = await invoke<number[]>('camera_get_preview_frame');
  if (frameData) {
    const blob = new Blob([new Uint8Array(frameData)], { type: 'image/jpeg' });
    videoStream.src = URL.createObjectURL(blob);
  }
}, 125); // ~8 FPS
```

### Barcode Scan Events

Listen for `camera:scan` events:

```typescript
import { listen } from '@tauri-apps/api/event';

listen('camera:scan', (event) => {
  const scanData = event.payload;
  const code = scanData.code; // Barcode string
  // Handle scan...
});
```

## Running on Raspberry Pi

### Prerequisites

1. Install `libcamera-apps` package:
   ```bash
   sudo apt-get install libcamera-apps
   ```

2. Ensure `rpicam-vid` is available in PATH

3. Set lens variant (optional):
   ```bash
   export IMX708_VARIANT=102  # or 60, 120
   ```

### Startup

The camera subsystem starts automatically when the app launches. It will:
- Detect camera availability
- Start capture process
- Begin frame processing for preview and barcode detection

### Troubleshooting

**Camera not detected:**
- Check that camera is connected and recognized: `libcamera-hello --list-cameras`
- Verify `/dev/video*` devices exist
- Check camera permissions

**No preview frames:**
- Ensure preview is enabled: `camera_set_preview_enabled(true)`
- Check camera status: `camera_get_status()`
- Review logs for capture errors

**No barcode scans:**
- Ensure scanning is enabled: `camera_set_scanning_enabled(true)`
- Verify barcode is Code 39 format
- Check ROI settings match your lens (wider lenses need smaller ROI)
- Review logs for decode errors

**Performance issues:**
- Reduce preview FPS if UI is slow
- Adjust scan FPS based on profile
- Check CPU usage - may need to reduce frame rates

## Differences from Python Sidecar

- **No HTTP server**: Uses Tauri IPC instead of HTTP endpoints
- **Event-driven scans**: Pushes scans via events instead of long-polling
- **Integrated**: Runs in same process as main app, no separate process to manage
- **Rust-native**: No Python dependency, better performance and memory usage

## Future Improvements

- [ ] Use Rust libcamera bindings instead of subprocess (if available)
- [ ] Implement proper image downscaling for preview frames
- [ ] Add support for multiple barcode formats beyond Code 39
- [ ] Implement autofocus control
- [ ] Add frame rate adaptation based on system load
