#!/usr/bin/env python3
"""
Camera Sidecar Service for Raspberry Pi Camera Barcode Scanning

This service provides an HTTP API for barcode scanning using the Pi Camera.
It runs on localhost and can be accessed by the Tauri application.

Usage:
    python3 sidecar/camera_sidecar.py

The service will start on http://127.0.0.1:7313

For systemd service, see sidecar/camera_sidecar.service.example
"""

import cv2
import json
import time
from flask import Flask, jsonify, request
from pyzbar import pyzbar

app = Flask(__name__)

# Configuration
DEFAULT_TIMEOUT_MS = 5000
DEFAULT_CAMERA_INDEX = 0
DEFAULT_RESOLUTION = (1280, 720)


def scan_barcode_from_camera(timeout_ms: int = DEFAULT_TIMEOUT_MS) -> dict:
    """
    Attempts to scan a barcode from the camera.

    Args:
        timeout_ms: Maximum time to spend scanning in milliseconds

    Returns:
        dict with 'success', 'code', and optionally 'error' keys
    """
    cap = None
    try:
        # Open camera
        cap = cv2.VideoCapture(DEFAULT_CAMERA_INDEX)

        if not cap.isOpened():
            return {
                "success": False,
                "code": None,
                "error": "Could not open camera"
            }

        # Set resolution
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, DEFAULT_RESOLUTION[0])
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, DEFAULT_RESOLUTION[1])

        # Calculate end time
        end_time = time.time() + (timeout_ms / 1000.0)

        # Scan frames until timeout or barcode found
        while time.time() < end_time:
            ret, frame = cap.read()

            if not ret:
                continue

            # Decode barcodes from frame
            barcodes = pyzbar.decode(frame)

            if barcodes:
                # Get the first barcode
                barcode = barcodes[0]
                code = barcode.data.decode('utf-8')

                # Clean up camera
                cap.release()

                return {
                    "success": True,
                    "code": code
                }

        # Timeout - no barcode found
        cap.release()
        return {
            "success": False,
            "code": None,
            "error": "No barcode detected"
        }

    except Exception as e:
        # Clean up camera on error
        if cap is not None:
            cap.release()

        return {
            "success": False,
            "code": None,
            "error": f"Error scanning barcode: {str(e)}"
        }


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok"})


@app.route('/scan', methods=['POST'])
def scan():
    """
    Scan for a barcode using the camera.

    Request body (JSON, optional):
        {
            "timeoutMs": 5000  // Timeout in milliseconds (default: 5000)
        }

    Response (JSON):
        {
            "success": true,
            "code": "1234567890"
        }
        OR
        {
            "success": false,
            "code": null,
            "error": "No barcode detected"
        }
    """
    try:
        # Parse request body
        timeout_ms = DEFAULT_TIMEOUT_MS
        if request.is_json and request.json:
            timeout_ms = request.json.get('timeoutMs', DEFAULT_TIMEOUT_MS)

        # Validate timeout
        if not isinstance(timeout_ms, (int, float)) or timeout_ms <= 0:
            timeout_ms = DEFAULT_TIMEOUT_MS

        # Perform scan
        result = scan_barcode_from_camera(int(timeout_ms))

        return jsonify(result)

    except Exception as e:
        return jsonify({
            "success": False,
            "code": None,
            "error": f"Server error: {str(e)}"
        }), 500


if __name__ == '__main__':
    print("Starting Camera Sidecar Service...")
    print("Listening on http://127.0.0.1:7313")
    print("Endpoints:")
    print("  GET  /health - Health check")
    print("  POST /scan   - Scan for barcode")
    print("\nPress Ctrl+C to stop")

    app.run(host='127.0.0.1', port=7313, debug=False)
