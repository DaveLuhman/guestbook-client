import { soundManager } from '../sound/soundManager';

const entryDataEl = document.getElementById('entry-data');

export const updateScanData = (payload: string) => {
  if (entryDataEl) {
    const body = document.body;
    body.style.backgroundColor = "green";
    entryDataEl.innerHTML = `<div class="entry-data-container"><p>Onecard: ${payload}</p></div>`;
    // Play a beep sound for successful scan detection
    soundManager.playBeep(800, 150);
  }
};
