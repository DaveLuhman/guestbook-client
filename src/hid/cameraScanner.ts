import type { Exception, Result } from '@zxing/library';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';

let videoElement: HTMLVideoElement | null = null;
let stream: MediaStream | null = null;
let scanning = false;
let scanInterval: number | null = null;
let codeReader: BrowserMultiFormatReader | null = null;
let lastScannedCode: string | null = null;
let lastScanTime = 0;
const SCAN_COOLDOWN = 1000; // Prevent duplicate scans within 1 second
let scanningPromise: Promise<void> | null = null;

// Parse barcode format ^1234567^ to extract OneCard number
function parseBarcodeData(rawData: string): string | null {
	// Format is always ^1234567^ where we extract the number
	const match = rawData.match(/^\^(\d+)\^$/);
	if (match?.[1]) {
		return match[1];
	}
	return null;
}

// Emit barcode-data event (same format as HID scanner)
async function emitBarcodeData(onecard: string) {
	// Prevent duplicate scans
	const now = Date.now();
	if (lastScannedCode === onecard && (now - lastScanTime) < SCAN_COOLDOWN) {
		return;
	}
	lastScannedCode = onecard;
	lastScanTime = now;

	// Emit custom event that HIDManager listens to
	const event = new CustomEvent('camera-barcode-data', {
		detail: { payload: onecard }
	});
	window.dispatchEvent(event);
}


// Start camera-based barcode scanning
export async function startCameraScanner(): Promise<boolean> {
	if (scanning) {
		console.log('Camera scanner already running');
		return true;
	}

	try {
		// Request camera access
		const mediaStream = await navigator.mediaDevices.getUserMedia({
			video: {
				facingMode: 'environment', // Prefer back camera
				width: { ideal: 1280 },
				height: { ideal: 720 }
			}
		});

		stream = mediaStream;

		// Create hidden video element
		videoElement = document.createElement('video');
		videoElement.style.position = 'fixed';
		videoElement.style.top = '-9999px';
		videoElement.style.left = '-9999px';
		videoElement.style.width = '1px';
		videoElement.style.height = '1px';
		videoElement.setAttribute('autoplay', 'true');
		videoElement.setAttribute('playsinline', 'true');
		videoElement.srcObject = stream;
		document.body.appendChild(videoElement);

		// Wait for video to be ready
		await new Promise<void>((resolve, reject) => {
			if (!videoElement) {
				reject(new Error('Video element not created'));
				return;
			}

			videoElement.onloadedmetadata = () => {
				videoElement?.play()
					.then(() => resolve())
					.catch(reject);
			};

			videoElement.onerror = reject;

			// Timeout after 5 seconds
			setTimeout(() => reject(new Error('Video element timeout')), 5000);
		});

		// Initialize ZXing reader
		codeReader = new BrowserMultiFormatReader();

		scanning = true;

		// Start continuous scanning using ZXing's continuous decode API
		if (videoElement && codeReader) {
			// Use decodeFromVideoDevice with continuous scanning
			codeReader.decodeFromVideoDevice(null, videoElement, (result: Result | null, err: Exception | undefined) => {
				if (err) {
					// NotFoundException is expected when no barcode is found - ignore it
					if (!(err instanceof NotFoundException)) {
						console.error('Camera scan error:', err);
					}
					return;
				}

				if (result?.getText()) {
					const rawData = result.getText();
					const onecard = parseBarcodeData(rawData);

					if (onecard) {
						console.log('Camera barcode scanned:', onecard);
						// Emit event that HIDManager can listen to
						emitBarcodeData(onecard).catch((emitErr: unknown) => {
							console.error('Failed to emit barcode data:', emitErr);
						});
					} else {
						console.warn('Barcode scanned but format invalid:', rawData);
					}
				}
			});
		}

		console.log('Camera scanner started successfully');
		return true;
	} catch (error) {
		console.error('Failed to start camera scanner:', error);
		stopCameraScanner();
		return false;
	}
}

// Stop camera-based barcode scanning
export function stopCameraScanner(): void {
	scanning = false;

	if (codeReader && videoElement) {
		try {
			codeReader.reset();
		} catch (err) {
			console.warn('Error resetting code reader:', err);
		}
	}

	if (scanInterval !== null) {
		clearTimeout(scanInterval);
		scanInterval = null;
	}

	if (scanningPromise) {
		scanningPromise = null;
	}

	if (stream) {
		stream.getTracks().forEach(track => track.stop());
		stream = null;
	}

	if (videoElement) {
		videoElement.srcObject = null;
		videoElement.remove();
		videoElement = null;
	}

	codeReader = null;
	console.log('Camera scanner stopped');
}

// Check if camera scanner is running
export function isCameraScannerRunning(): boolean {
	return scanning;
}

