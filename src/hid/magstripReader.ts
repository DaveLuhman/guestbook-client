import { soundManager } from '../sound/soundManager';

const entryDataEl = document.getElementById('entry-data');

export interface swipeData {
  name: string;
  onecard: string;
}

export const updateSwipeData = (payload: swipeData) => {
  if (entryDataEl) {
    // DO NOT set background to green here - wait for successful HTTP response
    // Just show the swipe data to the user while submission is in progress
    entryDataEl.innerHTML = `<div><p>Name: ${payload.name}</p><p>Onecard: ${payload.onecard}</p><p>Submitting...</p></div>`;
    // Play a beep sound for successful swipe detection (device read, not HTTP success)
    soundManager.playBeep(800, 150);
  }
};