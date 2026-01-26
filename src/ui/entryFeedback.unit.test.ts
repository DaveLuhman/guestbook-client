import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getIsEntryFeedbackShowing,
  showEntrySuccess,
  showEntryError,
} from './entryFeedback';

describe('entryFeedback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const entryData = document.createElement('div');
    entryData.id = 'entry-data';
    document.body.appendChild(entryData);
    document.body.classList.remove('success-state', 'error-state', 'network-unavailable-state');
  });

  afterEach(() => {
    vi.advanceTimersByTime(5000);
    vi.useRealTimers();
    document.getElementById('entry-data')?.remove();
  });

  it('getIsEntryFeedbackShowing is false initially', () => {
    expect(getIsEntryFeedbackShowing()).toBe(false);
  });

  it('getIsEntryFeedbackShowing is true after showEntrySuccess', () => {
    showEntrySuccess();
    expect(getIsEntryFeedbackShowing()).toBe(true);
  });

  it('getIsEntryFeedbackShowing is false after showEntrySuccess and 3s timeout', () => {
    showEntrySuccess();
    vi.advanceTimersByTime(3000);
    expect(getIsEntryFeedbackShowing()).toBe(false);
  });

  it('getIsEntryFeedbackShowing is true after showEntryError', () => {
    showEntryError();
    expect(getIsEntryFeedbackShowing()).toBe(true);
  });

  it('getIsEntryFeedbackShowing is false after showEntryError and 3s timeout', () => {
    showEntryError();
    vi.advanceTimersByTime(3000);
    expect(getIsEntryFeedbackShowing()).toBe(false);
  });

  it('resetEntryDisplay: normal branch after 3s (no network-unavailable-state)', () => {
    showEntrySuccess();
    vi.advanceTimersByTime(3000);
    const el = document.getElementById('entry-data');
    expect(el?.innerHTML).toContain('Swipe your card');
  });

  it('resetEntryDisplay: network-unavailable branch after 3s', () => {
    showEntryError();
    document.body.classList.add('network-unavailable-state');
    vi.advanceTimersByTime(3000);
    const el = document.getElementById('entry-data');
    expect(el?.innerHTML).toContain('network is unavailable');
  });
});
