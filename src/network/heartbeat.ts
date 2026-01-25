import { invoke } from '@tauri-apps/api/core';
import { errorHandler } from '../error/errorHandler';

/**
 * Schedule next heartbeat at a random interval between 5 and 15 minutes,
 * then recurse to keep scheduling.
 */
export function scheduleHeartbeat(): void {
  const min = 5 * 60 * 1000;
  const max = 15 * 60 * 1000;
  const interval = Math.floor(Math.random() * (max - min + 1)) + min;

  setTimeout(async () => {
    try {
      await invoke('send_heartbeat_command');
    } catch (e) {
      console.error('Heartbeat failed', e);
      const errorMsg = e instanceof Error ? e.message : 'Heartbeat failed';
      errorHandler.handleApplicationError('network', errorMsg, 'medium');
    }
    scheduleHeartbeat();
  }, interval);
}
