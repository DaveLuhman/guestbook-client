import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const entryDataEl = document.querySelector('#entry-data');

if (entryDataEl) {
  entryDataEl.textContent =
    'Swipe your card, scan your barcode to record an entry...';
}

const resetEntryData = () => {
  const body = document.body;
  body.style.backgroundColor = "#00447C";
  if (entryDataEl) {
    entryDataEl.innerHTML = `<p>Swipe your card, scan your barcode to record an entry...</p>`;
  }
};

const updateSwipeData = (payload: any) => {
  if (entryDataEl) {
    const body = document.body;
    body.style.backgroundColor = "green";
    entryDataEl.innerHTML = `<div class="entry-data-container"><p>Name: ${payload.name}</p><p>Onecard: ${payload.onecard}</p></div>`;
  }
  setTimeout(() => resetEntryData(), 10000);
};

const updateScanData = (payload: any) => {
  if (entryDataEl) {
    const body = document.body;
    body.style.backgroundColor = "green";
    entryDataEl.innerHTML = `<div class="entry-data-container"><p>Onecard: ${payload}</p></div>`;
  }
  setTimeout(() => resetEntryData(), 10000);
};

(async () => {
  await invoke('start_barcode_listener');
  await invoke('start_magtek_listener');

  listen('barcode-data', (event) => {
    console.log('Scanned:', event); // should be digits-only
    updateScanData(event.payload);
  });

  listen('magtek-data', (event) => {
    console.log('MagTek card:', event.payload);
    updateSwipeData(event.payload);
  });

  listen('hid-error', (event) => {
    console.error('Scan error:', event.payload);
  });
})();
