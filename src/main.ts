/** biome-ignore-all lint/suspicious/noExplicitAny: it's a display transformation, typing doesn't matter */
import { invoke } from '@tauri-apps/api/core';
import { errorHandler } from './error/errorHandler';
import { startHIDManager } from './hid/HIDManager';
import { soundManager } from './sound/soundManager';
import { initDebugLogger } from './debugLogger';

// Initialize debug logging (only works in debug builds)
initDebugLogger();

interface config {
  server_url: string;
  server_token: string;
  device_id: string;
  device_location: string;
  device_friendly_name: string;
  first_run: boolean;
  camera_preview_enabled: boolean;
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
  const resetDeviceBtn = document.getElementById('reset-device-btn');
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

  // Reset device button handler
  resetDeviceBtn?.addEventListener('click', () => {
    console.log('Reset Device clicked');
    soundManager.playBeep(700, 120);
    closeMenu();
    openResetConfirmation();
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

        // Check if device is orphaned
        if (errorMsg.includes('Device Orphaned') || errorMsg.includes('orphaned')) {
          errorHandler.handleApplicationError('keypad', errorMsg, 'high');
          // Try to automatically recover by clearing orphaned state and triggering re-registration
          try {
            const config: config = await invoke('get_full_config');
            if (!config.first_run) {
              console.log('Device orphaned during entry - clearing state and triggering re-registration');
              await invoke('clear_orphaned_state_command');
              await invoke('first_run_trigger');
              return; // Exit - first-run screen will handle re-registration
            }
          } catch (recoveryError) {
            console.error('Failed to recover from orphaned state:', recoveryError);
          }
        }

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
      // Load app version
      try {
        const version = await invoke<string>('get_app_version');
        const versionElement = document.getElementById('config-app-version');
        if (versionElement) {
          versionElement.textContent = version;
        }
      } catch (error) {
        console.error('Failed to load app version:', error);
        const versionElement = document.getElementById('config-app-version');
        if (versionElement) {
          versionElement.textContent = 'Error loading';
        }
      }

      // Set runtime environment (dev or release)
      const runtimeEnvElement = document.getElementById('config-runtime-env');
      if (runtimeEnvElement) {
        // In Vite, import.meta.env.DEV is true in dev mode, false in production
        // import.meta.env.MODE is 'development' or 'production'
        // Check for dev mode using Vite's environment variables
        let isDev = false;
        try {
          // Access Vite's env through type assertion
          const env = (import.meta as { env?: { DEV?: boolean; MODE?: string } }).env;
          isDev = env?.DEV === true || env?.MODE === 'development';
        } catch {
          // Fallback: assume production if env is not available
          isDev = false;
        }
        runtimeEnvElement.textContent = isDev ? 'Development' : 'Release';
      }

      // Load configuration data
      const config: config = await invoke('get_full_config');
      updateConfigDisplay(config);

      // Initialize camera preview toggle
      initializeCameraPreviewToggle(config);
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

// Reset device confirmation modal functions
let isResetConfirmationOpen = false;
let resetModalListeners: { element: HTMLElement; event: string; handler: EventListener | ((e: KeyboardEvent) => void) }[] = [];

function openResetConfirmation() {
  const resetModal = document.getElementById('reset-confirmation-modal');
  if (resetModal && !isResetConfirmationOpen) {
    isResetConfirmationOpen = true;
    resetModal.classList.add('active');

    // Focus management for accessibility
    resetModal.focus();

    // Set up event listeners for the confirmation modal
    const closeBtn = document.getElementById('close-reset-confirmation-btn');
    const cancelBtn = document.getElementById('cancel-reset-btn');
    const confirmBtn = document.getElementById('confirm-reset-btn');

    // Close button handler
    if (closeBtn) {
      const handler = () => closeResetConfirmation();
      closeBtn.addEventListener('click', handler);
      resetModalListeners.push({ element: closeBtn, event: 'click', handler });
    }

    // Cancel button handler
    if (cancelBtn) {
      const handler = () => closeResetConfirmation();
      cancelBtn.addEventListener('click', handler);
      resetModalListeners.push({ element: cancelBtn, event: 'click', handler });
    }

    // Confirm button handler
    if (confirmBtn) {
      const handler = async () => {
        await handleDeviceReset();
      };
      confirmBtn.addEventListener('click', handler);
      resetModalListeners.push({ element: confirmBtn, event: 'click', handler });
    }

    // Close on outside click
    const outsideClickHandler = (e: Event) => {
      if (e.target === resetModal) {
        closeResetConfirmation();
      }
    };
    resetModal.addEventListener('click', outsideClickHandler);
    resetModalListeners.push({ element: resetModal, event: 'click', handler: outsideClickHandler });

    // Close on Escape key
    const escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeResetConfirmation();
      }
    };
    resetModal.addEventListener('keydown', escapeHandler);
    resetModalListeners.push({ element: resetModal, event: 'keydown', handler: escapeHandler });
  }
}

function closeResetConfirmation() {
  const resetModal = document.getElementById('reset-confirmation-modal');
  if (resetModal && isResetConfirmationOpen) {
    // Remove all event listeners
    resetModalListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler as EventListener);
    });
    resetModalListeners = [];

    isResetConfirmationOpen = false;
    resetModal.classList.remove('active');
  }
}

async function handleDeviceReset() {
  const confirmBtn = document.getElementById('confirm-reset-btn');
  if (!confirmBtn) return;

  // Store original text for potential error recovery
  const originalText = confirmBtn.textContent;

  try {
    // Show user feedback that reset is in progress
    confirmBtn.textContent = 'Resetting...';
    (confirmBtn as HTMLButtonElement).disabled = true;

    // Call the Tauri reset device function
    await invoke('reset_device_command');
    console.log('Device reset completed successfully');

    // Show success feedback
    confirmBtn.style.backgroundColor = '#00aa00';
    confirmBtn.textContent = 'Reset Complete';

    // Close the confirmation modal after a brief delay
    setTimeout(() => {
      closeResetConfirmation();
    }, 2000);

  } catch (error) {
    console.error('Device reset failed:', error);
    const errorMsg = error instanceof Error ? error.message : 'Device reset failed';

    // Note: Reset should succeed even for orphaned devices (backend handles 403 gracefully)
    // But if there's an error, log it but still show success since local config is cleared
    if (errorMsg.includes('403') || errorMsg.includes('orphaned')) {
      // Device was orphaned - reset still succeeded locally
      console.log('Device was orphaned, but local reset completed successfully');
      confirmBtn.style.backgroundColor = '#00aa00';
      confirmBtn.textContent = 'Reset Complete';
      setTimeout(() => {
        closeResetConfirmation();
      }, 2000);
      return;
    }

    errorHandler.handleApplicationError('system', errorMsg, 'medium');

    // Reset button state on error
    confirmBtn.textContent = originalText;
    (confirmBtn as HTMLButtonElement).disabled = false;
    confirmBtn.style.backgroundColor = '';
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
  camera_preview_enabled: {
    id: 'config-camera-preview-enabled',
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

  // Update camera preview toggle separately
  updateCameraPreviewToggle(config.camera_preview_enabled);
}

function initializeCameraPreviewToggle(config: config) {
  const toggleBtn = document.getElementById('camera-preview-toggle');
  if (!toggleBtn) return;

  // Set initial state
  let currentEnabled = config.camera_preview_enabled;
  updateCameraPreviewToggle(currentEnabled);

  // Add click handler
  toggleBtn.addEventListener('click', async () => {
    try {
      const newValue = !currentEnabled;
      await invoke('set_camera_preview_enabled', { enabled: newValue });

      // Reload config to get updated value
      const updatedConfig: config = await invoke('get_full_config');
      currentEnabled = updatedConfig.camera_preview_enabled;
      updateCameraPreviewToggle(currentEnabled);

      // Update camera video display based on new setting
      updateCameraVideoDisplay(currentEnabled);

      soundManager.playBeep(700, 120);
    } catch (error) {
      console.error('Failed to toggle camera preview:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to toggle camera preview';
      errorHandler.handleApplicationError('config', errorMsg, 'medium');
    }
  });
}

function updateCameraPreviewToggle(enabled: boolean) {
  const toggleBtn = document.getElementById('camera-preview-toggle');
  const toggleText = document.getElementById('camera-preview-toggle-text');

  if (toggleBtn && toggleText) {
    if (enabled) {
      toggleBtn.classList.add('enabled');
      toggleText.textContent = 'Enabled';
    } else {
      toggleBtn.classList.remove('enabled');
      toggleText.textContent = 'Disabled';
    }
  }
}

// Track if entry feedback is currently showing to prevent premature resets
let isEntryFeedbackShowing = false;

// Shared reset function for consistent messaging
function resetEntryDisplay() {
  const entryData = document.getElementById('entry-data');
  if (entryData) {
    // Only reset to default if network is available
    // If network is unavailable, keep the warning message
    const isNetworkUnavailable = document.body.classList.contains('network-unavailable-state');

    if (!isNetworkUnavailable) {
      entryData.innerHTML =
        '<p>Swipe your card or scan your barcode to record an entry...</p>';
    } else {
      // Network is down, restore the warning message
      entryData.innerHTML =
        '<p>The network is unavailable and entries cannot be recorded at this time.</p>';
    }
  }
  // Remove success/error state classes, but preserve network-unavailable-state
  document.body.classList.remove('success-state', 'error-state');
  isEntryFeedbackShowing = false;
}

export function showEntrySuccess() {
  // Update the main display to show success
  const entryData = document.getElementById('entry-data');
  if (entryData) {
    entryData.innerHTML = '<p>Entry submitted successfully!</p>';
    // Change screen color to green for success using CSS class
    document.body.classList.add('success-state');
    isEntryFeedbackShowing = true;
    // Reset after 3 seconds
    setTimeout(() => {
      resetEntryDisplay();
    }, 3000);
  }
}

export function showEntryError() {
  // Update the main display to show error
  const entryData = document.getElementById('entry-data');
  if (entryData) {
    entryData.innerHTML = '<p>Error submitting entry. Please try again.</p>';
    // Change screen color to red for error using CSS class
    document.body.classList.add('error-state');
    isEntryFeedbackShowing = true;
    // Reset after 3 seconds
    setTimeout(() => {
      resetEntryDisplay();
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

/**
 * Background network monitoring to detect API availability issues.
 * When the network is unavailable, the background turns yellow and
 * a warning message is displayed to the user.
 */
async function startNetworkMonitoring() {
  let lastKnownAvailable: boolean | null = null;
  let isOrphaned = false;
  let lastKnownOrphaned = false;
  let isChecking = false;
  let monitoringActive = true;
  let monitorTimer: number | undefined;
  let recoveryInFlight = false;
  let lastRecoveryAttempt: number | null = null;
  // Track consecutive failures - require 2 failures before marking network as down
  let consecutiveFailures = 0;
  const FAILURE_THRESHOLD = 2; // Require 2 consecutive failures before showing warning
  const RECOVERY_COOLDOWN_MS = 5 * 60 * 1000;

  const updateNetworkUI = (isAvailable: boolean, orphaned: boolean = false) => {
    const entryData = document.getElementById('entry-data');

    if (orphaned) {
      // Device is orphaned - show appropriate message
      document.body.classList.add('network-unavailable-state');
      if (entryData && !isEntryFeedbackShowing) {
        entryData.innerHTML =
          '<p>This device has been removed from the server. Please reset and re-register.</p>';
      }
    } else if (isAvailable) {
      // Clear network warning state
      document.body.classList.remove('network-unavailable-state');

      // Only reset to default text if:
      // 1. We were previously in a network error state, AND
      // 2. Entry feedback is not currently showing (to avoid erasing active feedback)
      if (lastKnownAvailable === false && entryData && !isEntryFeedbackShowing) {
        entryData.innerHTML =
          '<p>Swipe your card or scan your barcode to record an entry...</p>';
      }
    } else {
      // Apply network warning state
      document.body.classList.add('network-unavailable-state');

      // Only update message if entry feedback is not currently showing
      // (to avoid erasing active success/error feedback)
      if (entryData && !isEntryFeedbackShowing) {
        entryData.innerHTML =
          '<p>The network is unavailable and entries cannot be recorded at this time.</p>';
      }
    }
  };

  const scheduleNextCheck = () => {
    if (!monitoringActive) {
      return;
    }

    if (monitorTimer !== undefined) {
      window.clearTimeout(monitorTimer);
    }

    monitorTimer = window.setTimeout(() => {
      void performCheck();
    }, 30 * 1000);
  };

  const attemptNetworkRecovery = async (reason: string) => {
    if (recoveryInFlight) {
      return;
    }

    const now = Date.now();
    if (lastRecoveryAttempt !== null && now - lastRecoveryAttempt < RECOVERY_COOLDOWN_MS) {
      return;
    }

    recoveryInFlight = true;
    lastRecoveryAttempt = now;

    try {
      const details = await invoke<string>('attempt_network_recovery_command');
      console.warn('Network recovery attempt completed:', reason, details);
    } catch (error) {
      console.warn('Network recovery attempt failed:', reason, error);
    } finally {
      recoveryInFlight = false;
    }
  };

  const performCheck = async () => {
    if (isChecking) {
      console.warn('Network check already in flight; skipping scheduled run');
      scheduleNextCheck();
      return;
    }

    isChecking = true;
    try {
      const isAvailable = await invoke<boolean>(
        'check_network_availability_command'
      );

      // Success - reset failure counter and update UI immediately
      if (isAvailable) {
        const hadFailures = consecutiveFailures > 0;
        consecutiveFailures = 0; // Reset on success

        // Device is valid and network is available
        if (isOrphaned) {
          // Device was orphaned but now appears valid - clear orphaned state
          console.log('Device status changed from orphaned to valid');
          isOrphaned = false;
          // Force UI update to clear orphaned warning
          lastKnownOrphaned = true;
          lastKnownAvailable = null; // Reset to force UI refresh
        }

        // Update UI immediately on success (especially if we had failures before)
        if (isAvailable !== lastKnownAvailable || isOrphaned !== lastKnownOrphaned || hadFailures) {
          updateNetworkUI(isAvailable, false);
          lastKnownAvailable = isAvailable;
          lastKnownOrphaned = false;
          if (hadFailures) {
            console.log('Network recovered - clearing warning after successful check');
          }
        }
      } else {
        // Check returned false - increment failure counter
        consecutiveFailures++;
        console.warn(`Network check failed (${consecutiveFailures}/${FAILURE_THRESHOLD} consecutive failures)`);

        // Only mark as unavailable if we've exceeded the threshold
        if (consecutiveFailures >= FAILURE_THRESHOLD) {
          if (lastKnownAvailable !== false || isOrphaned !== lastKnownOrphaned) {
            updateNetworkUI(false, false);
            lastKnownAvailable = false;
            lastKnownOrphaned = false;
          }
          await attemptNetworkRecovery('availability check returned false');
        } else {
          // Not enough failures yet - don't update UI, just log
          console.log(`Network check failed but below threshold (${consecutiveFailures}/${FAILURE_THRESHOLD}) - not showing warning`);
        }
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);

      // Check if device is orphaned (403 response)
      if (errorMsg === 'ORPHANED') {
        // Orphaned state - always show immediately (don't use failure threshold)
        console.warn('Device detected as orphaned during network check');
        consecutiveFailures = 0; // Reset failure counter
        const wasOrphaned = isOrphaned;
        isOrphaned = true;

        // Update UI if orphaned state changed
        if (!wasOrphaned || lastKnownOrphaned !== isOrphaned) {
          updateNetworkUI(false, true);
          lastKnownOrphaned = true;
          // Reset lastKnownAvailable to force UI refresh when orphaned state clears
          lastKnownAvailable = null;
        }

        // Check if we should automatically trigger re-registration
        try {
          const config: config = await invoke('get_full_config');
          if (!config.first_run) {
            // Device is configured but orphaned - clear state and trigger re-registration
            console.log('Clearing orphaned state and triggering re-registration');
            await invoke('clear_orphaned_state_command');
            await invoke('first_run_trigger');
            // Exit monitoring - first-run screen will handle re-registration
            monitoringActive = false;
            if (monitorTimer !== undefined) {
              window.clearTimeout(monitorTimer);
              monitorTimer = undefined;
            }
            return;
          }
        } catch (configError) {
          console.error('Failed to check config for orphaned recovery:', configError);
        }

        errorHandler.handleApplicationError('network', 'Device Orphaned - This device has been removed from the server', 'high');
      } else {
        // Other network errors - increment failure counter
        consecutiveFailures++;
        console.warn(`Network availability check error (${consecutiveFailures}/${FAILURE_THRESHOLD} consecutive failures):`, errorMsg);

        // Clear orphaned state if it was set
        if (isOrphaned) {
          isOrphaned = false;
          lastKnownOrphaned = true; // Mark as changed to trigger UI update
          lastKnownAvailable = null; // Reset to force UI refresh
        }

        // Only show error and update UI if we've exceeded the threshold
        if (consecutiveFailures >= FAILURE_THRESHOLD) {
          errorHandler.handleApplicationError('network', errorMsg, 'medium');

          // Update UI if state changed
          if (lastKnownAvailable !== false || lastKnownOrphaned) {
            updateNetworkUI(false, false);
            lastKnownAvailable = false;
            lastKnownOrphaned = false;
          }
          await attemptNetworkRecovery('availability check errored');
        } else {
          // Below threshold - log but don't show error or update UI
          console.log(`Network check error below threshold (${consecutiveFailures}/${FAILURE_THRESHOLD}) - not showing warning`);
        }
      }
    }
    finally {
      isChecking = false;
      scheduleNextCheck();
    }
  };

  // Initial check
  await performCheck();
}

/**
 * Initialize camera video display based on config setting
 */
async function initializeCameraVideo() {
  try {
    const config: config = await invoke('get_full_config');
    updateCameraVideoDisplay(config.camera_preview_enabled);
  } catch (error) {
    console.error('Failed to load config for camera video:', error);
    // Default to hidden if config can't be loaded
    updateCameraVideoDisplay(false);
  }
}

/**
 * Update camera video display based on enabled setting
 */
function updateCameraVideoDisplay(enabled: boolean) {
  const videoContainer = document.getElementById('camera-video-container');
  const videoStream = document.getElementById('camera-video-stream') as HTMLImageElement;

  if (!videoContainer || !videoStream) {
    return;
  }

  if (!enabled) {
    // Hide the container
    videoContainer.style.display = 'none';
    return;
  }

  // Set up MJPEG stream URL
  const streamUrl = 'http://127.0.0.1:7313/video';
  videoStream.src = streamUrl;

  // Show the container
  videoContainer.style.display = 'block';

  // Add some basic styling for the video
  videoContainer.style.cssText += `
    margin-top: -50px;
    text-align: center;
    max-width: 100%;
    overflow: visible;
  `;
  videoStream.style.cssText += `
    max-width: 100%;
    max-height: 300px;
    border: 2px solid #0066cc;
    border-radius: 8px;
    transform: rotate(-90deg);
    transform-origin: center center;
  `;

  // Handle stream errors gracefully
  videoStream.onerror = () => {
    console.warn('[CameraVideo] Failed to load video stream - sidecar may not be running');
    videoContainer.style.display = 'none';
  };

  console.log('[CameraVideo] Video stream initialized');
}

(async () => {
  const config: config = await invoke('get_full_config');
  console.log(config);

  // Check for orphaned device state on boot if device is already configured
  if (!config.first_run) {
    try {
      await invoke<boolean>('check_network_availability_command');
      // If check succeeds, device is valid - continue with normal startup
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      // Check if device is orphaned (403 response)
      if (errorMsg === 'ORPHANED') {
        console.warn('Device appears to be orphaned - clearing state and triggering re-registration');
        await invoke('clear_orphaned_state_command');
        await invoke('first_run_trigger');
        // Exit early - first-run screen will handle re-registration
        return;
      }
    }
  }

  if (config.first_run) {
    await invoke('first_run_trigger');
  }
  await startHIDManager();

  // Initialize menu functionality
  initializeMenu();
  initializeManualEntry(); // Initialize manual entry functionality
  initializeConfig(); // Initialize config modal functionality

  // Initialize camera video display (based on config setting)
  await initializeCameraVideo();

  // Start background network monitoring
  await startNetworkMonitoring();

  // Heartbeat cron task: every 10 +/- 5 minutes
  scheduleHeartbeat();
})();
