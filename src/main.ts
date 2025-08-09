import { invoke } from '@tauri-apps/api/core';
import { startHIDManager } from './hid/HIDManager';

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
    // TODO: Implement manual entry functionality
    closeMenu();
  });

  showConfigBtn?.addEventListener('click', () => {
    console.log('Show Config clicked');
    // TODO: Implement config display functionality
    closeMenu();
  });

  restartApplianceBtn?.addEventListener('click', () => {
    console.log('Restart Appliance clicked');
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

  // Heartbeat cron task: every 10 +/- 5 minutes
  scheduleHeartbeat();
})();
