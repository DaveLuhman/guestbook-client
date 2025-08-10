import { invoke } from '@tauri-apps/api/core';
import { startHIDManager } from './hid/HIDManager';
import { soundManager } from './sound/soundManager';

interface config {
  server_url: string;
  server_token: string;
  device_id: string;
  device_location: string;
  device_friendly_name: string;
  first_run: boolean;
}

// Menu state management
let menuPressTimer: NodeJS.Timeout | null = null;
let isMenuOpen = false;

// Manual entry state management
let isManualEntryOpen = false;
let currentOneCardInput = '';

// Menu functionality
function initializeMenu() {
  const menuTrigger = document.getElementById('menu-trigger');
  const menuModal = document.getElementById('menu-modal');
  const manualEntryBtn = document.getElementById('manual-entry-btn');
  const showConfigBtn = document.getElementById('show-config-btn');
  const restartApplianceBtn = document.getElementById('restart-appliance-btn');

  if (!menuTrigger || !menuModal) return;

  // 3-second press detection
  menuTrigger.addEventListener('mousedown', () => {
    menuPressTimer = setTimeout(() => {
      openMenu();
    }, 3000);
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

  // Touch events for mobile/touchscreen
  menuTrigger.addEventListener('touchstart', (e) => {
    e.preventDefault();
    menuPressTimer = setTimeout(() => {
      openMenu();
    }, 3000);
  });

  menuTrigger.addEventListener('touchend', () => {
    if (menuPressTimer) {
      clearTimeout(menuPressTimer);
      menuPressTimer = null;
    }
  });

  // Close menu when clicking outside buttons
  menuModal.addEventListener('click', (e) => {
    if (e.target === menuModal) {
      closeMenu();
    }
  });

  // Button handlers
  manualEntryBtn?.addEventListener('click', () => {
    console.log('Manual Entry clicked');
    soundManager.playBeep(700, 120);
    // TODO: Implement manual entry functionality
    closeMenu();
  });

  showConfigBtn?.addEventListener('click', () => {
    console.log('Show Config clicked');
    soundManager.playBeep(700, 120);
    // TODO: Implement config display functionality
    closeMenu();
  });

  restartApplianceBtn?.addEventListener('click', () => {
    console.log('Restart Appliance clicked');
    soundManager.playBeep(700, 120);
    // TODO: Implement restart functionality
    closeMenu();
  });
}

function openMenu() {
  const menuModal = document.getElementById('menu-modal');
  if (menuModal && !isMenuOpen) {
    isMenuOpen = true;
    menuModal.classList.add('active');
  }
}

function closeMenu() {
  const menuModal = document.getElementById('menu-modal');
  if (menuModal && isMenuOpen) {
    isMenuOpen = false;
    menuModal.classList.remove('active');
  }
}

// Manual entry functionality
function initializeManualEntry() {
  const manualEntryBtn = document.getElementById('manual-entry-btn');
  const manualEntryModal = document.getElementById('manual-entry-modal');
  const closeManualBtn = document.getElementById('close-manual-btn');
  const numBtns = document.querySelectorAll('.num-btn[data-number]');
  const clearBtn = document.getElementById('clear-btn');
  const submitManualBtn = document.getElementById('submit-manual-btn');
  const oneCardInput = document.getElementById('manual-onecard') as HTMLInputElement;

  if (!manualEntryBtn || !manualEntryModal || !closeManualBtn) return;

  // Open manual entry modal
  manualEntryBtn.addEventListener('click', () => {
    openManualEntry();
    closeMenu();
  });

  // Close manual entry modal
  closeManualBtn.addEventListener('click', () => {
    closeManualEntry();
  });

  // Close when clicking outside
  manualEntryModal.addEventListener('click', (e) => {
    if (e.target === manualEntryModal) {
      closeManualEntry();
    }
  });

  // Number button functionality
  numBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const number = (btn as HTMLElement).getAttribute('data-number');
      if (number && currentOneCardInput.length < 20) {
        currentOneCardInput += number;
        oneCardInput.value = currentOneCardInput;
        soundManager.playNumberBeep();
      }
    });
  });

  // Clear button functionality
  clearBtn?.addEventListener('click', () => {
    currentOneCardInput = '';
    oneCardInput.value = '';
    soundManager.playBeep(500, 100);
  });

  // Submit button functionality
  submitManualBtn?.addEventListener('click', async () => {
    if (currentOneCardInput.trim()) {
      try {
        await invoke('submit_manual_entry', { onecard: currentOneCardInput });
        // Show success message
        soundManager.playSuccess();
        showEntrySuccess();
        closeManualEntry();
      } catch (error) {
        console.error('Manual entry submission failed:', error);
        // Show error message
        soundManager.playError();
        showEntryError();
      }
    }
  });
}

function openManualEntry() {
  const manualEntryModal = document.getElementById('manual-entry-modal');
  if (manualEntryModal && !isManualEntryOpen) {
    isManualEntryOpen = true;
    manualEntryModal.classList.add('active');
    // Reset input
    currentOneCardInput = '';
    const oneCardInput = document.getElementById('manual-onecard') as HTMLInputElement;
    if (oneCardInput) {
      oneCardInput.value = '';
    }
  }
}

function closeManualEntry() {
  const manualEntryModal = document.getElementById('manual-entry-modal');
  if (manualEntryModal && isManualEntryOpen) {
    isManualEntryOpen = false;
    manualEntryModal.classList.remove('active');
    // Reset input
    currentOneCardInput = '';
    const oneCardInput = document.getElementById('manual-onecard') as HTMLInputElement;
    if (oneCardInput) {
      oneCardInput.value = '';
    }
  }
}

function showEntrySuccess() {
  // Update the main display to show success
  const entryData = document.getElementById('entry-data');
  if (entryData) {
    entryData.innerHTML = '<p>Entry submitted successfully!</p>';
    // Reset after 3 seconds
    setTimeout(() => {
      entryData.innerHTML = '<p>Swipe your card or scan your barcode to record an entry...</p>';
    }, 3000);
  }
}

function showEntryError() {
  // Update the main display to show error
  const entryData = document.getElementById('entry-data');
  if (entryData) {
    entryData.innerHTML = '<p>Error submitting entry. Please try again.</p>';
    // Reset after 3 seconds
    setTimeout(() => {
      entryData.innerHTML = '<p>Swipe your card or scan your barcode to record an entry...</p>';
    }, 3000);
  }
}

async function scheduleHeartbeat() {
  // Random interval between 5 and 15 minutes (in ms)
  const min = 5 * 60 * 1000;
  const max = 15 * 60 * 1000;
  const interval = Math.floor(Math.random() * (max - min + 1)) + min;
  setTimeout(async () => {
    try {
      await invoke('send_heartbeat_command');
      // Optionally, log success or update UI
    } catch (e) {
      // Optionally, log error or notify user
      console.error('Heartbeat failed', e);
    }
    scheduleHeartbeat(); // Schedule next heartbeat
  }, interval);
}

(async () => {
  const config:config = await invoke('get_full_config');
  console.log(config);
  if (config.first_run) {
    await invoke('first_run_trigger')
  }
  await startHIDManager();

  // Initialize menu functionality
  initializeMenu();
  initializeManualEntry(); // Initialize manual entry functionality

  // Heartbeat cron task: every 10 +/- 5 minutes
  scheduleHeartbeat();
})();
