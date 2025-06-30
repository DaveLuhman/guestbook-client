import { invoke } from '@tauri-apps/api/core';
const submitButton = document.getElementById('submit');
const deviceNameInput = document.getElementById('device_name');
const deviceLocationInput = document.getElementById('device_location');
const errorTextEl = document.getElementById('error-text');

const submit = async (e: Event) => {
    e.preventDefault();
    if (!deviceNameInput || !deviceLocationInput || !errorTextEl) {
        throw new Error('Missing elements');
    }
    const deviceName = (deviceNameInput as HTMLInputElement).value;
    const deviceLocation = (deviceLocationInput as HTMLInputElement).value;
    if (!deviceName || !deviceLocation) {
        errorTextEl.textContent = 'Please fill in both fields';
        return;
    }
    console.log(deviceName, deviceLocation);
    await invoke('submit_first_run_config', { deviceName, deviceLocation });
    window.close();
}

document.addEventListener('DOMContentLoaded', () => {
    if (!submitButton || !deviceNameInput || !deviceLocationInput) {
        throw new Error('Missing elements');
    }
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
    submitButton.addEventListener('click', submit);
});

