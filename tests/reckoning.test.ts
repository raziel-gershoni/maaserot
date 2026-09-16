import { describe, expect, it } from 'vitest';
import { reckonMonth, resolveGroupMembers } from '@/lib/reckoning';

const ME = 'me';
const PARTNER = 'partner';
const EX = 'ex-partner';

const income = (userId: string, maaser: number) => ({ userId, maaser });
const charity = (userId: string, amount: number) => ({ userId, amount });
const payment = (memberIds: string[], groupAmountPaid: number) => ({
  memberIds,
  groupAmountPaid,
});

describe('resolveGroupMembers', () => {
  it('is the user alone when there is no partner and nothing was settled', () => {
    expect(resolveGroupMembers({ userId: ME, partnerId: null, settledWith: [] })).toEqual([ME]);
  });

  it('follows the standing partnership when the month has no group payment', () => {
    expect(
      resolveGroupMembers({ userId: ME, partnerId: PARTNER, settledWith: [] })
    ).toEqual([ME, PARTNER]);
  });

  // A settled month is historical fact and must not be re-grouped when the
  // partnership changes, or past reckonings would rewrite themselves.
  it('keeps whoever a month was actually settled with, ignoring the current partner', () => {
    expect(
      resolveGroupMembers({ userId: ME, partnerId: PARTNER, settledWith: [ME, EX] })
    ).toEqual([ME, EX]);
  });
});

describe('reckonMonth', () => {
  it('reckons a solo month', () => {
    const r = reckonMonth({
      memberIds: [ME],
      incomes: [income(ME, 100_00)],
      fixedCharities: [charity(ME, 20_00)],
      payments: [],
    });

    expect(r).toEqual({
      totalMaaser: 100_00,
      fixedCharitiesTotal: 20_00,
      totalPaid: 0,
      unpaid: 80_00,
    });
  });

  it('sums both members of a group', () => {
    const r = reckonMonth({
      memberIds: [ME, PARTNER],
      incomes: [income(ME, 100_00), income(PARTNER, 60_00)],
      fixedCharities: [charity(ME, 20_00), charity(PARTNER, 10_00)],
      payments: [payment([ME, PARTNER], 30_00)],
    });

    expect(r.totalMaaser).toBe(160_00);
    expect(r.fixedCharitiesTotal).toBe(30_00);
    expect(r.totalPaid).toBe(30_00);
    expect(r.unpaid).toBe(100_00);
  });

  it('ignores rows belonging to people outside the group', () => {
    const r = reckonMonth({
      memberIds: [ME],
      incomes: [income(ME, 100_00), income(PARTNER, 60_00)],
      fixedCharities: [charity(ME, 20_00), charity(PARTNER, 99_00)],
      payments: [],
    });

    expect(r.totalMaaser).toBe(100_00);
    expect(r.fixedCharitiesTotal).toBe(20_00);
  });

  // Money given by any member discharges the shared obligation.
  it('counts a solo payment made by one member of the group', () => {
    const r = reckonMonth({
      memberIds: [ME, PARTNER],
      incomes: [income(ME, 100_00), income(PARTNER, 60_00)],
      fixedCharities: [],
      payments: [payment([ME], 25_00)],
    });

    expect(r.totalPaid).toBe(25_00);
    expect(r.unpaid).toBe(135_00);
  });

  // A payment involving an outsider belongs to a different reckoning.
  it('excludes a payment whose members are not all in the group', () => {
    const r = reckonMonth({
      memberIds: [ME, PARTNER],
      incomes: [income(ME, 100_00)],
      fixedCharities: [],
      payments: [payment([ME, EX], 40_00)],
    });

    expect(r.totalPaid).toBe(0);
    expect(r.unpaid).toBe(100_00);
  });

  it('reports the real amount paid when the group overpays, and clamps only what remains', () => {
    const r = reckonMonth({
      memberIds: [ME],
      incomes: [income(ME, 100_00)],
      fixedCharities: [],
      payments: [payment([ME], 500_00)],
    });

    expect(r.totalPaid).toBe(500_00);
    expect(r.unpaid).toBe(0);
  });

  it('handles a month with nothing in it', () => {
    const r = reckonMonth({ memberIds: [ME], incomes: [], fixedCharities: [], payments: [] });
    expect(r).toEqual({ totalMaaser: 0, fixedCharitiesTotal: 0, totalPaid: 0, unpaid: 0 });
  });
});
