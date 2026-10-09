import { describe, expect, it } from 'vitest';
import { parseAmount, resolveDate, toCandidates, type RawTransaction } from '@/lib/depositParsing';

const NBSP = '\u00a0', RLM = '\u200f', LRM = '\u200e';

describe('parseAmount', () => {
  it.each([
    ['+12,345.67', 'in', 1234567],
    ['12,345.67+', 'in', 1234567],
    [`${RLM}${LRM}+12,345.67${NBSP}${RLM}₪`, 'in', 1234567],
    ['12,345.67 ש״ח', 'in', 1234567],
    ["12,345.67 ש''ח", 'in', 1234567],
    ['12,345.67 ש"ח', 'in', 1234567],
    ['ILS 100', 'in', 10000],
    ['nis 100', 'unknown', 10000],
    ['1,234.5', 'in', 123450],
    ['12345', 'in', 1234500],
    ['0.01', 'in', 1],
    ['10,000,000', 'in', 1_000_000_000],
  ] as const)('%j (%s) → %d', (text, dir, agorot) => {
    expect(parseAmount(text, dir)).toBe(agorot);
  });

  it.each([
    ['+500', 'out'],
    ['−1,234', 'in'],        // U+2212
    ['1,234-', 'in'],
    ['-1,234', 'unknown'],
    ['12,34', 'in'],
    ['1,2345', 'in'],
    ['12.345', 'in'],
    ['.5', 'in'],
    ['0', 'in'],
    ['10,000,000.01', 'in'],
    ['++5', 'in'],
    ['5+5', 'in'],
    ['abc', 'in'],
    ['', 'in'],
  ] as const)('%j (%s) → null', (text, dir) => {
    expect(parseAmount(text, dir)).toBeNull();
  });
});

const at = (iso: string) => new Date(iso);
const noDate = { day: null, month: null, year: null, relativeDay: null } as const;

describe('resolveDate', () => {
  it('takes this year for a yearless date that is tomorrow (value date)', () => {
    // 23:50 on 9 Oct in Israel.
    expect(resolveDate({ ...noDate, day: 10, month: 10 }, at('2026-10-09T20:50:00Z')))
      .toEqual({ date: '2026-10-10', dateFromImage: true });
  });
  it('takes next year for 01/01 sent on 31 Dec at 23:50', () => {
    expect(resolveDate({ ...noDate, day: 1, month: 1 }, at('2026-12-31T21:50:00Z')).date)
      .toBe('2027-01-01');
  });
  it('takes last year for 31/12 sent on 1 Jan', () => {
    expect(resolveDate({ ...noDate, day: 31, month: 12 }, at('2027-01-01T08:00:00Z')).date)
      .toBe('2026-12-31');
  });
  it('treats a yearless 29/02 with no valid recent year as missing', () => {
    expect(resolveDate({ ...noDate, day: 29, month: 2 }, at('2026-06-01T08:00:00Z')))
      .toEqual({ date: '2026-06-01', dateFromImage: false });
  });
  it('finds 29/02 of a recent leap year', () => {
    expect(resolveDate({ ...noDate, day: 29, month: 2 }, at('2025-03-01T08:00:00Z')).date)
      .toBe('2024-02-29');
  });
  it('treats an explicit date two days ahead as missing', () => {
    expect(resolveDate({ ...noDate, day: 11, month: 10, year: 2026 }, at('2026-10-09T08:00:00Z')))
      .toEqual({ date: '2026-10-09', dateFromImage: false });
  });
  it('adds 2000 to a two-digit year', () => {
    expect(resolveDate({ ...noDate, day: 5, month: 9, year: 26 }, at('2026-10-09T08:00:00Z')).date)
      .toBe('2026-09-05');
  });
  it.each([126, 19999, -5])('treats year %d, which cannot be written as YYYY, as missing', (year) => {
    expect(resolveDate({ ...noDate, day: 5, month: 9, year }, at('2026-10-09T08:00:00Z')))
      .toEqual({ date: '2026-10-09', dateFromImage: false });
  });
  // The card's month buttons stop 24 months back (2024-10 for October 2026),
  // so no date older than that may become the card's month.
  it.each([
    [1999, 9, 5],   // a genuinely old screenshot
    [1026, 9, 5],   // a misread year that is still four digits
    [2024, 9, 30],  // the last day before the bound
  ])('treats %d-%d-%d, before the 24-month bound, as missing', (year, month, day) => {
    expect(resolveDate({ ...noDate, day, month, year }, at('2026-10-09T08:00:00Z')))
      .toEqual({ date: '2026-10-09', dateFromImage: false });
  });
  it('keeps the first day of the 24-month bound', () => {
    expect(resolveDate({ ...noDate, day: 1, month: 10, year: 2024 }, at('2026-10-09T08:00:00Z')))
      .toEqual({ date: '2024-10-01', dateFromImage: true });
  });
  it('takes the bound from the Israeli month, not the UTC one', () => {
    // 01:30 on 1 Oct in Israel, still 30 Sep in UTC: the bound is already 2024-10.
    expect(resolveDate({ ...noDate, day: 30, month: 9, year: 2024 }, at('2026-09-30T22:30:00Z')))
      .toEqual({ date: '2026-10-01', dateFromImage: false });
  });
  it('resolves "yesterday" sent on the 1st into the previous month', () => {
    expect(resolveDate({ ...noDate, relativeDay: 'yesterday' }, at('2026-11-01T06:00:00Z')))
      .toEqual({ date: '2026-10-31', dateFromImage: true });
  });
  it('resolves tomorrow by calendar day on the DST switch day', () => {
    // 25 Oct 2026 23:30 IST = 21:30Z.
    expect(resolveDate({ ...noDate, day: 26, month: 10 }, at('2026-10-25T21:30:00Z')).date)
      .toBe('2026-10-26');
  });
  it('falls back to the sent day when there is no date', () => {
    expect(resolveDate(noDate, at('2026-10-09T08:00:00Z')))
      .toEqual({ date: '2026-10-09', dateFromImage: false });
  });
});

const tx = (over: Partial<RawTransaction>): RawTransaction => ({
  amountText: '1,000.00', direction: 'in', currency: 'ILS',
  day: 10, month: 10, year: 2026, relativeDay: null, description: 'משכורת', ...over,
});

describe('toCandidates', () => {
  const sent = at('2026-10-12T08:00:00Z');
  it('keeps incoming and unknown ILS lines, drops outgoing and foreign ones', () => {
    const { candidates } = toCandidates({ isBankScreen: true, transactions: [
      tx({ amountText: '+12,345.67' }),
      tx({ direction: 'out', amountText: '-300.00' }),
      tx({ direction: 'unknown', amountText: '500' }),
      tx({ currency: 'other' }),
      tx({ amountText: 'garbage' }),
    ] }, sent);
    expect(candidates).toEqual([
      { amount: 1234567, date: '2026-10-10', month: '2026-10', dateFromImage: true, description: 'משכורת', directionUnknown: false },
      { amount: 50000, date: '2026-10-10', month: '2026-10', dateFromImage: true, description: 'משכורת', directionUnknown: true },
    ]);
  });
  it('caps at 8 in screen order and reports truncation', () => {
    const many = Array.from({ length: 11 }, (_, i) => tx({ amountText: String(i + 1) }));
    const { candidates, truncated } = toCandidates({ isBankScreen: true, transactions: many }, sent);
    expect(candidates.map((c) => c.amount)).toEqual([100, 200, 300, 400, 500, 600, 700, 800]);
    expect(truncated).toBe(true);
  });
  it('trims the description', () => {
    const { candidates } = toCandidates({ isBankScreen: true, transactions: [tx({ description: '  משכורת  ' })] }, sent);
    expect(candidates[0].description).toBe('משכורת');
  });
});
