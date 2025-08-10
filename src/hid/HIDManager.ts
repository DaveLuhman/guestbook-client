import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { updateScanData } from './barcodeScanner';
import { type swipeData, updateSwipeData } from './magstripReader';
import { soundManager } from '../sound/soundManager';

const entryDataEl = document.querySelector('#entry-data');
export const defaultMessage = 'Swipe your card or scan your barcode to record an entry...';

if (entryDataEl) {
  entryDataEl.innerHTML = `<p>${defaultMessage}</p>`;
}

const resetEntryData = () => {
  setTimeout(() => {
    const body = document.body;
    body.style.backgroundColor = '#00447C';
    if (entryDataEl) {
      entryDataEl.innerHTML = `<p>${defaultMessage}</p>`;
    }
  }, 3000);
};

const displayHidError = (error: string) => {
  const body = document.body;
  body.style.backgroundColor = '#c40000';
  if (entryDataEl) {
    entryDataEl.innerHTML = `<p>Error: ${error}</p>`;
  }
  // Play error sound
  soundManager.playError();
};

export async function startHIDManager() {
  try {
    await invoke('start_barcode_listener');
  } catch {
    displayHidError('Barcode Scanner not found');
    // Play error sound for device not found
    soundManager.playError();
    setTimeout(() => {
      resetEntryData();
    }, 10000);
  }
  try {
    await invoke('start_magtek_listener');
  } catch {
    displayHidError('MagTek Reader not found');
    // Play error sound for device not found
    soundManager.playError();
    setTimeout(() => {
      resetEntryData();
    }, 10000);
  }

  listen('barcode-data', (event) => {
    try {
      console.log('Barcode scanned:', event.payload);
      // For barcode, expect event.payload to be the 7-digit onecard number (string or number)
      let onecard = '';
      if (typeof event.payload === 'string' && /^\d{7}$/.test(event.payload)) {
        onecard = event.payload;
      } else if (typeof event.payload === 'number' && event.payload.toString().length === 7) {
        onecard = event.payload.toString();
      } else {
        console.error('Invalid barcode payload:', event.payload);
        displayHidError('Invalid barcode data');
        resetEntryData();
        return;
      }
      updateScanData(onecard); // Show scanned value to user
      // Play success sound for valid barcode
      soundManager.playSuccess();
      // Submit only the onecard value to the backend
      invoke('submit_barcode_entry', { onecard });
    } catch (error) {
      console.error('Submit error:', error);
      displayHidError(error as string);
    }
    resetEntryData();
  });

  listen('magtek-data', (event) => {
    try {
      console.log('MagTek swipe:', event.payload);
      const swipeData = event.payload as swipeData;
      updateSwipeData(swipeData); // Show swipe data to user
      // Play success sound for valid swipe
      soundManager.playSuccess();
      // Submit the swipe data to the backend
      invoke('submit_swipe_entry', { name: swipeData.name, onecard: swipeData.onecard });
    } catch (error) {
      console.error('Submit error:', error);
      displayHidError(error as string);
    }
    resetEntryData();
  });
}
