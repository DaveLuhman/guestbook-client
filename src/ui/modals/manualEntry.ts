import { invoke } from '@tauri-apps/api/core';
import { errorHandler } from '../../error/errorHandler';
import { soundManager } from '../../sound/soundManager';
import type { Config } from '../../types/config';
import { showEntryError, showEntrySuccess } from '../entryFeedback';
import { setupModal } from './modalUtils';

let isManualEntryOpen = false;
let currentOneCardInput = '';

function openManualEntry(): void {
  const manualEntryModal = document.getElementById('manual-entry-modal');
  if (!manualEntryModal || isManualEntryOpen) return;

  isManualEntryOpen = true;
  manualEntryModal.classList.add('active');
  manualEntryModal.focus();

  currentOneCardInput = '';
  const oneCardInput = document.getElementById(
    'manual-onecard'
  ) as HTMLInputElement;
  if (oneCardInput) {
    oneCardInput.value = '';
    oneCardInput.focus();
  }

  manualEntryModal.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeManualEntry();
  });
}

export function closeManualEntry(): void {
  const manualEntryModal = document.getElementById('manual-entry-modal');
  if (manualEntryModal && isManualEntryOpen) {
    isManualEntryOpen = false;
    manualEntryModal.classList.remove('active');
    currentOneCardInput = '';
    const oneCardInput = document.getElementById(
      'manual-onecard'
    ) as HTMLInputElement;
    if (oneCardInput) oneCardInput.value = '';
  }
}

export function initializeManualEntry(): void {
  setupModal(
    'manual-entry-modal',
    ['manual-entry-btn'],
    ['close-manual-btn'],
    openManualEntry,
    closeManualEntry
  );

  const numBtns = document.querySelectorAll('.num-btn[data-number]');
  const clearBtn = document.getElementById('clear-btn');
  const submitManualBtn = document.getElementById('submit-manual-btn');
  const oneCardInput = document.getElementById(
    'manual-onecard'
  ) as HTMLInputElement;

  numBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const number = (btn as HTMLElement).getAttribute('data-number');
      if (number && currentOneCardInput.length < 7) {
        currentOneCardInput += number;
        oneCardInput.value = currentOneCardInput;
        soundManager.playNumberBeep();
      }
    });
  });

  clearBtn?.addEventListener('click', () => {
    currentOneCardInput = '';
    oneCardInput.value = '';
    soundManager.playBeep(500, 100);
  });

  submitManualBtn?.addEventListener('click', async () => {
    if (!currentOneCardInput.trim()) return;

    try {
      await invoke('submit_manual_entry', { onecard: currentOneCardInput });
      soundManager.playSuccess();
      showEntrySuccess();
      closeManualEntry();
    } catch (error) {
      console.error('Manual entry submission failed:', error);
      const errorMsg =
        error instanceof Error
          ? error.message
          : 'Manual entry submission failed';

      if (
        errorMsg.includes('Device Orphaned') ||
        errorMsg.includes('orphaned')
      ) {
        errorHandler.handleApplicationError('keypad', errorMsg, 'high');
        try {
          const config: Config = await invoke('get_full_config');
          if (!config.first_run) {
            console.log(
              'Device orphaned during entry - clearing state and triggering re-registration'
            );
            await invoke('clear_orphaned_state_command');
            await invoke('first_run_trigger');
            return;
          }
        } catch (recoveryError) {
          console.error('Failed to recover from orphaned state:', recoveryError);
        }
      }

      errorHandler.handleApplicationError('keypad', errorMsg, 'high');
      showEntryError();
    }
  });
}
