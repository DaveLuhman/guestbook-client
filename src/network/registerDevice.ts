import { networkInterfaces } from 'node:os';
import { setServerUrl, setDeviceId, setToken } from '../config/deviceConfig';

function getPrimaryMacAddress(): string | undefined {
  const interfaces = networkInterfaces();

  for (const [name, configs] of Object.entries(interfaces)) {
    for (const config of configs ?? []) {
      if (
        config.family === 'IPv4' &&
        !config.internal &&
        config.mac &&
        config.mac !== '00:00:00:00:00:00' &&
        (name === 'eth0' || name === 'wlan0')
      ) {
        return config.mac;
      }
    }
  }

  for (const configs of Object.values(interfaces)) {
    for (const config of configs ?? []) {
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

  return undefined;
}

function computeDeviceId(): string {
  const mac = getPrimaryMacAddress();
  if (!mac) {
    return Math.random().toString(36).slice(-6);
  }
  return mac.replace(/:/g, '').slice(-6);
}

export interface RegistrationOptions {
  serverUrl: string;
  friendlyName?: string;
  location?: string;
}

export async function registerDevice(options: RegistrationOptions): Promise<any> {
  await setServerUrl(options.serverUrl);

  const deviceId = computeDeviceId();

  const body = {
    id: deviceId,
    name: options.friendlyName ?? deviceId,
    location: options.location ?? 'Unknown',
  };

  const res = await fetch(`${options.serverUrl}/api/v1/devices/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Registration failed: ${res.status}`);
  }

  const data = await res.json();

  await setDeviceId(deviceId);
  if (data.token) {
    await setToken(data.token);
  }

  return data;
}
