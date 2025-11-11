import { soundManager } from '../sound/soundManager';

const entryDataEl = document.getElementById('entry-data');

export const updateScanData = (payload: string) => {
  if (entryDataEl) {
    // DO NOT set background to green here - wait for successful HTTP response
    // Just show the scanned data to the user while submission is in progress
    const container = document.createElement('div');
    container.className = 'entry-data-container';

    const onecardP = document.createElement('p');
    onecardP.textContent = `Onecard: ${payload}`;
    container.appendChild(onecardP);

    const submittingP = document.createElement('p');
    submittingP.textContent = 'Submitting...';
    container.appendChild(submittingP);

    entryDataEl.textContent = '';
    entryDataEl.appendChild(container);
    // Play a beep sound for successful scan detection (device read, not HTTP success)
    soundManager.playBeep(800, 150);
  }
};
