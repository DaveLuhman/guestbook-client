import { invoke } from '@tauri-apps/api/core';
import { BrowserMultiFormatReader } from '@zxing/library';

let scanning = false;
let cameraStream: MediaStream | null = null;
let barcodeReader: BrowserMultiFormatReader | null = null;
let videoElement: HTMLVideoElement | null = null;
let scanInterval: number | null = null;
let currentDeviceId: string | null = null;
let lastScannedCode: string | null = null;
let lastScanTime: number = 0;
const SCAN_COOLDOWN = 1000; // Prevent duplicate scans within 1 second

// Initialize camera system and start scanning
export async function startCameraScanner(): Promise<boolean> {
  if (scanning) {
    console.log('Camera scanner already running');
    return true;
  }

  try {
    console.log('Initializing camera system...');

    // Initialize the camera system
    await invoke('initialize_camera_system');

    // Get available cameras
    const cameras = await invoke<Array<{ id: string; name: string }>>(
      'get_available_cameras'
    );

    if (!cameras || cameras.length === 0) {
      console.warn('No cameras found');
      return false;
    }

    console.log(`Found ${cameras.length} camera(s):`, cameras);

    // Use the first available camera
    const camera = cameras[0];
    currentDeviceId = camera.id;

    console.log(`Starting camera preview for: ${camera.name} (${camera.id})`);

    // Start camera preview using plugin command
    try {
      await invoke('start_camera_preview', { deviceId: camera.id });
    } catch (previewError) {
      console.warn(
        'Plugin preview command failed, using getUserMedia fallback:',
        previewError
      );
    }

    // Set up video element for barcode scanning using getUserMedia
    await setupVideoElement();

    // Initialize ZXing barcode reader
    barcodeReader = new BrowserMultiFormatReader();

    // Start scanning for barcodes
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

// Set up video element to display camera feed and scan for barcodes
async function setupVideoElement(): Promise<void> {
  // Create or get video element
  if (!videoElement) {
    videoElement = document.createElement('video');
    videoElement.style.position = 'fixed';
    videoElement.style.top = '0';
    videoElement.style.left = '0';
    videoElement.style.width = '1px';
    videoElement.style.height = '1px';
    videoElement.style.opacity = '0';
    videoElement.style.pointerEvents = 'none';
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.muted = true;
    document.body.appendChild(videoElement);
  }

  // Try to get user media stream
  try {
    // Get available video devices first to find the right one
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(
      (device) => device.kind === 'videoinput'
    );

    console.log(
      'Available video devices:',
      videoDevices.map((d) => ({ id: d.deviceId, label: d.label }))
    );

    // Try to match device ID or use first available
    let constraints: MediaStreamConstraints;
    if (currentDeviceId && videoDevices.length > 0) {
      // Try to find matching device
      const deviceId = currentDeviceId; // TypeScript now knows this is not null
      const matchingDevice = videoDevices.find(
        (d) => d.deviceId === deviceId || d.deviceId.includes(deviceId)
      );
      if (matchingDevice) {
        constraints = {
          video: {
            deviceId: { exact: matchingDevice.deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        };
      } else {
        // Use first available device
        constraints = {
          video: {
            deviceId: { exact: videoDevices[0].deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        };
      }
    } else {
      // Fallback: use any available camera
      constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };
    }

    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = cameraStream;
    await videoElement.play();

    console.log('Video element set up successfully');
  } catch (error) {
    console.error('Failed to set up video element:', error);
    throw error;
  }
}

// Cleanup function
async function cleanup(): Promise<void> {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  if (videoElement) {
    videoElement.srcObject = null;
    videoElement.remove();
    videoElement = null;
  }

  if (barcodeReader) {
    barcodeReader.reset();
    barcodeReader = null;
  }
}

// Start scanning for barcodes in video frames
function startBarcodeScanning(): void {
  if (!videoElement || !barcodeReader) {
    console.error('Video element or barcode reader not initialized');
    return;
  }

  // Scan every 300ms to balance between responsiveness and CPU usage
  scanInterval = window.setInterval(async () => {
    if (!videoElement || !barcodeReader || !scanning) {
      return;
    }

    // Check if video has enough data
    if (videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) {
      return;
    }

    // Check cooldown period
    const now = Date.now();
    if (now - lastScanTime < SCAN_COOLDOWN) {
      return;
    }

    try {
      // Decode barcode from video frame
      const result = await barcodeReader.decodeFromVideoElement(videoElement);

      const barcodeText = result?.getText();
      if (barcodeText) {
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
    } catch (error) {
      // Ignore decode errors (no barcode found in frame)
      // NotFoundException is expected when no barcode is present
      if (error && typeof error === 'object' && 'name' in error) {
        const errorName = (error as { name?: string }).name;
        if (
          errorName !== 'NotFoundException' &&
          errorName !== 'No QR Code Found'
        ) {
          console.debug('Barcode scan error:', error);
        }
      }
    }
  }, 300);
}

// Stop camera-based barcode scanning
export async function stopCameraScanner(): Promise<void> {
  if (!scanning) {
    return;
  }

  try {
    scanning = false;

    // Stop camera preview if device ID is set
    if (currentDeviceId) {
      try {
        await invoke('stop_camera_preview', { deviceId: currentDeviceId });
      } catch (error) {
        console.warn('Failed to stop camera preview via plugin:', error);
      }
      currentDeviceId = null;
    }

    // Cleanup all resources
    await cleanup();

    // Reset state
    lastScannedCode = null;
    lastScanTime = 0;

    console.log('Camera scanner stopped');
  } catch (error) {
    console.error('Failed to stop camera scanner:', error);
  }
}

// Check if camera scanner is running
export async function isCameraScannerRunning(): Promise<boolean> {
  return scanning;
}
