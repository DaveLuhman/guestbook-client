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

import { checkSidecarHealth, type ScanEvent, startScanStream } from '../cameraSidecarClient';
import { ensureScannerRunning } from '../lib/scanner';

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

    // Start the sidecar process via Tauri
    try {
      await ensureScannerRunning();
      console.log('Camera sidecar process started');
    } catch (error) {
      console.error('Failed to start camera sidecar process:', error);
      return false;
    }

    // Wait for the sidecar to start up and initialize (camera initialization can take time)
    // Retry health check with exponential backoff
    let healthCheckPassed = false;
    const maxRetries = 10;
    const initialDelay = 2000; // Start with 2 seconds

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, initialDelay + attempt * 500));

      const health = await checkSidecarHealth();
      if (health.ok) {
        console.log(`[CameraScanner] Sidecar health check passed on attempt ${attempt + 1}`);
        healthCheckPassed = true;
        break;
      }

      console.log(`[CameraScanner] Health check attempt ${attempt + 1}/${maxRetries} failed, retrying...`);
      if (health.error) {
        console.log(`[CameraScanner] Health check error: ${health.error}`);
      }
    }

    if (!healthCheckPassed) {
      console.warn(
        'Camera sidecar health check failed after multiple retries. ' +
        'Proceeding anyway - the sidecar may still be initializing.'
      );
    } else {
      console.log('Camera sidecar is healthy, starting continuous scanning stream...');
    }

    // Start the continuous scan stream
    console.log('[CameraScanner] Calling startScanStream...');
    stopStream = startScanStream(handleScanEvent);
    console.log('[CameraScanner] startScanStream returned, stream should be active');

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
  console.log('[CameraScanner] Barcode detected from sidecar:', barcodeText, 'Raw scan:', scan);

  // Parse barcode format ^1234567^ to extract OneCard number
  // Also handle plain numeric codes (7 digits) as fallback
  let onecard: string | null = null;
  const onecardMatch = barcodeText.match(/^\^(\d+)\^$/);
  if (onecardMatch) {
    onecard = onecardMatch[1];
  } else if (/^\d{7}$/.test(barcodeText)) {
    // Fallback: if it's already a 7-digit number, use it directly
    onecard = barcodeText;
    console.log('[CameraScanner] Using plain numeric format:', onecard);
  } else {
    console.warn('[CameraScanner] Barcode format not recognized:', barcodeText, 'Expected format: ^1234567^ or 1234567');
    return;
  }

  if (!onecard) {
    console.error('[CameraScanner] Failed to extract OneCard number from:', barcodeText);
    return;
  }

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
