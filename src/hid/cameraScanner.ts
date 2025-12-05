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

	// Check if getUserMedia is available
	if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
		console.error('getUserMedia is not available in this browser/context');
		return false;
	}

	try {
		// Enumerate available cameras first
		let deviceId: string | null = null;
		try {
			const devices = await navigator.mediaDevices.enumerateDevices();
			const videoDevices = devices.filter(device => device.kind === 'videoinput');
			console.log('Available video devices:', videoDevices.map(d => ({ id: d.deviceId, label: d.label })));

			// Try to find a camera device (prefer one with a label, or just use the first one)
			if (videoDevices.length > 0) {
				deviceId = videoDevices[0].deviceId;
				console.log('Using camera device:', deviceId);
			}
		} catch (enumError) {
			console.warn('Failed to enumerate devices:', enumError);
		}

		// Request camera access with device ID if available, otherwise use permissive constraints
		const constraints: MediaStreamConstraints = deviceId
			? {
				video: {
					deviceId: { exact: deviceId },
					width: { ideal: 1280 },
					height: { ideal: 720 }
				}
			}
			: {
				video: {
					// More permissive constraints for Raspberry Pi camera
					width: { ideal: 1280 },
					height: { ideal: 720 }
				}
			};

		console.log('Requesting camera access with constraints:', constraints);
		const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
		console.log('Camera stream obtained:', mediaStream.getVideoTracks().map(t => ({ id: t.id, label: t.label, enabled: t.enabled, readyState: t.readyState })));

		stream = mediaStream;

		// Use existing visible video element or create one
		videoElement = document.getElementById('camera-viewport') as HTMLVideoElement;
		if (!videoElement) {
			// Fallback: create video element if not found in HTML
			videoElement = document.createElement('video');
			videoElement.id = 'camera-viewport';
			videoElement.setAttribute('autoplay', 'true');
			videoElement.setAttribute('playsinline', 'true');
			const container = document.querySelector('.camera-viewport-container');
			if (container) {
				container.appendChild(videoElement);
			} else {
				document.body.appendChild(videoElement);
			}
		}
		videoElement.srcObject = stream;
		videoElement.muted = true; // Mute to avoid feedback

		// Ensure video element is visible
		videoElement.style.display = 'block';

		// Wait for video to be ready
		await new Promise<void>((resolve, reject) => {
			if (!videoElement) {
				reject(new Error('Video element not created'));
				return;
			}

			const timeout = setTimeout(() => {
				reject(new Error('Video element timeout - stream may not be active'));
			}, 10000); // Increased timeout to 10 seconds

			videoElement.onloadedmetadata = () => {
				clearTimeout(timeout);
				console.log('Video metadata loaded, dimensions:', videoElement?.videoWidth, 'x', videoElement?.videoHeight);
				videoElement?.play()
					.then(() => {
						console.log('Video playback started');
						resolve();
					})
					.catch((playError) => {
						console.error('Video play error:', playError);
						reject(playError);
					});
			};

			videoElement.onerror = (error) => {
				clearTimeout(timeout);
				console.error('Video element error:', error);
				reject(new Error('Video element error'));
			};

			// Check if stream tracks are active
			const videoTracks = stream.getVideoTracks();
			if (videoTracks.length === 0) {
				clearTimeout(timeout);
				reject(new Error('No video tracks in stream'));
				return;
			}

			console.log('Video tracks:', videoTracks.map(t => ({
				id: t.id,
				label: t.label,
				enabled: t.enabled,
				readyState: t.readyState,
				muted: t.muted
			})));
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
		if (error instanceof Error) {
			console.error('Error name:', error.name);
			console.error('Error message:', error.message);
			console.error('Error stack:', error.stack);
		}
		if (error instanceof DOMException) {
			console.error('DOMException code:', error.code);
			console.error('DOMException name:', error.name);
		}
		// Check if it's a permission error
		if (error instanceof Error && (
			error.name === 'NotAllowedError' ||
			error.name === 'PermissionDeniedError' ||
			error.message.includes('permission') ||
			error.message.includes('denied')
		)) {
			console.error('Camera permission denied. Please grant camera permissions to the application.');
		}
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
		// Don't remove the persistent viewport element from HTML
		// Only remove if it was dynamically created (doesn't have the id or wasn't in HTML originally)
		const persistentElement = document.getElementById('camera-viewport');
		if (!persistentElement || persistentElement !== videoElement) {
			videoElement.remove();
		}
		videoElement = null;
	}

	codeReader = null;
	console.log('Camera scanner stopped');
}

// Check if camera scanner is running
export function isCameraScannerRunning(): boolean {
	return scanning;
}

