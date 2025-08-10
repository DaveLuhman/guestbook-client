import { invoke } from '@tauri-apps/api/core';
import { errorHandler } from './error/errorHandler';
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
let isConfigOpen = false;
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

    // Store original text for potential error recovery
    const originalText = restartApplianceBtn.textContent;

    try {
      // Show user feedback that restart is in progress
      restartApplianceBtn.textContent = 'Restarting...';
      (restartApplianceBtn as HTMLButtonElement).disabled = true;

      // Call the Tauri restart function
      await invoke('restart_appliance');
      console.log('Restart command sent successfully');

      // Show success feedback briefly before restart
      restartApplianceBtn.style.backgroundColor = '#00aa00';

      // Note: The app will restart, so we don't need to close the menu
      // The button will remain in this state until the app restarts
    } catch (error) {
      console.error('Restart failed:', error);
      const errorMsg =
        error instanceof Error ? error.message : 'Restart failed';
      errorHandler.handleApplicationError('system', errorMsg, 'medium');

      // Reset button state on error
      if (restartApplianceBtn) {
        restartApplianceBtn.textContent = originalText;
        (restartApplianceBtn as HTMLButtonElement).disabled = false;
        restartApplianceBtn.style.backgroundColor = '';
      }

      closeMenu();
    }
  });

  // Add test logging button
  const testLoggingBtn = document.getElementById('test-logging-btn');
  testLoggingBtn?.addEventListener('click', async () => {
    console.log('Test Logging clicked');
    soundManager.playBeep(700, 120);
    try {
      await invoke('test_logging');
      console.log('Test logging completed');
    } catch (error) {
      console.error('Test logging failed:', error);
      const errorMsg =
        error instanceof Error ? error.message : 'Test logging failed';
      errorHandler.handleApplicationError('system', errorMsg, 'medium');
    }
    closeMenu();
  });
}

function openMenu() {
  const menuModal = document.getElementById('menu-modal');
  if (menuModal && !isMenuOpen) {
    isMenuOpen = true;
    menuModal.classList.add('active');

    // Focus management for accessibility
    menuModal.focus();

    // Trap focus within the modal
    const focusableElements = menuModal.querySelectorAll('button, [tabindex]:not([tabindex="-1"])');
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    if (firstElement) {
      firstElement.focus();
    }

    // Handle tab key navigation
    menuModal.addEventListener('keydown', (e: KeyboardEvent) => {
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
    });
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
  // Use the generic modal setup
  setupModal('manual-entry-modal', ['manual-entry-btn'], ['close-manual-btn']);

  const numBtns = document.querySelectorAll('.num-btn[data-number]');
  const clearBtn = document.getElementById('clear-btn');
  const submitManualBtn = document.getElementById('submit-manual-btn');
  const oneCardInput = document.getElementById(
    'manual-onecard'
  ) as HTMLInputElement;

  // Add closeMenu call to the openManualEntry function
  const manualEntryBtn = document.getElementById('manual-entry-btn');
  if (manualEntryBtn) {
    manualEntryBtn.addEventListener('click', () => {
      closeMenu();
    });
  }

  // Number button functionality
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
        const errorMsg =
          error instanceof Error
            ? error.message
            : 'Manual entry submission failed';
        errorHandler.handleApplicationError('keypad', errorMsg, 'high');
        showEntryError();
      }
    }
  });
}

// Generic modal setup helper
function setupModal(
  modalId: string,
  openTriggerIds: string[],
  closeTriggerIds: string[]
) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  // Open buttons
  openTriggerIds.forEach(id => {
    const trigger = document.getElementById(id);
    if (trigger) {
      trigger.addEventListener('click', () => {
        if (modalId === 'config-modal') {
          openConfig();
        } else if (modalId === 'manual-entry-modal') {
          openManualEntry();
        }
      });
    }
  });

  // Close buttons + outside click
  const doClose = () => {
    if (modalId === 'config-modal') {
      closeConfig();
    } else if (modalId === 'manual-entry-modal') {
      closeManualEntry();
    }
  };

  closeTriggerIds.forEach(id => {
    const closeBtn = document.getElementById(id);
    if (closeBtn) {
      closeBtn.addEventListener('click', doClose);
    }
  });

  modal.addEventListener('click', (e: MouseEvent) => {
    if (e.target === modal) doClose();
  });
}

// Config modal functionality
function initializeConfig() {
  // Use the generic modal setup
  setupModal('config-modal', ['show-config-btn'], ['close-config-btn']);
}

function openManualEntry() {
  const manualEntryModal = document.getElementById('manual-entry-modal');
  if (manualEntryModal && !isManualEntryOpen) {
    isManualEntryOpen = true;
    manualEntryModal.classList.add('active');

    // Focus management for accessibility
    manualEntryModal.focus();

    // Reset input
    currentOneCardInput = '';
    const oneCardInput = document.getElementById(
      'manual-onecard'
    ) as HTMLInputElement;
    if (oneCardInput) {
      oneCardInput.value = '';
      // Focus the input field
      oneCardInput.focus();
    }

    // Handle escape key
    manualEntryModal.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeManualEntry();
      }
    });
  }
}

function closeManualEntry() {
  const manualEntryModal = document.getElementById('manual-entry-modal');
  if (manualEntryModal && isManualEntryOpen) {
    isManualEntryOpen = false;
    manualEntryModal.classList.remove('active');
    // Reset input
    currentOneCardInput = '';
    const oneCardInput = document.getElementById(
      'manual-onecard'
    ) as HTMLInputElement;
    if (oneCardInput) {
      oneCardInput.value = '';
    }
  }
}

// Config modal management
async function openConfig() {
  const configModal = document.getElementById('config-modal');
  if (configModal && !isConfigOpen) {
    isConfigOpen = true;
    configModal.classList.add('active');

    // Focus management for accessibility
    configModal.focus();

    // Focus the first focusable element
    const firstElement = configModal.querySelector('button') as HTMLElement;
    if (firstElement) {
      firstElement.focus();
    }

    // Handle escape key
    configModal.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeConfig();
      }
    });

    try {
      // Load configuration data
      const config: config = await invoke('get_full_config');
      updateConfigDisplay(config);
    } catch (error) {
      console.error('Failed to load config:', error);
      const errorMsg =
        error instanceof Error ? error.message : 'Failed to load configuration';
      errorHandler.handleApplicationError('config', errorMsg, 'medium');

      // Show error in config fields using the config field map
      Object.values(configFieldMap).forEach(({ id }) => {
        const element = document.getElementById(id);
        if (element) {
          element.textContent = 'Error loading';
        } else {
          console.warn(`Config field element with id '${id}' not found.`);
        }
      });
    }
  }
}

function closeConfig() {
  const configModal = document.getElementById('config-modal');
  if (configModal && isConfigOpen) {
    isConfigOpen = false;
    configModal.classList.remove('active');
  }
}

// Configuration field mapping for cleaner display logic
const configFieldMap: Record<keyof config, {
  id: string;
  transform?: (value: any) => string;
}> = {
  server_url: {
    id: 'config-server-url',
    transform: (v: string) => v || 'Not set'
  },
  server_token: {
    id: 'config-server-token',
    transform: (t: string) => {
      if (!t) return 'Not set';
      // Ensure short tokens are never fully revealed
      if (t.length <= 8) return '***';
      return `${t.substring(0, 4)}...${t.substring(t.length - 4)}`;
    }
  },
  device_id: {
    id: 'config-device-id',
    transform: (v: string) => v || 'Not set'
  },
  device_location: {
    id: 'config-device-location',
    transform: (v: string) => v || 'Not set'
  },
  device_friendly_name: {
    id: 'config-device-name',
    transform: (v: string) => v || 'Not set'
  },
  first_run: {
    id: 'config-first-run',
    transform: (v: boolean) => v ? 'Yes' : 'No'
  },
};

function updateConfigDisplay(config: config) {
  Object.entries(configFieldMap).forEach(([key, { id, transform }]) => {
    const element = document.getElementById(id);
    if (!element) {
      console.warn(`Config field element with id '${id}' not found.`);
      return;
    }

    const rawValue = (config as any)[key];
    element.textContent = transform ? transform(rawValue) : String(rawValue);
  });
}

function showEntrySuccess() {
  // Update the main display to show success
  const entryData = document.getElementById('entry-data');
  if (entryData) {
    entryData.innerHTML = '<p>Entry submitted successfully!</p>';
    // Change screen color to green for success using CSS class
    document.body.classList.add('success-state');
    // Reset after 3 seconds
    setTimeout(() => {
      entryData.innerHTML =
        '<p>Swipe your card or scan your barcode to record an entry...</p>';
      document.body.classList.remove('success-state');
    }, 3000);
  }
}

function showEntryError() {
  // Update the main display to show error
  const entryData = document.getElementById('entry-data');
  if (entryData) {
    entryData.innerHTML = '<p>Error submitting entry. Please try again.</p>';
    // Change screen color to red for error using CSS class
    document.body.classList.add('error-state');
    // Reset after 3 seconds
    setTimeout(() => {
      entryData.innerHTML =
        '<p>Swipe your card or scan your barcode to record an entry...</p>';
      document.body.classList.remove('error-state');
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
      const errorMsg = e instanceof Error ? e.message : 'Heartbeat failed';
      errorHandler.handleApplicationError('network', errorMsg, 'medium');
    }
    scheduleHeartbeat(); // Schedule next heartbeat
  }, interval);
}

(async () => {
  const config: config = await invoke('get_full_config');
  console.log(config);
  if (config.first_run) {
    await invoke('first_run_trigger');
  }
  await startHIDManager();

  // Initialize menu functionality
  initializeMenu();
  initializeManualEntry(); // Initialize manual entry functionality
  initializeConfig(); // Initialize config modal functionality

  // Heartbeat cron task: every 10 +/- 5 minutes
  scheduleHeartbeat();
})();
