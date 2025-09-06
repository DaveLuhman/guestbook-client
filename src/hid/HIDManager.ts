import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { errorHandler } from "../error/errorHandler";
import { soundManager } from "../sound/soundManager";
import { updateScanData } from "./barcodeScanner";
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

	listen("barcode-data", (event) => {
		try {
			console.log("Barcode scanned:", event.payload);
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
				errorHandler.handleApplicationError(
					"barcode",
					"Invalid barcode data",
					"medium",
				);
				resetEntryData();
				return;
			}
			updateScanData(onecard); // Show scanned value to user
			// Play success sound for valid barcode
			soundManager.playSuccess();
			// Submit only the onecard value to the backend
			invoke("submit_barcode_entry", { onecard });
		} catch (error) {
			console.error("Submit error:", error);
			const errorMsg =
				error instanceof Error ? error.message : "Unknown barcode error";
			errorHandler.handleApplicationError("barcode", errorMsg, "high");
		}
		resetEntryData();
	});

	listen("magtek-data", (event) => {
		try {
			console.log("MagTek swipe:", event.payload);
			const swipeData = event.payload as swipeData;
			updateSwipeData(swipeData); // Show swipe data to user
			// Play success sound for valid swipe
			soundManager.playSuccess();
			// Submit the swipe data to the backend
			invoke("submit_swipe_entry", {
				name: swipeData.name,
				onecard: swipeData.onecard,
			});
		} catch (error) {
			console.error("Submit error:", error);
			const errorMsg =
				error instanceof Error ? error.message : "Unknown MagTek error";
			errorHandler.handleApplicationError("magtek", errorMsg, "high");
		}
		resetEntryData();
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
		} else if (status === "error") {
			const errorMsg = error || `${device} device error`;
			errorHandler.handleApplicationError(device, errorMsg, "medium");
		} else if (status === "connecting") {
			console.log(`${device} device attempting to connect...`);
		}
	});

	// Periodically check device status (every 30 seconds)
	setInterval(checkDeviceStatus, 30000);
}

// Update device status display in the UI
function updateDeviceStatusDisplay(status: DeviceStatusResponse) {
	updateDeviceStatusIndicator("barcode", status.barcode.connected ? "connected" : "disconnected");
	updateDeviceStatusIndicator("msr", status.msr.connected ? "connected" : "disconnected");
}

// Update individual device status indicator
function updateDeviceStatusIndicator(device: "barcode" | "msr", status: string, error?: string) {
	// Create or update device status indicators in the UI
	let indicator = document.getElementById(`${device}-status-indicator`);
	if (!indicator) {
		indicator = document.createElement("div");
		indicator.id = `${device}-status-indicator`;
		indicator.className = "device-status-indicator";
		indicator.style.cssText = `
			position: fixed;
			top: 10px;
			${device === "barcode" ? "right: 10px;" : "right: 60px;"}
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

		default:
			indicator.style.backgroundColor = "#666666";
			indicator.title = `${device} device disconnected`;
			break;
	}
}
