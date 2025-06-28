import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';

export interface DeviceConfig {
  token?: string;
  serverUrl?: string;
  deviceId?: string;
  friendlyName?: string;
  location?: string;
}

const CONFIG_FILE = '.guestbook-config.json';

function getConfigPath(): string {
  return `${homedir()}/${CONFIG_FILE}`;
}
export async function isFirstRun(): Promise<boolean> {
  try {
    await fs.access(getConfigPath());
    return false;
  } catch {
    return true;
  }
}

export async function loadDeviceConfig(): Promise<DeviceConfig> {
  try {
    const data = await fs.readFile(getConfigPath(), 'utf8');
    return JSON.parse(data) as DeviceConfig;
  } catch {
    return {};
  }
}

export async function saveDeviceConfig(config: DeviceConfig): Promise<void> {
  await fs.writeFile(getConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}

export async function getServerUrl(): Promise<string | undefined> {
  const cfg = await loadDeviceConfig();
  return cfg.serverUrl;
}

export async function setServerUrl(url: string): Promise<void> {
  const cfg = await loadDeviceConfig();
  cfg.serverUrl = url;
  await saveDeviceConfig(cfg);
}

export async function setToken(token: string): Promise<void> {
  const cfg = await loadDeviceConfig();
  cfg.token = token;
  await saveDeviceConfig(cfg);
}

export async function getToken(): Promise<string | undefined> {
  const cfg = await loadDeviceConfig();
  return cfg.token;
}

export async function setDeviceId(id: string): Promise<void> {
  const cfg = await loadDeviceConfig();
  cfg.deviceId = id;
  await saveDeviceConfig(cfg);
}

export async function getDeviceId(): Promise<string | undefined> {
  const cfg = await loadDeviceConfig();
  return cfg.deviceId;
}
