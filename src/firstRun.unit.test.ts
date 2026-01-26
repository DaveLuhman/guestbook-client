import { describe, it, expect } from 'vitest';
import { validateAndSanitizeUrl } from './firstRun';

describe('validateAndSanitizeUrl', () => {
  it('empty => isValid: false, error', () => {
    const r = validateAndSanitizeUrl('');
    expect(r.isValid).toBe(false);
    expect(r.error).toBeDefined();
    expect(r.url).toBeUndefined();
  });

  it('whitespace-only => isValid: false', () => {
    const r = validateAndSanitizeUrl('   ');
    expect(r.isValid).toBe(false);
  });

  it('http://example.com => isValid: true, url set', () => {
    const r = validateAndSanitizeUrl('http://example.com');
    expect(r.isValid).toBe(true);
    expect(r.url).toBe('http://example.com');
  });

  it('https://example.com/path => isValid: true', () => {
    const r = validateAndSanitizeUrl('https://example.com/path');
    expect(r.isValid).toBe(true);
    expect(r.url).toBe('https://example.com/path');
  });

  it('example.com => protocol added', () => {
    const r = validateAndSanitizeUrl('example.com');
    expect(r.isValid).toBe(true);
    expect(r.url).toMatch(/^http:\/\//);
    expect(r.url).toContain('example.com');
  });

  it('trailing slash removed', () => {
    const r = validateAndSanitizeUrl('https://example.com/foo/');
    expect(r.isValid).toBe(true);
    expect(r.url).toBe('https://example.com/foo');
  });

  it('invalid URL => isValid: false', () => {
    const r = validateAndSanitizeUrl('not a url!!!');
    expect(r.isValid).toBe(false);
  });

  it('wrong protocol (e.g. ftp) => isValid: false', () => {
    const r = validateAndSanitizeUrl('ftp://example.com');
    expect(r.isValid).toBe(false);
  });
});
