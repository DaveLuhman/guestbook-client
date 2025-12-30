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
    const container = document.createElement('div');

    const nameP = document.createElement('p');
    nameP.textContent = `Name: ${payload.name}`;
    container.appendChild(nameP);

    const onecardP = document.createElement('p');
    onecardP.textContent = `Onecard: ${payload.onecard}`;
    container.appendChild(onecardP);

    const submittingP = document.createElement('p');
    submittingP.textContent = 'Submitting...';
    container.appendChild(submittingP);

    entryDataEl.textContent = '';
    entryDataEl.appendChild(container);
    // Play a beep sound for successful swipe detection (device read, not HTTP success)
    soundManager.playBeep(800, 150);
  }
};
