#!/usr/bin/env python3
"""
Camera Sidecar Service for Raspberry Pi Camera Barcode Scanning

This service continuously captures frames from the Pi Camera and decodes barcodes,
streaming new scans to clients via long-polling HTTP endpoints.

Usage:
    python3 sidecar/camera_sidecar.py

The service will start on http://127.0.0.1:7313

For systemd service, see sidecar/camera_sidecar.service.example
"""

import cv2
import json
import time
import threading
from datetime import datetime, timezone
from flask import Flask, jsonify, request
from pyzbar import pyzbar

app = Flask(__name__)

# Configuration
# Try different camera device paths for Pi Camera
CAMERA_DEVICES = ['/dev/video0', '/dev/video1', 0]  # Try V4L2 paths first, then index
DEFAULT_RESOLUTION = (1280, 720)
FRAME_CAPTURE_INTERVAL = 0.1  # ~10 FPS (100ms between frames)
NEXT_SCAN_TIMEOUT = 8.0  # Long-poll timeout in seconds
DEBOUNCE_MS = 800  # Ignore duplicate scans within this window (ms)
CAMERA_WARMUP_FRAMES = 5  # Read a few frames to initialize camera before scanning

# Shared state for scan queue
scan_lock = threading.Lock()
latest_scan_id = 0
latest_scan = None
camera_error = None

# Camera capture thread control
camera_thread = None
camera_running = False
camera_cap = None


def open_camera():
    """
    Try to open the camera using V4L2 backend.
    Attempts multiple device paths/indices to find a working camera.
    """
    for device in CAMERA_DEVICES:
        try:
            print(f"Attempting to open camera device: {device}")

            # Try V4L2 backend explicitly for Pi Camera
            if isinstance(device, str) and device.startswith('/dev/video'):
                # Use V4L2 backend for device path
                cap = cv2.VideoCapture(device, cv2.CAP_V4L2)
            else:
                # For numeric indices, try V4L2 backend first
                cap = cv2.VideoCapture(device, cv2.CAP_V4L2)

            if not cap.isOpened():
                print(f"  Failed to open {device}, trying next...")
                continue

            # Set buffer size to reduce latency
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

            # Set resolution
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, DEFAULT_RESOLUTION[0])
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, DEFAULT_RESOLUTION[1])

            # Try reading a frame to verify it works
            ret, _ = cap.read()
            if ret:
                print(f"  Successfully opened camera at {device}")
                return cap
            else:
                print(f"  Camera opened but failed to read frame from {device}")
                cap.release()
        except Exception as e:
            print(f"  Exception opening {device}: {e}")
            if 'cap' in locals():
                cap.release()
            continue

    return None


def capture_loop():
    """
    Continuously captures frames from the camera and decodes barcodes.
    Runs in a background thread.
    """
    global latest_scan_id, latest_scan, camera_error, camera_cap, camera_running

    print("Starting camera capture loop...")

    try:
        # Open camera with V4L2 backend
        camera_cap = open_camera()

        if camera_cap is None:
            with scan_lock:
                camera_error = "Could not open camera - tried all available devices"
            print(f"ERROR: {camera_error}")
            return

        # Get actual resolution
        actual_width = int(camera_cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_height = int(camera_cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        print(f"Camera opened successfully at {actual_width}x{actual_height}")

        # Warm up: read a few frames to initialize the camera
        print("Warming up camera...")
        warmup_failures = 0
        for i in range(CAMERA_WARMUP_FRAMES):
            ret, _ = camera_cap.read()
            if not ret:
                warmup_failures += 1
                if warmup_failures >= CAMERA_WARMUP_FRAMES:
                    with scan_lock:
                        camera_error = "Camera opened but cannot read frames"
                    print(f"ERROR: {camera_error}")
                    camera_cap.release()
                    camera_cap = None
                    return
            time.sleep(0.1)
        print("Camera warmup complete")

        last_code = None
        last_code_time = 0
        consecutive_failures = 0
        max_consecutive_failures = 10

        while camera_running:
            try:
                # Capture frame
                ret, frame = camera_cap.read()

                if not ret:
                    consecutive_failures += 1
                    if consecutive_failures >= max_consecutive_failures:
                        print(f"ERROR: {consecutive_failures} consecutive frame read failures")
                        with scan_lock:
                            camera_error = f"Camera read failure after {consecutive_failures} attempts"
                        break
                    # Brief delay before retry
                    time.sleep(FRAME_CAPTURE_INTERVAL * 2)
                    continue

                # Reset failure counter on successful read
                consecutive_failures = 0

                # Decode barcodes from frame
                barcodes = pyzbar.decode(frame)

                if barcodes:
                    # Get the first barcode
                    barcode = barcodes[0]
                    code = barcode.data.decode('utf-8')
                    now_ms = int(time.time() * 1000)

                    # Debounce: ignore if same code within debounce window
                    if code == last_code and (now_ms - last_code_time) < DEBOUNCE_MS:
                        continue

                    # New scan detected
                    last_code = code
                    last_code_time = now_ms

                    with scan_lock:
                        latest_scan_id += 1
                        latest_scan = {
                            "id": latest_scan_id,
                            "code": code,
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        }
                        camera_error = None  # Clear any previous error

                    print(f"Scan #{latest_scan_id}: {code}")

                # Control frame rate
                time.sleep(FRAME_CAPTURE_INTERVAL)

            except Exception as e:
                print(f"Error in capture loop: {e}")
                consecutive_failures += 1
                if consecutive_failures >= max_consecutive_failures:
                    with scan_lock:
                        camera_error = f"Camera error: {str(e)}"
                    break
                time.sleep(1)  # Back off on errors

    except Exception as e:
        print(f"Fatal error in capture loop: {e}")
        with scan_lock:
            camera_error = f"Fatal camera error: {str(e)}"
    finally:
        # Cleanup camera
        if camera_cap is not None:
            camera_cap.release()
            camera_cap = None
            print("Camera released")


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    with scan_lock:
        if camera_error:
            return jsonify({"status": "error", "error": camera_error}), 500
        if camera_cap is None and camera_running:
            return jsonify({"status": "error", "error": "Camera not initialized"}), 500
    return jsonify({"status": "ok"})


@app.route('/next_scan', methods=['GET'])
def next_scan():
    """
    Long-polling endpoint to get the next barcode scan.

    Query parameters:
        since_id (int, optional): The last scan ID the client has seen.
                                  Only return scans with id > since_id.

    Returns immediately if a new scan is available, otherwise waits up to
    NEXT_SCAN_TIMEOUT seconds for a new scan.

    Response formats:
        Success with new scan:
        {
            "success": true,
            "id": 123,
            "code": "1234567890",
            "timestamp": "2025-01-01T00:00:00Z"
        }

        Timeout (no new scan):
        {
            "success": false,
            "id": since_id,
            "code": null,
            "timeout": true
        }

        Error:
        {
            "success": false,
            "code": null,
            "error": "Could not read from camera"
        }
    """
    try:
        # Parse since_id parameter
        since_id = 0
        if 'since_id' in request.args:
            try:
                since_id = int(request.args.get('since_id', 0))
            except ValueError:
                since_id = 0

        # Check if there's already a new scan available
        with scan_lock:
            if camera_error:
                return jsonify({
                    "success": False,
                    "code": None,
                    "error": camera_error
                }), 500

            if latest_scan and latest_scan["id"] > since_id:
                # Return immediately
                return jsonify({
                    "success": True,
                    "id": latest_scan["id"],
                    "code": latest_scan["code"],
                    "timestamp": latest_scan["timestamp"]
                })

        # No new scan available, wait for one (long-polling)
        start_time = time.time()
        check_interval = 0.1  # Check every 100ms

        while (time.time() - start_time) < NEXT_SCAN_TIMEOUT:
            time.sleep(check_interval)

            with scan_lock:
                # Check for errors
                if camera_error:
                    return jsonify({
                        "success": False,
                        "code": None,
                        "error": camera_error
                    }), 500

                # Check for new scan
                if latest_scan and latest_scan["id"] > since_id:
                    return jsonify({
                        "success": True,
                        "id": latest_scan["id"],
                        "code": latest_scan["code"],
                        "timestamp": latest_scan["timestamp"]
                    })

        # Timeout - no new scan
        with scan_lock:
            current_id = latest_scan["id"] if latest_scan else since_id
        return jsonify({
            "success": False,
            "id": current_id,
            "code": None,
            "timeout": True
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "code": None,
            "error": f"Server error: {str(e)}"
        }), 500


def start_camera_thread():
    """Start the camera capture thread"""
    global camera_thread, camera_running

    if camera_thread is not None and camera_thread.is_alive():
        return

    camera_running = True
    camera_thread = threading.Thread(target=capture_loop, daemon=True)
    camera_thread.start()
    print("Camera capture thread started")


def stop_camera_thread():
    """Stop the camera capture thread"""
    global camera_running, camera_thread

    camera_running = False
    if camera_thread is not None:
        camera_thread.join(timeout=2.0)
        camera_thread = None
    print("Camera capture thread stopped")


if __name__ == '__main__':
    print("Starting Camera Sidecar Service...")
    print("Listening on http://127.0.0.1:7313")
    print("Endpoints:")
    print("  GET  /health     - Health check")
    print("  GET  /next_scan  - Long-poll for next barcode scan")
    print("\nPress Ctrl+C to stop")

    # Start camera capture thread
    start_camera_thread()

    try:
        app.run(host='127.0.0.1', port=7313, debug=False, threaded=True)
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        stop_camera_thread()
        print("Camera sidecar stopped")
