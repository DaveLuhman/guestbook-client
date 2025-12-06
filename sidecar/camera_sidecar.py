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
DEFAULT_CAMERA_INDEX = 0
DEFAULT_RESOLUTION = (1280, 720)
FRAME_CAPTURE_INTERVAL = 0.1  # ~10 FPS (100ms between frames)
NEXT_SCAN_TIMEOUT = 8.0  # Long-poll timeout in seconds
DEBOUNCE_MS = 800  # Ignore duplicate scans within this window (ms)

# Shared state for scan queue
scan_lock = threading.Lock()
latest_scan_id = 0
latest_scan = None
camera_error = None

# Camera capture thread control
camera_thread = None
camera_running = False
camera_cap = None


def capture_loop():
    """
    Continuously captures frames from the camera and decodes barcodes.
    Runs in a background thread.
    """
    global latest_scan_id, latest_scan, camera_error, camera_cap, camera_running

    print("Starting camera capture loop...")

    try:
        # Open camera once
        camera_cap = cv2.VideoCapture(DEFAULT_CAMERA_INDEX)

        if not camera_cap.isOpened():
            with scan_lock:
                camera_error = "Could not open camera"
            print(f"ERROR: {camera_error}")
            return

        # Set resolution
        camera_cap.set(cv2.CAP_PROP_FRAME_WIDTH, DEFAULT_RESOLUTION[0])
        camera_cap.set(cv2.CAP_PROP_FRAME_HEIGHT, DEFAULT_RESOLUTION[1])

        print(f"Camera opened successfully at {DEFAULT_RESOLUTION[0]}x{DEFAULT_RESOLUTION[1]}")

        last_code = None
        last_code_time = 0

        while camera_running:
            try:
                # Capture frame
                ret, frame = camera_cap.read()

                if not ret:
                    print("Warning: Failed to read frame from camera")
                    time.sleep(FRAME_CAPTURE_INTERVAL)
                    continue

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
                with scan_lock:
                    camera_error = f"Camera error: {str(e)}"
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
