import { describe, it, expect } from 'vitest';
import { configFieldMap } from './config';

describe('configFieldMap transforms', () => {
  it('server_token: long string => xxxx...yyyy', () => {
    const t = configFieldMap.server_token.transform!;
    expect(t('abcdefghijklmnopqrst')).toBe('abcd...qrst');
  });

  it('server_token: short (<=8) => ***', () => {
    const t = configFieldMap.server_token.transform!;
    expect(t('short')).toBe('***');
    expect(t('12345678')).toBe('***');
  });

  it('server_token: empty => Not set', () => {
    const t = configFieldMap.server_token.transform!;
    expect(t('')).toBe('Not set');
    expect(t(null)).toBe('Not set');
  });

  it('first_run: true => Yes, false => No', () => {
    const t = configFieldMap.first_run.transform!;
    expect(t(true)).toBe('Yes');
    expect(t(false)).toBe('No');
  });

  it('server_url: missing/empty => Not set', () => {
    const t = configFieldMap.server_url.transform!;
    expect(t('')).toBe('Not set');
    expect(t(null)).toBe('Not set');
  });

  it('camera_preview_enabled: bool => Yes/No', () => {
    const t = configFieldMap.camera_preview_enabled.transform!;
    expect(t(true)).toBe('Yes');
    expect(t(false)).toBe('No');
  });
});
