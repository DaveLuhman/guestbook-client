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

(async () => {
  const config:config = await invoke('get_full_config');
  if (config.first_run) {
    await invoke('first_run_trigger')
  }
  await startHIDManager();
})();
