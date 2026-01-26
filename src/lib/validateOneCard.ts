/**
 * Validates OneCard format: exactly 7 digits.
 * Used at the IPC boundary (HIDManager, manualEntry) before submit_*_entry.
 */
export function validateOneCard(s: string): boolean {
  return /^\d{7}$/.test(s);
}
