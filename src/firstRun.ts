import { invoke } from '@tauri-apps/api/core';

const submitButton = document.getElementById('submit');
const deviceNameInput = document.getElementById('device_name');
const deviceLocationInput = document.getElementById('device_location');
const serverUrlInput = document.getElementById('server_url');
const errorTextEl = document.getElementById('error-text');

/**
 * Performs basic frontend URL validation (minimal checks before backend validation).
 * Full validation with security checks is done on the backend.
 * @param url - The URL string to validate
 * @returns An object with isValid flag and sanitized URL or error message
 */
export const validateAndSanitizeUrl = (
    raw: string,
): { isValid: boolean; url?: string; error?: string } => {
    const trimmed = raw.trim();
    if (!trimmed) {
        return { isValid: false, error: 'Server URL is required' };
    }

    let parsed: URL;
    try {
        parsed = new URL(trimmed);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return { isValid: false, error: 'Only http:// and https:// URLs are allowed' };
        }
    } catch {
        const withProtocol = /^https?:\/\//i.test(trimmed)
            ? trimmed
            : `http://${trimmed}`;
        try {
            parsed = new URL(withProtocol);
        } catch {
            return { isValid: false, error: 'Invalid URL format' };
        }
    }

    if (!parsed.hostname) {
        return { isValid: false, error: 'URL must include a valid hostname' };
    }

    // Normalise via URL API and optionally strip trailing slash
    let normalized = parsed.toString();
    normalized = normalized.replace(/\/+$/, '') || normalized;

    return { isValid: true, url: normalized };
};

const submit = async (e: Event) => {
    e.preventDefault();
    if (!deviceNameInput || !deviceLocationInput || !serverUrlInput || !errorTextEl) {
        throw new Error('Missing elements');
    }
    const deviceName = (deviceNameInput as HTMLInputElement).value.trim();
    const deviceLocation = (deviceLocationInput as HTMLInputElement).value.trim();
    const serverUrlRaw = (serverUrlInput as HTMLInputElement).value;

    // Basic field validation
    if (!deviceName || !deviceLocation || !serverUrlRaw) {
        errorTextEl.textContent = 'Please fill in all fields';
        return;
    }

    // Basic frontend validation
    const basicValidation = validateAndSanitizeUrl(serverUrlRaw);
    if (!basicValidation.isValid || !basicValidation.url) {
        errorTextEl.textContent = basicValidation.error || 'Invalid server URL';
        return;
    }

    // Backend validation with full security checks
    let serverUrl: string;
    try {
        serverUrl = await invoke<string>('validate_and_sanitize_url_command', {
            url: basicValidation.url,
        });
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Invalid server URL';
        errorTextEl.textContent = errorMsg;
        return;
    }

    console.log(deviceName, deviceLocation, serverUrl);
    await invoke('submit_first_run_config', { deviceName, deviceLocation, serverUrl });
    window.close();
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!submitButton || !deviceNameInput || !deviceLocationInput || !serverUrlInput || !errorTextEl) {
        console.error('Missing elements:', {
            submitButton: !!submitButton,
            deviceNameInput: !!deviceNameInput,
            deviceLocationInput: !!deviceLocationInput,
            serverUrlInput: !!serverUrlInput,
            errorTextEl: !!errorTextEl
        });
        return;
    }

    // Load current config to populate server_url field
    try {
        const config = await invoke<{ server_url?: string | null }>('get_full_config');
        if (config.server_url) {
            (serverUrlInput as HTMLInputElement).value = config.server_url;
        }
    } catch (error) {
        console.error('Failed to load config:', error);
    }

    // Attach event listeners
    deviceNameInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            submit(e);
        }
    });
    deviceLocationInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            submit(e);
        }
    });
    serverUrlInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            submit(e);
        }
    });
    submitButton.addEventListener('click', (e) => {
        console.log('Submit button clicked');
        submit(e);
    });

    console.log('Event listeners attached successfully');
});

