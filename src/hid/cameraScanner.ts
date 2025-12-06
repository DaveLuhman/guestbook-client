/**
 * Camera Scanner Module
 *
 * This module provides camera-based barcode scanning using a sidecar HTTP service.
 * The sidecar handles direct camera access on the Raspberry Pi, avoiding browser
 * camera permission issues in Tauri/WebKitGTK.
 *
 * Scanning is "always on" - it starts automatically when the app loads and continuously
 * streams barcode scans via long-polling. No user interaction is required.
 */

import { checkSidecarHealth, startScanStream, type ScanEvent } from '../cameraSidecarClient';

let scanning = false;
let stopStream: (() => void) | null = null;
let lastScannedCode: string | null = null;
let lastScanTime: number = 0;
const SCAN_COOLDOWN = 1000; // Prevent duplicate scans within 1 second

/**
 * Initialize camera scanner and start continuous scanning using the sidecar service.
 * Scanning starts automatically and runs continuously - no user interaction required.
 *
 * @returns true if the scanner started successfully, false otherwise
 */
export async function startCameraScanner(): Promise<boolean> {
  if (scanning) {
    console.log('Camera scanner already running');
    return true;
  }

  try {
    console.log('Initializing camera scanner using sidecar service...');

    // Check if sidecar is healthy
    const health = await checkSidecarHealth();
    if (!health.ok) {
      console.error(
        'Camera sidecar is not reachable. Is the service running? ' +
        'Please start the camera sidecar service (python3 sidecar/camera_sidecar.py)'
      );
      if (health.error) {
        console.error('Sidecar error:', health.error);
      }
      return false;
    }

    console.log('Camera sidecar is healthy, starting continuous scanning stream...');

    // Start the continuous scan stream
    stopStream = startScanStream(handleScanEvent);

    scanning = true;
    console.log('Camera scanner started successfully - scanning continuously');

    return true;
  } catch (error) {
    console.error('Failed to start camera scanner:', error);
    scanning = false;
    await cleanup();
    return false;
  }
}

/**
 * Handle a scan event from the sidecar stream.
 * Parses the barcode, applies debouncing, and emits events to match HID scanner format.
 */
function handleScanEvent(scan: ScanEvent): void {
  const barcodeText = scan.code;
  console.log('Barcode detected:', barcodeText);

  // Parse barcode format ^1234567^ to extract OneCard number
  const onecardMatch = barcodeText.match(/^\^(\d+)\^$/);
  if (!onecardMatch) {
    console.warn('Barcode format not recognized:', barcodeText);
    return;
  }

  const onecard = onecardMatch[1];
  const now = Date.now();

  // Prevent duplicate scans of the same code within cooldown period
  if (
    lastScannedCode === onecard &&
    now - lastScanTime < SCAN_COOLDOWN
  ) {
    console.debug('Ignoring duplicate scan:', onecard);
    return;
  }

  lastScannedCode = onecard;
  lastScanTime = now;

  // Emit custom event for barcode data (same format as HID scanner)
  // This ensures compatibility with existing HIDManager event listeners
  const event = new CustomEvent('camera-barcode-data', {
    detail: { payload: onecard },
  });
  window.dispatchEvent(event);

  console.log('Emitted camera-barcode-data event with onecard:', onecard);
}

/**
 * Cleanup function
 */
async function cleanup(): Promise<void> {
  if (stopStream) {
    stopStream();
    stopStream = null;
  }
}

/**
 * Stop camera-based barcode scanning
 */
export async function stopCameraScanner(): Promise<void> {
  if (!scanning) {
    return;
  }

  try {
    scanning = false;

    // Stop the scan stream
    await cleanup();

    // Reset state
    lastScannedCode = null;
    lastScanTime = 0;

    console.log('Camera scanner stopped');
  } catch (error) {
    console.error('Failed to stop camera scanner:', error);
  }
}

/**
 * Check if camera scanner is running
 * @returns true if the scanner is active, false otherwise
 */
export async function isCameraScannerRunning(): Promise<boolean> {
  return scanning;
}
