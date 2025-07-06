import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { updateScanData } from './barcodeScanner';
import { type swipeData, updateSwipeData } from './magstripReader';

const entryDataEl = document.querySelector('#entry-data');

if (entryDataEl) {
  entryDataEl.textContent =
    'Swipe your card, scan your barcode to record an entry...';
}

const resetEntryData = () => {
  setTimeout(() => {
    const body = document.body;
    body.style.backgroundColor = '#00447C';
    if (entryDataEl) {
      entryDataEl.innerHTML = `<p>Swipe your card, scan your barcode to record an entry...</p>`;
    }
  }, 3000);
};

const displayHidError = (error: string) => {
  const body = document.body;
  body.style.backgroundColor = '#c40000';
  if (entryDataEl) {
    entryDataEl.innerHTML = `<p>Error: ${error}</p>`;
  }
};

export async function startHIDManager() {
  try {
    await invoke('start_barcode_listener');
  } catch {
    displayHidError('Barcode Scanner not found');
    setTimeout(() => {
      resetEntryData();
    }, 10000);
  }
  try {
    await invoke('start_magtek_listener');
  } catch {
    displayHidError('MagTek Reader not found');
    setTimeout(() => {
      resetEntryData();
    }, 10000);
  }

  listen('barcode-data', (event) => {
    console.log('Scanned:', event.payload);
    updateScanData(event.payload as string);
    resetEntryData();
  });

  listen('magtek-data', (event) => {
    try {
      console.log('MagTek card:', event.payload);
      if (
        typeof event.payload === 'object' &&
        event.payload !== null &&
        'name' in event.payload &&
        'onecard' in event.payload
      ) {
        updateSwipeData(event.payload as swipeData);
        invoke('submit_swipe_entry', {
          name: (event.payload as swipeData).name,
          onecard: (event.payload as swipeData).onecard,
        });
      } else {
        console.error('Invalid MagTek payload:', event.payload);
        displayHidError('Invalid MagTek card data');
      }
    } catch (error) {
      console.error('Submit error:', error);
      displayHidError(error as string);
    }
    resetEntryData();
  });
}
