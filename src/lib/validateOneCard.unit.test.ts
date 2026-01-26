import { describe, it, expect } from 'vitest';
import { validateOneCard } from './validateOneCard';

describe('validateOneCard', () => {
  it('returns true for exactly 7 digits', () => {
    expect(validateOneCard('1234567')).toBe(true);
    expect(validateOneCard('0000000')).toBe(true);
  });

  it('returns false for 6 digits', () => {
    expect(validateOneCard('123456')).toBe(false);
  });

  it('returns false for 8 digits', () => {
    expect(validateOneCard('12345678')).toBe(false);
  });

  it('returns false for non-numeric', () => {
    expect(validateOneCard('123456a')).toBe(false);
    expect(validateOneCard('12345 7')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(validateOneCard('')).toBe(false);
  });
});
