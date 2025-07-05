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

  // Heartbeat cron task: every 10 +/- 5 minutes
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
  scheduleHeartbeat();
})();
