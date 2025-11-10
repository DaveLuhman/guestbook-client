import { soundManager } from '../sound/soundManager';

const entryDataEl = document.getElementById('entry-data');

export const updateScanData = (payload: string) => {
  if (entryDataEl) {
    // DO NOT set background to green here - wait for successful HTTP response
    // Just show the scanned data to the user while submission is in progress
    entryDataEl.innerHTML = `<div class="entry-data-container"><p>Onecard: ${payload}</p><p>Submitting...</p></div>`;
    // Play a beep sound for successful scan detection (device read, not HTTP success)
    soundManager.playBeep(800, 150);
  }
};
