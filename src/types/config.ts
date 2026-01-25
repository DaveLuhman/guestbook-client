/** biome-ignore-all lint/suspicious/noExplicitAny: display transformation, typing doesn't matter */

export interface Config {
  server_url: string;
  server_token: string;
  device_id: string;
  device_location: string;
  device_friendly_name: string;
  first_run: boolean;
  camera_preview_enabled: boolean;
}

export const configFieldMap: Record<
  keyof Config,
  { id: string; transform?: (value: unknown) => string }
> = {
  server_url: {
    id: 'config-server-url',
    transform: (v: unknown) => (v as string) || 'Not set',
  },
  server_token: {
    id: 'config-server-token',
    transform: (t: unknown) => {
      const s = t as string;
      if (!s) return 'Not set';
      if (s.length <= 8) return '***';
      return `${s.substring(0, 4)}...${s.substring(s.length - 4)}`;
    },
  },
  device_id: {
    id: 'config-device-id',
    transform: (v: unknown) => (v as string) || 'Not set',
  },
  device_location: {
    id: 'config-device-location',
    transform: (v: unknown) => (v as string) || 'Not set',
  },
  device_friendly_name: {
    id: 'config-device-name',
    transform: (v: unknown) => (v as string) || 'Not set',
  },
  first_run: {
    id: 'config-first-run',
    transform: (v: unknown) => ((v as boolean) ? 'Yes' : 'No'),
  },
  camera_preview_enabled: {
    id: 'config-camera-preview-enabled',
    transform: (v: unknown) => ((v as boolean) ? 'Yes' : 'No'),
  },
};
