import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { updateScanData } from './barcodeScanner';
import { type swipeData, updateSwipeData } from './magstripReader';
import { soundManager } from '../sound/soundManager';
import { errorHandler } from '../error/errorHandler';

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

export async function startHIDManager() {
  try {
    await invoke('start_barcode_listener');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Barcode Scanner not found';
    errorHandler.handleApplicationError('barcode', errorMsg, 'medium');
    setTimeout(() => {
      resetEntryData();
    }, 10000);
  }
  try {
    await invoke('start_magtek_listener');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'MagTek Reader not found';
    errorHandler.handleApplicationError('magtek', errorMsg, 'medium');
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
        errorHandler.handleApplicationError('barcode', 'Invalid barcode data', 'medium');
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
      const errorMsg = error instanceof Error ? error.message : 'Unknown barcode error';
      errorHandler.handleApplicationError('barcode', errorMsg, 'high');
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
      const errorMsg = error instanceof Error ? error.message : 'Unknown MagTek error';
      errorHandler.handleApplicationError('magtek', errorMsg, 'high');
    }
    resetEntryData();
  });
}
