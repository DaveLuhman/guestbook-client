import { invoke } from '@tauri-apps/api/core';
import { errorHandler } from '../error/errorHandler';
import { soundManager } from '../sound/soundManager';
import { openConfig } from './modals/config';
import { openResetConfirmation } from './modals/resetConfirmation';

let menuPressTimer: ReturnType<typeof setTimeout> | null = null;
let isMenuOpen = false;

function openMenu(): void {
  const menuModal = document.getElementById('menu-modal');
  if (!menuModal || isMenuOpen) return;

  isMenuOpen = true;
  menuModal.classList.add('active');
  menuModal.focus();

  const focusableElements = menuModal.querySelectorAll(
    'button, [tabindex]:not([tabindex="-1"])'
  );
  const firstElement = focusableElements[0] as HTMLElement;
  const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

  if (firstElement) {
    firstElement.focus();
  }

  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
    if (e.key === 'Escape') {
      closeMenu();
    }
  };
  menuModal.addEventListener('keydown', keyHandler);
}

function closeMenu(): void {
  const menuModal = document.getElementById('menu-modal');
  if (menuModal && isMenuOpen) {
    isMenuOpen = false;
    menuModal.classList.remove('active');
  }
}

export function initializeMenu(): void {
  const menuTrigger = document.getElementById('menu-trigger');
  const menuModal = document.getElementById('menu-modal');
  const manualEntryBtn = document.getElementById('manual-entry-btn');
  const showConfigBtn = document.getElementById('show-config-btn');
  const resetDeviceBtn = document.getElementById('reset-device-btn');
  const restartApplianceBtn = document.getElementById('restart-appliance-btn');

  if (!menuTrigger || !menuModal) return;

  menuTrigger.addEventListener('mousedown', () => {
    menuPressTimer = setTimeout(() => openMenu(), 3000);
  });

  menuTrigger.addEventListener('mouseup', () => {
    if (menuPressTimer) {
      clearTimeout(menuPressTimer);
      menuPressTimer = null;
    }
  });

  menuTrigger.addEventListener('mouseleave', () => {
    if (menuPressTimer) {
      clearTimeout(menuPressTimer);
      menuPressTimer = null;
    }
  });

  menuTrigger.addEventListener('touchstart', (e) => {
    e.preventDefault();
    menuPressTimer = setTimeout(() => openMenu(), 3000);
  });

  menuTrigger.addEventListener('touchend', () => {
    if (menuPressTimer) {
      clearTimeout(menuPressTimer);
      menuPressTimer = null;
    }
  });

  menuModal.addEventListener('click', (e) => {
    if (e.target === menuModal) closeMenu();
  });

  manualEntryBtn?.addEventListener('click', () => {
    console.log('Manual Entry clicked');
    soundManager.playBeep(700, 120);
    closeMenu();
  });

  showConfigBtn?.addEventListener('click', async () => {
    console.log('Show Config clicked');
    soundManager.playBeep(700, 120);
    closeMenu();
    await openConfig();
  });

  restartApplianceBtn?.addEventListener('click', async () => {
    console.log('Restart Appliance clicked');
    soundManager.playBeep(700, 120);

    const originalText = restartApplianceBtn.textContent;

    try {
      (restartApplianceBtn as HTMLButtonElement).textContent = 'Restarting...';
      (restartApplianceBtn as HTMLButtonElement).disabled = true;

      await invoke('restart_appliance');
      console.log('Restart command sent successfully');

      (restartApplianceBtn as HTMLButtonElement).style.backgroundColor = '#00aa00';
    } catch (error) {
      console.error('Restart failed:', error);
      const errorMsg =
        error instanceof Error ? error.message : 'Restart failed';
      errorHandler.handleApplicationError('system', errorMsg, 'medium');

      if (restartApplianceBtn) {
        (restartApplianceBtn as HTMLButtonElement).textContent = originalText;
        (restartApplianceBtn as HTMLButtonElement).disabled = false;
        (restartApplianceBtn as HTMLButtonElement).style.backgroundColor = '';
      }
      closeMenu();
    }
  });

  resetDeviceBtn?.addEventListener('click', () => {
    console.log('Reset Device clicked');
    soundManager.playBeep(700, 120);
    closeMenu();
    openResetConfirmation();
  });
}
