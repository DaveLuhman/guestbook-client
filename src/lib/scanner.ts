/**
 * Scanner Sidecar Management
 *
 * Provides simple commands to start/stop the camera scanner sidecar process.
 * The sidecar is managed by Tauri and runs the Python camera/barcode service.
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * Ensure the scanner sidecar is running.
 * If it's already running, this is a no-op.
 */
export async function ensureScannerRunning(): Promise<void> {
  try {
    await invoke('start_camera_sidecar');
  } catch (error) {
    console.error('Failed to start camera sidecar:', error);
    throw error;
  }
}

/**
 * Shutdown the scanner sidecar process.
 */
export async function shutdownScanner(): Promise<void> {
  try {
    await invoke('stop_camera_sidecar');
  } catch (error) {
    console.error('Failed to stop camera sidecar:', error);
    throw error;
  }
}
