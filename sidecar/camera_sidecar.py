#!/usr/bin/env python3
"""
Camera Sidecar Service for Raspberry Pi Camera Barcode Scanning

This service continuously captures frames from the Pi Camera using libcamera (Picamera2)
and decodes barcodes, streaming new scans to clients via long-polling HTTP endpoints.

Usage:
    python3 sidecar/camera_sidecar.py

The service will start on http://127.0.0.1:7313

For systemd service, see sidecar/camera_sidecar.service.example
"""

import time
import threading
from datetime import datetime, timezone
from flask import Flask, jsonify, request
from threading import Thread, Lock
from picamera2 import Picamera2
import cv2
from pyzbar.pyzbar import decode as decode_barcodes

app = Flask(__name__)

# Configuration
NEXT_SCAN_TIMEOUT = 8.0  # Long-poll timeout in seconds
DEBOUNCE_MS = 800  # Ignore duplicate scans within this window (ms)
CAPTURE_FPS = 14  # Target capture rate (~14 FPS)
CAPTURE_INTERVAL = 1.0 / CAPTURE_FPS  # ~0.07 seconds between captures
DECODE_INTERVAL = 0.05  # Small delay in decode loop to avoid pegging CPU

# Shared state
picam2 = None
latest_frame = None
frame_lock = Lock()
latest_scan_id = 0
latest_scan = None
scan_lock = Lock()
camera_error = None
running = True


def camera_capture_loop():
    """
    Continuously captures frames from the camera using Picamera2 (libcamera).
    Runs in a background thread.
    """
    global latest_frame, camera_error, picam2

    print("Starting camera capture loop...")

    try:
        pic = Picamera2()
        picam2 = pic

        # Simple 640x480 RGB config
        config = pic.create_video_configuration(
            main={"size": (640, 480), "format": "RGB888"}
        )
        pic.configure(config)
        pic.start()

        print("Camera opened successfully (640x480 RGB)")

        while running:
            try:
                frame = pic.capture_array()
                with frame_lock:
                    latest_frame = frame
            except Exception as e:
                print(f"Error capturing frame: {e}")
                with scan_lock:
                    camera_error = f"Camera capture error: {str(e)}"
                time.sleep(1)  # Back off on errors

            time.sleep(CAPTURE_INTERVAL)  # ~14 fps

    except Exception as e:
        print(f"Fatal error in camera capture loop: {e}")
        with scan_lock:
            camera_error = f"Fatal camera error: {str(e)}"
    finally:
        if picam2 is not None:
            try:
                picam2.stop()
                picam2.close()
            except Exception:
                pass
            picam2 = None
            print("Camera released")


def barcode_decode_loop():
    """
    Continuously decodes barcodes from captured frames.
    Runs in a background thread separate from capture.
    """
    global latest_scan_id, latest_scan, camera_error

    print("Starting barcode decode loop...")

    last_code = None
    last_time = 0.0

    while running:
        try:
            frame = None
            with frame_lock:
                if latest_frame is not None:
                    frame = latest_frame.copy()

            if frame is not None:
                # Picamera2 gives RGB, OpenCV/pyzbar likes BGR
                bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
                barcodes = decode_barcodes(bgr)

                now = time.time() * 1000

                for bc in barcodes:
                    code = bc.data.decode("utf-8").strip()
                    if not code:
                        continue

                    # Debounce: ignore if same code within debounce window
                    if code == last_code and (now - last_time) < DEBOUNCE_MS:
                        # Same label still in front of camera, ignore
                        continue

                    # New scan detected
                    with scan_lock:
                        latest_scan_id += 1
                        latest_scan = {
                            "id": latest_scan_id,
                            "code": code,
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        }
                        camera_error = None  # Clear any previous error

                    print(f"Scan #{latest_scan_id}: {code}")

                    last_code = code
                    last_time = now
                    break  # Only handle one per frame

            time.sleep(DECODE_INTERVAL)  # Small delay to avoid pegging CPU

        except Exception as e:
            print(f"Error in barcode decode loop: {e}")
            with scan_lock:
                camera_error = f"Barcode decode error: {str(e)}"
            time.sleep(1)  # Back off on errors


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    with scan_lock:
        if camera_error:
            return jsonify({"status": "error", "error": camera_error}), 500
        if picam2 is None and running:
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

            if latest_scan is not None and latest_scan["id"] > since_id:
                # Return immediately
                return jsonify({
                    "success": True,
                    **latest_scan
                })

        # No new scan available, wait for one (long-polling)
        deadline = time.time() + NEXT_SCAN_TIMEOUT
        start_id = since_id

        while time.time() < deadline:
            time.sleep(0.1)  # Check every 100ms

            with scan_lock:
                # Check for errors
                if camera_error:
                    return jsonify({
                        "success": False,
                        "code": None,
                        "error": camera_error
                    }), 500

                # Check for new scan
                if latest_scan is not None and latest_scan["id"] > since_id:
                    return jsonify({
                        "success": True,
                        **latest_scan
                    })

        # Timeout - no new scan
        with scan_lock:
            current_id = latest_scan["id"] if latest_scan else start_id
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


def start_threads():
    """Start camera capture and barcode decode threads"""
    global running

    running = True

    t1 = Thread(target=camera_capture_loop, daemon=True)
    t2 = Thread(target=barcode_decode_loop, daemon=True)

    t1.start()
    t2.start()

    print("Camera capture and barcode decode threads started")


def stop_threads():
    """Stop camera capture and barcode decode threads"""
    global running

    running = False
    # Give threads a moment to finish
    time.sleep(0.5)
    print("Camera threads stopped")


if __name__ == '__main__':
    print("Starting Camera Sidecar Service...")
    print("Using libcamera (Picamera2) for camera access")
    print("Listening on http://127.0.0.1:7313")
    print("Endpoints:")
    print("  GET  /health     - Health check")
    print("  GET  /next_scan  - Long-poll for next barcode scan")
    print("\nPress Ctrl+C to stop")

    # Start camera capture and decode threads
    start_threads()

    try:
        app.run(host='127.0.0.1', port=7313, debug=False, threaded=True)
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        stop_threads()
        print("Camera sidecar stopped")
