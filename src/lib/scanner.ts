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

/**
 * Get the current status of the camera sidecar process.
 * Returns information about whether it's running, PID, exit status, and last error.
 *
 * @returns Status object with running, pid, exited, exit_code, and last_error fields
 */
export async function getCameraSidecarStatus(): Promise<{
  running: boolean;
  pid: number | null;
  exited: boolean;
  exit_code: number | null;
  last_error: string | null;
}> {
  try {
    const status = await invoke<{
      running: boolean;
      pid: number | null;
      exited: boolean;
      exit_code: number | null;
      last_error: string | null;
    }>('get_camera_sidecar_status');
    return status;
  } catch (error) {
    console.error('Failed to get camera sidecar status:', error);
    throw error;
  }
}

// Expose function globally for console access with nice logging
if (typeof window !== 'undefined') {
  (window as any).getCameraSidecarStatus = getCameraSidecarStatus;
  // Console-friendly wrapper that logs the result
  (window as any).checkSidecarStatus = async () => {
    try {
      const status = await getCameraSidecarStatus();
      console.log('Camera Sidecar Status:', {
        Running: status.running ? '✓ Yes' : '✗ No',
        PID: status.pid ?? 'N/A',
        Exited: status.exited ? '✓ Yes' : '✗ No',
        'Exit Code': status.exit_code ?? 'N/A',
        'Last Error': status.last_error ?? 'None',
      });
      return status;
    } catch (error) {
      console.error('Failed to get sidecar status:', error);
      throw error;
    }
  };
}
