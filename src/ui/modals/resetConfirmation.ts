import { invoke } from '@tauri-apps/api/core';
import { errorHandler } from '../../error/errorHandler';

let isResetConfirmationOpen = false;
const resetModalListeners: {
  element: HTMLElement;
  event: string;
  handler: EventListener | ((e: KeyboardEvent) => void);
}[] = [];

function closeResetConfirmation(): void {
  const resetModal = document.getElementById('reset-confirmation-modal');
  if (!resetModal || !isResetConfirmationOpen) return;

  for (const { element, event, handler } of resetModalListeners) {
    element.removeEventListener(event, handler as EventListener);
  }
  resetModalListeners.length = 0;

  isResetConfirmationOpen = false;
  resetModal.classList.remove('active');
}

async function handleDeviceReset(): Promise<void> {
  const confirmBtn = document.getElementById('confirm-reset-btn');
  if (!confirmBtn) return;

  const originalText = confirmBtn.textContent;

  try {
    (confirmBtn as HTMLButtonElement).textContent = 'Resetting...';
    (confirmBtn as HTMLButtonElement).disabled = true;

    await invoke('reset_device_command');
    console.log('Device reset completed successfully');

    (confirmBtn as HTMLButtonElement).style.backgroundColor = '#00aa00';
    (confirmBtn as HTMLButtonElement).textContent = 'Reset Complete';

    setTimeout(closeResetConfirmation, 2000);
  } catch (error) {
    console.error('Device reset failed:', error);
    const errorMsg =
      error instanceof Error ? error.message : 'Device reset failed';

    if (errorMsg.includes('403') || errorMsg.includes('orphaned')) {
      console.log(
        'Device was orphaned, but local reset completed successfully'
      );
      (confirmBtn as HTMLButtonElement).style.backgroundColor = '#00aa00';
      (confirmBtn as HTMLButtonElement).textContent = 'Reset Complete';
      setTimeout(closeResetConfirmation, 2000);
      return;
    }

    errorHandler.handleApplicationError('system', errorMsg, 'medium');

    (confirmBtn as HTMLButtonElement).textContent = originalText;
    (confirmBtn as HTMLButtonElement).disabled = false;
    (confirmBtn as HTMLButtonElement).style.backgroundColor = '';
  }
}

export function openResetConfirmation(): void {
  const resetModal = document.getElementById('reset-confirmation-modal');
  if (!resetModal || isResetConfirmationOpen) return;

  isResetConfirmationOpen = true;
  resetModal.classList.add('active');
  resetModal.focus();

  const closeBtn = document.getElementById('close-reset-confirmation-btn');
  const cancelBtn = document.getElementById('cancel-reset-btn');
  const confirmBtn = document.getElementById('confirm-reset-btn');

  if (closeBtn) {
    const handler = () => closeResetConfirmation();
    closeBtn.addEventListener('click', handler);
    resetModalListeners.push({ element: closeBtn, event: 'click', handler });
  }

  if (cancelBtn) {
    const handler = () => closeResetConfirmation();
    cancelBtn.addEventListener('click', handler);
    resetModalListeners.push({ element: cancelBtn, event: 'click', handler });
  }

  if (confirmBtn) {
    const handler = () => void handleDeviceReset();
    confirmBtn.addEventListener('click', handler);
    resetModalListeners.push({ element: confirmBtn, event: 'click', handler });
  }

  const outsideClickHandler = (e: Event) => {
    if (e.target === resetModal) closeResetConfirmation();
  };
  resetModal.addEventListener('click', outsideClickHandler);
  resetModalListeners.push({
    element: resetModal,
    event: 'click',
    handler: outsideClickHandler,
  });

  const escapeHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeResetConfirmation();
  };
  resetModal.addEventListener('keydown', escapeHandler);
  resetModalListeners.push({
    element: resetModal,
    event: 'keydown',
    handler: escapeHandler,
  });
}
