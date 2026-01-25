import { invoke } from '@tauri-apps/api/core';
import type { Config } from '../types/config';

/**
 * Initialize camera video display based on config setting
 */
export async function initializeCameraVideo(): Promise<void> {
  try {
    const config: Config = await invoke('get_full_config');
    updateCameraVideoDisplay(config.camera_preview_enabled);
  } catch (error) {
    console.error('Failed to load config for camera video:', error);
    updateCameraVideoDisplay(false);
  }
}

/**
 * Update camera video display based on enabled setting
 */
export function updateCameraVideoDisplay(enabled: boolean): void {
  const videoContainer = document.getElementById('camera-video-container');
  const videoStream = document.getElementById(
    'camera-video-stream'
  ) as HTMLImageElement;

  if (!videoContainer || !videoStream) {
    return;
  }

  if (!enabled) {
    videoContainer.style.display = 'none';
    return;
  }

  const streamUrl = 'http://127.0.0.1:7313/video';
  videoStream.src = streamUrl;

  videoContainer.style.display = 'block';

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

  videoStream.onerror = () => {
    console.warn(
      '[CameraVideo] Failed to load video stream - sidecar may not be running'
    );
    videoContainer.style.display = 'none';
  };

  console.log('[CameraVideo] Video stream initialized');
}
