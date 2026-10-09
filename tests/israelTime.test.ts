import { describe, expect, it } from 'vitest';
import { addDays, addMonths, israelDate, israelMonth, isRealDate } from '@/lib/israelTime';

describe('israelMonth', () => {
  it.each([
    ['2026-09-30T22:30:00Z', '2026-10'], // IDT, after midnight in Israel
    ['2026-10-31T21:30:00Z', '2026-10'], // IST (UTC+2): 23:30 on the 31st
    ['2026-10-31T22:30:00Z', '2026-11'], // IST: 00:30 on 1 Nov
    ['2026-12-31T22:30:00Z', '2027-01'],
    ['2026-03-27T00:30:00Z', '2026-03'], // spring-forward day (27 Mar 2026)
    ['2026-10-25T00:30:00Z', '2026-10'], // fall-back day (25 Oct 2026)
  ])('%s → %s', (iso, month) => {
    expect(israelMonth(new Date(iso))).toBe(month);
  });
});

describe('israelDate', () => {
  it('uses the Israeli calendar day', () => {
    expect(israelDate(new Date('2026-10-09T21:30:00Z'))).toBe('2026-10-10');
    expect(israelDate(new Date('2026-10-09T20:30:00Z'))).toBe('2026-10-09');
  });
});

describe('addDays / addMonths', () => {
  it('crosses month and year ends by calendar arithmetic', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-10', -24)).toBe('2024-10');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });
  it('isRealDate', () => {
    expect(isRealDate(2024, 2, 29)).toBe(true);
    expect(isRealDate(2026, 2, 29)).toBe(false);
    expect(isRealDate(2026, 13, 1)).toBe(false);
    expect(isRealDate(2026, 4, 31)).toBe(false);
  });
});
