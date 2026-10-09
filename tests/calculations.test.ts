import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentMonth, maaserFor } from '@/lib/calculations';

describe('maaserFor', () => {
  // Must stay identical to the expression it replaced; 29% of 50 is the case
  // where an "exact" integer rewrite would disagree (14 vs 15): 0.29 is not
  // exact in binary, so 50 * 0.29 is 14.4999… and stored rows hold 14.
  it('keeps the existing rounding', () => {
    for (const [a, p] of [[50, 29], [123457, 10], [99, 15], [1, 50], [1234567, 12]]) {
      expect(maaserFor(a, p)).toBe(Math.round(a * (p / 100)));
    }
    expect(maaserFor(50, 29)).toBe(14);
  });
});

describe('getCurrentMonth', () => {
  afterEach(() => vi.useRealTimers());
  it('is the Israeli month, not the server month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T22:30:00Z'));
    expect(getCurrentMonth()).toBe('2026-10');
  });
});
