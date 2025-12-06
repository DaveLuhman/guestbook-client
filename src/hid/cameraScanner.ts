/**
 * Camera Scanner Module
 *
 * This module provides camera-based barcode scanning using a sidecar HTTP service.
 * The sidecar handles direct camera access on the Raspberry Pi, avoiding browser
 * camera permission issues in Tauri/WebKitGTK.
 */

import { checkSidecarHealth, scanBarcodeViaSidecar } from '../cameraSidecarClient';

let scanning = false;
let scanInterval: number | null = null;
let lastScannedCode: string | null = null;
let lastScanTime: number = 0;
const SCAN_COOLDOWN = 1000; // Prevent duplicate scans within 1 second
const SCAN_INTERVAL_MS = 2000; // Poll the sidecar every 2 seconds when scanning

/**
 * Initialize camera scanner and start scanning using the sidecar service
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
    const healthy = await checkSidecarHealth();
    if (!healthy) {
      console.error(
        'Camera sidecar is not reachable. Is the service running? ' +
        'Please start the camera sidecar service (python3 sidecar/camera_sidecar.py)'
      );
      return false;
    }

    console.log('Camera sidecar is healthy, starting continuous scanning...');

    // Start polling the sidecar for barcodes
    startBarcodeScanning();

    scanning = true;
    console.log('Camera scanner started successfully');

    return true;
  } catch (error) {
    console.error('Failed to start camera scanner:', error);
    scanning = false;
    await cleanup();
    return false;
  }
}

/**
 * Start polling the sidecar service for barcodes
 */
function startBarcodeScanning(): void {
  if (scanInterval) {
    clearInterval(scanInterval);
  }

  // Poll the sidecar periodically
  scanInterval = window.setInterval(async () => {
    if (!scanning) {
      return;
    }

    // Check cooldown period to prevent duplicate scans
    const now = Date.now();
    if (now - lastScanTime < SCAN_COOLDOWN) {
      return;
    }

    try {
      // Request a scan from the sidecar
      const result = await scanBarcodeViaSidecar(1500); // Use shorter timeout for polling

      if (result.success && result.code) {
        const barcodeText = result.code;
        console.log('Barcode detected:', barcodeText);

        // Parse barcode format ^1234567^ to extract OneCard number
        const onecardMatch = barcodeText.match(/^\^(\d+)\^$/);
        if (onecardMatch) {
          const onecard = onecardMatch[1];

          // Prevent duplicate scans of the same code
          if (
            lastScannedCode === onecard &&
            now - lastScanTime < SCAN_COOLDOWN
          ) {
            return;
          }

          lastScannedCode = onecard;
          lastScanTime = now;

          // Emit custom event for barcode data (same format as HID scanner)
          const event = new CustomEvent('camera-barcode-data', {
            detail: { payload: onecard },
          });
          window.dispatchEvent(event);

          console.log(
            'Emitted camera-barcode-data event with onecard:',
            onecard
          );
        } else {
          console.warn('Barcode format not recognized:', barcodeText);
        }
      }
      // If no barcode found, silently continue (this is expected)
    } catch (error) {
      // Log errors but don't stop scanning
      console.debug('Barcode scan error:', error);
    }
  }, SCAN_INTERVAL_MS);
}

/**
 * Cleanup function
 */
async function cleanup(): Promise<void> {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
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

    // Cleanup polling interval
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

/**
 * Perform a one-shot barcode scan using the camera sidecar
 * This can be called on-demand (e.g., from a UI button)
 * @param timeoutMs Maximum time to spend scanning in milliseconds (default: 5000)
 * @returns The scanned barcode code, or throws an error if scan fails
 */
export async function scanBarcodeFromCamera(timeoutMs = 5000): Promise<string> {
  // Ensure sidecar is healthy
  const healthy = await checkSidecarHealth();
  if (!healthy) {
    throw new Error(
      'Camera sidecar unavailable. Is the service running? ' +
      'Please start the camera sidecar service (python3 sidecar/camera_sidecar.py)'
    );
  }

  const result = await scanBarcodeViaSidecar(timeoutMs);

  if (!result.success || !result.code) {
    throw new Error(result.error || 'No barcode detected');
  }

  // Parse barcode format ^1234567^ to extract OneCard number
  const barcodeText = result.code;
  const onecardMatch = barcodeText.match(/^\^(\d+)\^$/);

  if (onecardMatch) {
    return onecardMatch[1];
  }

  // If format doesn't match, return the raw code
  return barcodeText;
}
