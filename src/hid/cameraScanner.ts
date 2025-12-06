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

// Initialize camera system and start scanning using browser APIs
export async function startCameraScanner(): Promise<boolean> {
  if (scanning) {
    console.log('Camera scanner already running');
    return true;
  }

  try {
    console.log('Initializing camera system using browser APIs...');

    // Check if browser supports mediaDevices API
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('Browser does not support getUserMedia API');
      return false;
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
    // Request permission first (some browsers require this before enumerateDevices returns labels)
    // We'll use a temporary stream to get permission, then enumerate devices
    let tempStream: MediaStream | null = null;
    try {
      tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Stop the temporary stream after getting permission
      tempStream.getTracks().forEach((track) => track.stop());
    } catch (permError) {
      console.warn('Permission request failed, trying without device selection:', permError);
    }

    // Get available video devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(
      (device) => device.kind === 'videoinput'
    );

    if (videoDevices.length === 0) {
      throw new Error('No video input devices found');
    }

    console.log(
      `Found ${videoDevices.length} video device(s):`,
      videoDevices.map((d) => ({ id: d.deviceId, label: d.label || 'Unknown' }))
    );

    // Try to match device ID or use first available
    let constraints: MediaStreamConstraints;
    if (currentDeviceId && videoDevices.length > 0) {
      // Try to find matching device
      const deviceId = currentDeviceId;
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
        console.log(`Using matched device: ${matchingDevice.label || matchingDevice.deviceId}`);
      } else {
        // Use first available device
        constraints = {
          video: {
            deviceId: { exact: videoDevices[0].deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        };
        console.log(`Using first available device: ${videoDevices[0].label || videoDevices[0].deviceId}`);
      }
    } else {
      // Fallback: use any available camera
      constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };
      console.log('Using default camera');
    }

    // Store the device ID for later use
    if (constraints.video && typeof constraints.video === 'object' && 'deviceId' in constraints.video) {
      const deviceIdObj = constraints.video.deviceId as { exact?: string };
      if (deviceIdObj.exact) {
        currentDeviceId = deviceIdObj.exact;
      }
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

    // Cleanup all resources (browser API handles stopping the stream)
    await cleanup();

    // Reset state
    currentDeviceId = null;
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
