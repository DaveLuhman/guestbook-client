# Camera Sidecar Service

This Python service continuously captures frames from the Raspberry Pi Camera and decodes barcodes, streaming new scans to clients via long-polling HTTP endpoints.

## Installation

Install Python dependencies:

```bash
pip3 install -r requirements.txt
```

Or install manually:

```bash
pip3 install flask opencv-python pyzbar
```

## Running

Start the service:

```bash
python3 sidecar/camera_sidecar.py
```

The service will start on `http://127.0.0.1:7313` and begin continuously capturing frames from the camera at ~10 FPS.

## Architecture

The service runs a background thread that:
- Opens the camera once on startup
- Continuously captures frames at ~5-15 FPS (configurable)
- Decodes barcodes from each frame using pyzbar
- Queues new scans with debouncing to avoid duplicates
- Streams scans to clients via long-polling HTTP endpoints

## API Endpoints

### GET /health

Health check endpoint. Returns the status of the camera service.

**Response (ok):**
```json
{
  "status": "ok"
}
```

**Response (error):**
```json
{
  "status": "error",
  "error": "Could not open camera"
}
```

### GET /next_scan

Long-polling endpoint to receive the next barcode scan. This is the primary endpoint for continuous scanning.

**Query Parameters:**
- `since_id` (int, optional): The last scan ID the client has seen. Only returns scans with id > since_id.

**Behavior:**
- If a new scan is available (id > since_id), returns immediately
- Otherwise, waits up to 8 seconds for a new scan (long-polling)
- Automatically handles debouncing - duplicate scans within 800ms are filtered out

**Response (new scan):**
```json
{
  "success": true,
  "id": 123,
  "code": "^1234567^",
  "timestamp": "2025-01-01T00:00:00Z"
}
```

**Response (timeout - no new scan):**
```json
{
  "success": false,
  "id": 122,
  "code": null,
  "timeout": true
}
```

**Response (error):**
```json
{
  "success": false,
  "code": null,
  "error": "Could not read from camera"
}
```

## Usage Example

The TypeScript frontend uses this service via `startScanStream()` which continuously polls `/next_scan`:

```typescript
import { startScanStream } from './cameraSidecarClient';

const stopStream = startScanStream((scan) => {
  console.log('Barcode detected:', scan.code);
  // Process the scan...
});
```

## Systemd Service

To run as a systemd service, copy `camera_sidecar.service.example` to `/etc/systemd/system/camera_sidecar.service` and update the paths:

```bash
sudo cp sidecar/camera_sidecar.service.example /etc/systemd/system/camera_sidecar.service
sudo nano /etc/systemd/system/camera_sidecar.service
sudo systemctl daemon-reload
sudo systemctl enable camera_sidecar.service
sudo systemctl start camera_sidecar.service
```

Check status:
```bash
sudo systemctl status camera_sidecar.service
```

View logs:
```bash
sudo journalctl -u camera_sidecar.service -f
```
