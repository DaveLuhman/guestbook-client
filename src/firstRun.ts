import { invoke } from '@tauri-apps/api/core';

const submitButton = document.getElementById('submit');
const deviceNameInput = document.getElementById('device_name');
const deviceLocationInput = document.getElementById('device_location');
const serverUrlInput = document.getElementById('server_url');
const errorTextEl = document.getElementById('error-text');

/**
 * Validates and sanitizes a server URL to prevent code injection and ensure it's a valid URL.
 * @param url - The URL string to validate
 * @returns An object with isValid flag and sanitized URL or error message
 */
const validateAndSanitizeUrl = (url: string): { isValid: boolean; url?: string; error?: string } => {
    // Trim whitespace
    const trimmed = url.trim();

    if (!trimmed) {
        return { isValid: false, error: 'Server URL is required' };
    }

    // Check for dangerous patterns that could indicate code injection
    const dangerousPatterns = [
        /javascript:/i,
        /data:/i,
        /vbscript:/i,
        /on\w+\s*=/i, // Event handlers like onclick=
        /<script/i,
        /<\/script>/i,
        /<iframe/i,
        /<object/i,
        /<embed/i,
        /eval\(/i,
        /expression\(/i,
    ];

    for (const pattern of dangerousPatterns) {
        if (pattern.test(trimmed)) {
            return { isValid: false, error: 'Invalid URL: contains potentially dangerous content' };
        }
    }

    // Try to parse as URL
    let parsedUrl: URL;
    try {
        // If URL doesn't have a protocol, try adding http:// for validation
        let urlToParse = trimmed;
        if (!/^https?:\/\//i.test(trimmed)) {
            urlToParse = `http://${trimmed}`;
        }
        parsedUrl = new URL(urlToParse);
    } catch {
        return { isValid: false, error: 'Invalid URL format' };
    }

    // Only allow http and https protocols
    const allowedProtocols = ['http:', 'https:'];
    if (!allowedProtocols.includes(parsedUrl.protocol)) {
        return { isValid: false, error: 'Only http:// and https:// URLs are allowed' };
    }

    // Reconstruct the URL with the original protocol if it was provided
    let sanitizedUrl: string;
    if (/^https?:\/\//i.test(trimmed)) {
        // Original had protocol, use parsed URL but keep original protocol
        sanitizedUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    } else {
        // Original didn't have protocol, default to http
        sanitizedUrl = `http://${parsedUrl.host}${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    }

    // Additional validation: ensure hostname is present
    if (!parsedUrl.hostname || parsedUrl.hostname.length === 0) {
        return { isValid: false, error: 'URL must include a valid hostname' };
    }

    // Remove trailing slashes from pathname (except root)
    sanitizedUrl = sanitizedUrl.replace(/\/+$/, '') || sanitizedUrl;

    return { isValid: true, url: sanitizedUrl };
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

    // Validate and sanitize URL
    const urlValidation = validateAndSanitizeUrl(serverUrlRaw);
    if (!urlValidation.isValid) {
        errorTextEl.textContent = urlValidation.error || 'Invalid server URL';
        return;
    }

    if (!urlValidation.url) {
        errorTextEl.textContent = 'Invalid server URL';
        return;
    }

    const serverUrl = urlValidation.url;

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

