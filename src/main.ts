import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { startHIDManager } from './hid/HIDManager';
import { isFirstRun } from './config/deviceConfig';
import { registerDevice } from './network/registerDevice';

(async () => {
  const isFirstRunResult = await isFirstRun();
  if (isFirstRunResult) {
    await invoke('show_first_run_window');
  } else {
    await startHIDManager();
  }
})();
