# Camera Sidecar Service

This Python service provides barcode scanning capabilities for the Raspberry Pi Camera via HTTP API.

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

The service will start on `http://127.0.0.1:7313`

## API Endpoints

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

### POST /scan

Scan for a barcode using the camera.

**Request Body (optional):**
```json
{
  "timeoutMs": 5000
}
```

**Response (success):**
```json
{
  "success": true,
  "code": "1234567890"
}
```

**Response (no barcode found):**
```json
{
  "success": false,
  "code": null,
  "error": "No barcode detected"
}
```

**Response (error):**
```json
{
  "success": false,
  "code": null,
  "error": "Could not open camera"
}
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
