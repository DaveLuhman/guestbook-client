import { invoke } from '@tauri-apps/api/core';
import { errorHandler } from '../../error/errorHandler';
import { soundManager } from '../../sound/soundManager';
import {
  type Config,
  configFieldMap,
} from '../../types/config';
import { updateCameraVideoDisplay } from '../cameraVideo';
import { setupModal } from './modalUtils';

let isConfigOpen = false;

function updateCameraPreviewToggle(enabled: boolean): void {
  const toggleBtn = document.getElementById('camera-preview-toggle');
  const toggleText = document.getElementById('camera-preview-toggle-text');

  if (toggleBtn && toggleText) {
    if (enabled) {
      toggleBtn.classList.add('enabled');
      toggleText.textContent = 'Enabled';
    } else {
      toggleBtn.classList.remove('enabled');
      toggleText.textContent = 'Disabled';
    }
  }
}

function updateConfigDisplay(config: Config): void {
  for (const [key, { id, transform }] of Object.entries(configFieldMap)) {
    const element = document.getElementById(id);
    if (!element) {
      console.warn(`Config field element with id '${id}' not found.`);
      continue;
    }
    const rawValue = (config as unknown as Record<string, unknown>)[key];
    element.textContent = transform ? transform(rawValue) : String(rawValue);
  }
  updateCameraPreviewToggle(config.camera_preview_enabled);
}

function initializeCameraPreviewToggle(config: Config): void {
  const toggleBtn = document.getElementById('camera-preview-toggle');
  if (!toggleBtn) return;

  let currentEnabled = config.camera_preview_enabled;
  updateCameraPreviewToggle(currentEnabled);

  toggleBtn.addEventListener('click', async () => {
    try {
      const newValue = !currentEnabled;
      await invoke('set_camera_preview_enabled', { enabled: newValue });

      const updatedConfig: Config = await invoke('get_full_config');
      currentEnabled = updatedConfig.camera_preview_enabled;
      updateCameraPreviewToggle(currentEnabled);
      updateCameraVideoDisplay(currentEnabled);

      soundManager.playBeep(700, 120);
    } catch (error) {
      console.error('Failed to toggle camera preview:', error);
      const errorMsg =
        error instanceof Error
          ? error.message
          : 'Failed to toggle camera preview';
      errorHandler.handleApplicationError('config', errorMsg, 'medium');
    }
  });
}

export function closeConfig(): void {
  const configModal = document.getElementById('config-modal');
  if (configModal && isConfigOpen) {
    isConfigOpen = false;
    configModal.classList.remove('active');
  }
}

export async function openConfig(): Promise<void> {
  const configModal = document.getElementById('config-modal');
  if (!configModal || isConfigOpen) return;

  isConfigOpen = true;
  configModal.classList.add('active');
  configModal.focus();

  const firstElement = configModal.querySelector('button') as HTMLElement;
  if (firstElement) firstElement.focus();

  configModal.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeConfig();
  });

  try {
    try {
      const version = await invoke<string>('get_app_version');
      const versionElement = document.getElementById('config-app-version');
      if (versionElement) versionElement.textContent = version;
    } catch {
      const versionElement = document.getElementById('config-app-version');
      if (versionElement) versionElement.textContent = 'Error loading';
    }

    const runtimeEnvElement = document.getElementById('config-runtime-env');
    if (runtimeEnvElement) {
      let isDev = false;
      try {
        const env = (import.meta as { env?: { DEV?: boolean; MODE?: string } })
          .env;
        isDev = env?.DEV === true || env?.MODE === 'development';
      } catch {
        isDev = false;
      }
      runtimeEnvElement.textContent = isDev ? 'Development' : 'Release';
    }

    const config: Config = await invoke('get_full_config');
    updateConfigDisplay(config);
    initializeCameraPreviewToggle(config);
  } catch (error) {
    console.error('Failed to load config:', error);
    const errorMsg =
      error instanceof Error ? error.message : 'Failed to load configuration';
    errorHandler.handleApplicationError('config', errorMsg, 'medium');

    for (const { id } of Object.values(configFieldMap)) {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = 'Error loading';
      } else {
        console.warn(`Config field element with id '${id}' not found.`);
      }
    }
  }
}

export function initializeConfig(): void {
  setupModal(
    'config-modal',
    ['show-config-btn'],
    ['close-config-btn'],
    () => void openConfig(),
    closeConfig
  );
}
