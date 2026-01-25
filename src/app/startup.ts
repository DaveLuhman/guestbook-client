import { invoke } from '@tauri-apps/api/core';
import { startHIDManager } from '../hid/HIDManager';
import { scheduleHeartbeat } from '../network/heartbeat';
import { startNetworkMonitoring } from '../network/monitoring';
import { initializeCameraVideo } from '../ui/cameraVideo';
import { initializeMenu } from '../ui/menu';
import { initializeConfig } from '../ui/modals/config';
import { initializeManualEntry } from '../ui/modals/manualEntry';

/**
 * App bootstrap: load config, handle first-run/orphan, start HID,
 * init UI modals, camera, network monitoring, and heartbeat.
 */
export async function startApp(): Promise<void> {
  const config = await invoke<{
    first_run: boolean;
  }>('get_full_config');
  console.log(config);

  // Check for orphaned device state on boot if device is already configured
  if (!config.first_run) {
    try {
      await invoke<boolean>('check_network_availability_command');
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      if (errorMsg === 'ORPHANED') {
        console.warn(
          'Device appears to be orphaned - clearing state and triggering re-registration'
        );
        await invoke('clear_orphaned_state_command');
        await invoke('first_run_trigger');
        return;
      }
    }
  }

  if (config.first_run) {
    await invoke('first_run_trigger');
  }

  await startHIDManager();

  initializeMenu();
  initializeManualEntry();
  initializeConfig();

  await initializeCameraVideo();

  await startNetworkMonitoring();

  scheduleHeartbeat();
}
