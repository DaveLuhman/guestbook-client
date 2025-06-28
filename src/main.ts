import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { startHIDManager } from './hid/HIDManager';
import { loadDeviceConfig } from './config/deviceConfig';

(async () => {
  await startHIDManager();
  const deviceConfig = await loadDeviceConfig();
  console.log(deviceConfig);
})();
