import { describe, expect, it } from 'vitest';
import { addDays, addMonths, israelDate, israelMonth, isRealDate, monthLabel } from '@/lib/israelTime';

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

describe('monthLabel', () => {
  it('names the month and year, long by default', () => {
    expect(monthLabel('2026-10', 'en')).toBe('October 2026');
    expect(monthLabel('2026-10', 'he')).toBe('אוקטובר 2026');
    expect(monthLabel('2027-01', 'en', 'long')).toBe('January 2027');
  });
  it('drops the year in the short form, as spec §3\'s "▶ Sep" / "Nov ◀" buttons do', () => {
    expect(monthLabel('2026-09', 'en', 'short')).toBe('Sep');
    expect(monthLabel('2025-12', 'en', 'short')).toBe('Dec');
    expect(monthLabel('2025-07', 'he', 'short')).toBe('יולי');
  });
  it('gives the month name alone for a second mention, as in "Left to pay for October"', () => {
    expect(monthLabel('2026-10', 'en', 'name')).toBe('October');
    expect(monthLabel('2026-10', 'he', 'name')).toBe('אוקטובר');
  });
  it('treats any locale but he as English, as the notifier passes a free string', () => {
    expect(monthLabel('2026-09', 'fr')).toBe('September 2026');
  });
});
