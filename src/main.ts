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

    if (!restartApplianceBtn) return;

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
      restartApplianceBtn.textContent = 'Restarting...';
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
  const oneCardInput = document.getElementById(
    'manual-onecard'
  ) as HTMLInputElement;

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

// Config modal functionality
function initializeConfig() {
  const configModal = document.getElementById('config-modal');
  const closeConfigBtn = document.getElementById('close-config-btn');

  if (!configModal || !closeConfigBtn) return;

  // Close config modal
  closeConfigBtn.addEventListener('click', () => {
    closeConfig();
  });

  // Close when clicking outside
  configModal.addEventListener('click', (e) => {
    if (e.target === configModal) {
      closeConfig();
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
    const oneCardInput = document.getElementById(
      'manual-onecard'
    ) as HTMLInputElement;
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

    try {
      // Load configuration data
      const config: config = await invoke('get_full_config');
      updateConfigDisplay(config);
    } catch (error) {
      console.error('Failed to load config:', error);
      const errorMsg =
        error instanceof Error ? error.message : 'Failed to load configuration';
      errorHandler.handleApplicationError('config', errorMsg, 'medium');

      // Show error in config fields
      const configFields = [
        'server-url',
        'device-id',
        'device-location',
        'device-name',
        'first-run',
        'server-token',
      ];
      configFields.forEach((fieldId) => {
        const element = document.getElementById(`config-${fieldId}`);
        if (element) {
          element.textContent = 'Error loading';
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

function updateConfigDisplay(config: config) {
  // Update server URL
  const serverUrlElement = document.getElementById('config-server-url');
  if (serverUrlElement) {
    serverUrlElement.textContent = config.server_url || 'Not set';
  }

  // Update device ID
  const deviceIdElement = document.getElementById('config-device-id');
  if (deviceIdElement) {
    deviceIdElement.textContent = config.device_id || 'Not set';
  }

  // Update device location
  const deviceLocationElement = document.getElementById(
    'config-device-location'
  );
  if (deviceLocationElement) {
    deviceLocationElement.textContent = config.device_location || 'Not set';
  }

  // Update device name
  const deviceNameElement = document.getElementById('config-device-name');
  if (deviceNameElement) {
    deviceNameElement.textContent = config.device_friendly_name || 'Not set';
  }

  // Update first run status
  const firstRunElement = document.getElementById('config-first-run');
  if (firstRunElement) {
    firstRunElement.textContent = config.first_run ? 'Yes' : 'No';
  }

  // Update server token (masked for security)
  const serverTokenElement = document.getElementById('config-server-token');
  if (serverTokenElement) {
    if (config.server_token) {
      const token = config.server_token as string;
      const maskedToken =
        token.length > 8
          ? `${token.substring(0, 4)}...${token.substring(token.length - 4)}`
          : '***';
      serverTokenElement.textContent = maskedToken;
    } else {
      serverTokenElement.textContent = 'Not set';
    }
  }
}

function showEntrySuccess() {
  // Update the main display to show success
  const entryData = document.getElementById('entry-data');
  if (entryData) {
    entryData.innerHTML = '<p>Entry submitted successfully!</p>';
    // Change screen color to green for success
    document.body.style.backgroundColor = 'green';
    // Reset after 3 seconds
    setTimeout(() => {
      entryData.innerHTML =
        '<p>Swipe your card or scan your barcode to record an entry...</p>';
      document.body.style.backgroundColor = '#00447c';
    }, 3000);
  }
}

function showEntryError() {
  // Update the main display to show error
  const entryData = document.getElementById('entry-data');
  if (entryData) {
    entryData.innerHTML = '<p>Error submitting entry. Please try again.</p>';
    // Change screen color to red for error
    document.body.style.backgroundColor = '#cc0000';
    // Reset after 3 seconds
    setTimeout(() => {
      entryData.innerHTML =
        '<p>Swipe your card or scan your barcode to record an entry...</p>';
      document.body.style.backgroundColor = '#00447c';
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
