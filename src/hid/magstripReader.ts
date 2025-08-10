import { soundManager } from '../sound/soundManager';

const entryDataEl = document.getElementById('entry-data');

export interface swipeData {
  name: string;
  onecard: string;
}

export const updateSwipeData = (payload: swipeData) => {
  if (entryDataEl) {
    const body = document.body;
    body.style.backgroundColor = "green";
    entryDataEl.innerHTML = `<div><p>Name: ${payload.name}</p><p>Onecard: ${payload.onecard}</p></div>`;
    // Play a beep sound for successful swipe detection
    soundManager.playBeep(800, 150);
  }
};