const axios = require('axios');
const configManager = require('../../configManager');
const os = require("node:os")
function getPrimaryMacAddress() {
  const interfaces = os.networkInterfaces();

  for (const [name, configs] of Object.entries(interfaces)) {
    for (const config of configs) {
      if (
        config.family === 'IPv4' &&
        !config.internal &&
        config.mac &&
        config.mac !== '00:00:00:00:00:00' &&
        (name === 'eth0' || name === 'wlan0')
      ) {
        return { interface: name, mac: config.mac };
      }
    }
  }

  // Fallback: just return the first valid one
  for (const configs of Object.values(interfaces)) {
    for (const config of configs) {
      if (
        config.family === 'IPv4' &&
        !config.internal &&
        config.mac &&
        config.mac !== '00:00:00:00:00:00'
      ) {
        return config.mac;
      }
    }
  }

  throw new Error('No valid network interface found.');
}
function computeDeviceId() {
  let macAddress = getPrimaryMacAddress();
  macAddress = macAddress.replace(/:/g, '');
  // get the last 6 characters and return it
  return macAddress.slice(-6);
}

async function registerThisDevice(deviceName, deviceLocation) {
  const deviceId = computeDeviceId();
  const serverUrl = configManager.getServerUrl();
  const headers = {
    'Content-Type': 'application/json',
  }
  const device = {
    id: deviceId,
    name: deviceName || deviceId,
    location: deviceLocation || 'Unknown'
  }
  const body = device;
  const response = await axios.post(`${serverUrl}/api/v1/devices/register`, body, { headers });
  return response.data;
}
module.exports = registerThisDevice;
