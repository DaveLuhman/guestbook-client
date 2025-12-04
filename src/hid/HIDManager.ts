import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { errorHandler } from "../error/errorHandler";
import { showEntryError, showEntrySuccess } from "../main";
import { soundManager } from "../sound/soundManager";
import { updateScanData } from "./barcodeScanner";
import { startCameraScanner } from "./cameraScanner";
import { type swipeData, updateSwipeData } from "./magstripReader";

// Device status tracking
interface DeviceStatus {
  connected: boolean;
  state: string;
  error_count: number;
  last_error?: string;
  last_seen?: number;
}

interface DeviceStatusResponse {
  barcode: DeviceStatus;
  msr: DeviceStatus;
}

const entryDataEl = document.querySelector("#entry-data");
export const defaultMessage =
	"Swipe your card or scan your barcode to record an entry...";

if (entryDataEl) {
	entryDataEl.innerHTML = `<p>${defaultMessage}</p>`;
}

const resetEntryData = () => {
	setTimeout(() => {
		const {body} = document;
		body.style.backgroundColor = "#00447C";
		if (entryDataEl) {
			entryDataEl.innerHTML = `<p>${defaultMessage}</p>`;
		}
	}, 3000);
};

export async function startHIDManager() {
	// The backend now handles device initialization and monitoring automatically
	// We just need to set up event listeners and check initial status

	// Check initial device status
	await checkDeviceStatus();

	// Set up device status monitoring
	setupDeviceStatusMonitoring();

	// Start camera scanner (will fall back to HID scanner if camera fails)
	try {
		const cameraStarted = await startCameraScanner();
		if (cameraStarted) {
			console.log("Camera scanner started successfully");
			updateDeviceStatusIndicator("camera", "connected");
		} else {
			console.warn("Camera scanner failed to start, will use HID scanner as fallback");
			updateDeviceStatusIndicator("camera", "disconnected");
		}
	} catch (error) {
		console.error("Failed to initialize camera scanner:", error);
		updateDeviceStatusIndicator("camera", "error", String(error));
		// Continue with HID scanner as fallback
	}

	// Listen for camera barcode events (custom window events)
	window.addEventListener("camera-barcode-data", ((event: CustomEvent) => {
		const onecard = event.detail?.payload;
		if (onecard && typeof onecard === "string") {
			// Process the same way as Tauri barcode-data events
			processBarcodeData(onecard);
		}
	}) as EventListener);

	// Shared barcode processing function for both Tauri events and camera events
	async function processBarcodeData(onecard: string) {
		try {
			console.log("Barcode scanned:", onecard);
			// Validate onecard format (7 digits)
			if (!/^\d{7}$/.test(onecard)) {
				console.error("Invalid barcode payload:", onecard);
				// Play error sound for bad read/scan
				soundManager.playError();
				errorHandler.handleApplicationError(
					"barcode",
					"Invalid barcode data",
					"medium",
				);
				resetEntryData();
				return;
			}
			updateScanData(onecard); // Show scanned value to user
			// DO NOT play success sound here - wait for successful HTTP response
			// Submit only the onecard value to the backend and await the result
			// Note: Rust checks HTTP status code and returns Result<(), String>
			// - If 2xx: Rust returns Ok(()), invoke resolves, we play success sound
			// - If non-2xx or network error: Rust returns Err(String), invoke throws, catch block handles it
			await invoke("submit_barcode_entry", { onecard });
			// Only play success sound after receiving 2xx HTTP response (invoke resolved successfully)
			soundManager.playSuccess();
			showEntrySuccess();
		} catch (error) {
			console.error("Submit error:", error);
			// Play error sound for non-2xx HTTP response or network error
			soundManager.playError();
			// Extract error message - Tauri errors can be strings, Error objects, or custom objects
			let errorMsg = "Unknown barcode error";
			if (typeof error === "string") {
				errorMsg = error;
			} else if (error instanceof Error) {
				errorMsg = error.message;
			} else if (error && typeof error === "object" && "message" in error) {
				errorMsg = String((error as { message: unknown }).message);
			}
			errorHandler.handleApplicationError("barcode", errorMsg, "high");
			showEntryError();
		}
		// Don't call resetEntryData here - let showEntrySuccess/showEntryError handle the reset
	}

	listen("barcode-data", async (event) => {
		// For barcode, expect event.payload to be the 7-digit onecard number (string or number)
		let onecard = "";
		if (typeof event.payload === "string" && /^\d{7}$/.test(event.payload)) {
			onecard = event.payload;
		} else if (
			typeof event.payload === "number" &&
			event.payload.toString().length === 7
		) {
			onecard = event.payload.toString();
		} else {
			console.error("Invalid barcode payload:", event.payload);
			// Play error sound for bad read/scan
			soundManager.playError();
			errorHandler.handleApplicationError(
				"barcode",
				"Invalid barcode data",
				"medium",
			);
			resetEntryData();
			return;
		}
		await processBarcodeData(onecard);
	});

	listen("magtek-data", async (event) => {
		try {
			console.log("MagTek swipe:", event.payload);
			const swipeData = event.payload as swipeData;
			// Validate swipe data
			if (!swipeData || !swipeData.onecard || !swipeData.name) {
				console.error("Invalid swipe data:", swipeData);
				// Play error sound for bad read/scan
				soundManager.playError();
				errorHandler.handleApplicationError(
					"magtek",
					"Invalid swipe data",
					"medium",
				);
				resetEntryData();
				return;
			}
			updateSwipeData(swipeData); // Show swipe data to user
			// DO NOT play success sound here - wait for successful HTTP response
			// Submit the swipe data to the backend and await the result
			// Note: Rust checks HTTP status code and returns Result<(), String>
			// - If 2xx: Rust returns Ok(()), invoke resolves, we play success sound
			// - If non-2xx or network error: Rust returns Err(String), invoke throws, catch block handles it
			await invoke("submit_swipe_entry", {
				name: swipeData.name,
				onecard: swipeData.onecard,
			});
			// Only play success sound after receiving 2xx HTTP response (invoke resolved successfully)
			soundManager.playSuccess();
			showEntrySuccess();
		} catch (error) {
			console.error("Submit error:", error);
			// Play error sound for non-2xx HTTP response or network error
			soundManager.playError();
			// Extract error message - Tauri errors can be strings, Error objects, or custom objects
			let errorMsg = "Unknown MagTek error";
			if (typeof error === "string") {
				errorMsg = error;
			} else if (error instanceof Error) {
				errorMsg = error.message;
			} else if (error && typeof error === "object" && "message" in error) {
				errorMsg = String((error as { message: unknown }).message);
			}
			errorHandler.handleApplicationError("magtek", errorMsg, "high");
			showEntryError();
		}
		// Don't call resetEntryData here - let showEntrySuccess/showEntryError handle the reset
	});
}

// Check device status and update UI
async function checkDeviceStatus() {
	try {
		const status: DeviceStatusResponse = await invoke("get_device_status");
		updateDeviceStatusDisplay(status);
	} catch (error) {
		console.error("Failed to get device status:", error);
		errorHandler.handleApplicationError("system", "Failed to check device status", "medium");
	}
}

// Set up device status monitoring
function setupDeviceStatusMonitoring() {
	// Listen for device status events from the backend
	listen("device-status", (event) => {
		const { device, status, error } = event.payload as {
			device: "barcode" | "msr";
			status: string;
			error?: string
		};

		console.log(`Device status update: ${device} - ${status}`);

		// Update UI based on device status
		updateDeviceStatusIndicator(device, status, error);

		// Show user-friendly messages for important status changes
		if (status === "connected") {
			console.log(`${device} device connected successfully`);
			// Clear any previous error messages when device reconnects
			clearDeviceErrorMessage(device);
		} else if (status === "error") {
			const errorMsg = error || `${device} device error`;
			errorHandler.handleApplicationError(device, errorMsg, "medium");
		} else if (status === "disconnected") {
			// Show user-friendly disconnection message
			showDeviceDisconnectedMessage(device);
		} else if (status === "connecting") {
			console.log(`${device} device attempting to connect...`);
		}
	});

	// Periodically check device status (every 15 seconds)
	setInterval(checkDeviceStatus, 15000);
}

// Update device status display in the UI
function updateDeviceStatusDisplay(status: DeviceStatusResponse) {
	updateDeviceStatusIndicator("barcode", status.barcode.connected ? "connected" : "disconnected");
	updateDeviceStatusIndicator("msr", status.msr.connected ? "connected" : "disconnected");
}

// Update individual device status indicator
function updateDeviceStatusIndicator(device: "barcode" | "msr" | "camera", status: string, error?: string) {
	// Create or update device status indicators in the UI
	let indicator = document.getElementById(`${device}-status-indicator`);
	if (!indicator) {
		indicator = document.createElement("div");
		indicator.id = `${device}-status-indicator`;
		indicator.className = "device-status-indicator";
		indicator.style.cssText = `
			position: fixed;
			top: 10px;
			${device === "barcode" ? "right: 10px;" : device === "camera" ? "right: 35px;" : "right: 60px;"}
			width: 20px;
			height: 20px;
			border-radius: 50%;
			z-index: 1000;
			transition: background-color 0.3s ease;
		`;
		document.body.appendChild(indicator);
	}

	// Update indicator color based on status
	switch (status) {
		case "connected":
			indicator.style.backgroundColor = "#00aa00";
			indicator.title = `${device} device connected`;
			break;
		case "connecting":
			indicator.style.backgroundColor = "#ffaa00";
			indicator.title = `${device} device connecting...`;
			break;
		case "error":
			indicator.style.backgroundColor = "#aa0000";
			indicator.title = `${device} device error: ${error || "Unknown error"}`;
			break;

		case "disconnected":
			indicator.style.backgroundColor = "#aa0000";
			indicator.title = `${device} device disconnected - please check connection`;
			break;
		default:
			indicator.style.backgroundColor = "#666666";
			indicator.title = `${device} device disconnected`;
			break;
	}
}

// Show user-friendly disconnection message
function showDeviceDisconnectedMessage(device: "barcode" | "msr") {
	const entryData = document.getElementById('entry-data');
	if (entryData) {
		const deviceName = device === "msr" ? "Card Reader" : "Barcode Scanner";
		const instructions = device === "msr"
			? "Please check that the card reader is properly connected via USB and try again."
			: "Please check that the barcode scanner is properly connected via USB and try again.";

		entryData.innerHTML = `
			<div class="device-disconnected-message">
				<p><strong>${deviceName} Disconnected</strong></p>
				<p>${instructions}</p>
				<p class="reconnect-hint">The device will reconnect automatically when plugged back in.</p>
			</div>
		`;

		// Add CSS styling for the message
		const style = document.createElement('style');
		style.textContent = `
			.device-disconnected-message {
				text-align: center;
				padding: 20px;
				background-color: #ffe6e6;
				border: 2px solid #ff6666;
				border-radius: 8px;
				margin: 20px;
			}
			.device-disconnected-message p {
				margin: 10px 0;
			}
			.reconnect-hint {
				font-style: italic;
				color: #666;
				font-size: 0.9em;
			}
		`;
		if (!document.querySelector('style[data-device-disconnect]')) {
			style.setAttribute('data-device-disconnect', 'true');
			document.head.appendChild(style);
		}
	}
}

// Clear device error message when device reconnects
function clearDeviceErrorMessage(_device: "barcode" | "msr") {
	const entryData = document.getElementById('entry-data');
	if (entryData) {
		// Check if we're showing a device disconnected message
		const disconnectedMessage = entryData.querySelector('.device-disconnected-message');
		if (disconnectedMessage) {
			entryData.innerHTML = '<p>Swipe your card or scan your barcode to record an entry...</p>';
		}
	}
}
