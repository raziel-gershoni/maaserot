import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma, type FakeDb, type FakeUser } from './fakePrisma';
import { maaserFor } from '@/lib/calculations';

/**
 * The one path that writes an Income: the web form and the bot's ✅ both go
 * through `addIncome`, and both tell the partner through
 * `notifyPartnerOfIncome`. Telegram and the month reckoning are mocked; the
 * rows live in the in-memory fake.
 */

const ME = 'u1';
const PARTNER = 'u2';

const notifyPartnerIncomeAdded = vi.fn();
const calculateGroupMonthState = vi.fn();

let db: FakeDb;

const user = (over: Partial<FakeUser> & { id: string }): FakeUser => ({
  name: null,
  telegramId: null,
  locale: 'he',
  defaultPercent: 10,
  ...over,
});

async function load(seed: Partial<FakeDb> = {}) {
  const fake = createFakePrisma(seed);
  db = fake.db;
  vi.doMock('@/lib/prisma', () => ({ prisma: fake.client }));
  vi.doMock('@/lib/telegramNotify', () => ({ notifyPartnerIncomeAdded }));
  vi.doMock('@/lib/monthState', () => ({ calculateGroupMonthState }));
  return import('@/lib/incomes');
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  notifyPartnerIncomeAdded.mockResolvedValue(true);
  calculateGroupMonthState.mockResolvedValue({ unpaid: 777 });
});

describe('addIncome', () => {
  it('stores the income with its maaser, unfrozen', async () => {
    const { addIncome } = await load();

    await addIncome(ME, { month: '2026-10', amount: 50, percentage: 29 });

    expect(db.incomes).toHaveLength(1);
    expect(db.incomes[0]).toMatchObject({
      userId: ME,
      month: '2026-10',
      amount: 50,
      percentage: 29,
      // The shared rounding rule, not an exact rewrite of it: 50 * 0.29 is
      // 14.4999… in binary, so every existing row for this case holds 14.
      maaser: maaserFor(50, 29),
      description: null,
      isFrozen: false,
    });
    expect(db.incomes[0].maaser).toBe(14);
  });

  it.each([
    ['a month that does not exist', { month: '2026-13' }],
    ['a zero amount', { amount: 0 }],
    ['a fractional amount', { amount: 1.5 }],
    ['a zero percentage', { percentage: 0 }],
    ['a percentage over 100', { percentage: 101 }],
    // Past the Postgres integer column: Prisma would fail, and the form hear SERVER_ERROR.
    ['an amount the amount column cannot hold', { amount: 2_147_483_648 }],
  ])('rejects %s and writes nothing', async (_label, over) => {
    const { addIncome, IncomeError } = await load();

    const attempt = addIncome(ME, { month: '2026-10', amount: 50, percentage: 29, ...over });

    await expect(attempt).rejects.toBeInstanceOf(IncomeError);
    await expect(attempt).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 400 });
    expect(db.incomes).toHaveLength(0);
  });
});

describe('addIncome bounds', () => {
  it('takes the largest amount the column holds', async () => {
    const { addIncome } = await load();

    await addIncome(ME, { month: '2026-10', amount: 2_147_483_647, percentage: 10 });

    expect(db.incomes.map((i) => i.amount)).toEqual([2_147_483_647]);
  });
});

describe('notifyPartnerOfIncome', () => {
  it('tells the partner what is left to pay for the month the income was filed in', async () => {
    const { notifyPartnerOfIncome } = await load({
      users: [
        user({ id: ME, name: 'Dana' }),
        user({ id: PARTNER, name: 'Avi', telegramId: BigInt(99), locale: 'he' }),
      ],
      partnerships: [{ id: 'p1', user1Id: ME, user2Id: PARTNER, status: 'ACCEPTED' }],
    });

    await notifyPartnerOfIncome(ME, '2026-09', 1000);

    expect(calculateGroupMonthState).toHaveBeenCalledWith(ME, '2026-09');
    expect(notifyPartnerIncomeAdded).toHaveBeenCalledTimes(1);
    expect(notifyPartnerIncomeAdded).toHaveBeenCalledWith(
      BigInt(99), 'he', 'Dana', 1000, 777, '2026-09'
    );
  });

  it('sends nothing without an accepted partnership', async () => {
    const { notifyPartnerOfIncome } = await load({
      users: [
        user({ id: ME, name: 'Dana' }),
        user({ id: PARTNER, name: 'Avi', telegramId: BigInt(99) }),
      ],
      partnerships: [{ id: 'p1', user1Id: ME, user2Id: PARTNER, status: 'PENDING' }],
    });

    await notifyPartnerOfIncome(ME, '2026-09', 1000);

    expect(notifyPartnerIncomeAdded).not.toHaveBeenCalled();
  });

  it('sends nothing when the partner has not linked Telegram', async () => {
    const { notifyPartnerOfIncome } = await load({
      users: [user({ id: ME, name: 'Dana', telegramId: BigInt(98) }), user({ id: PARTNER })],
      partnerships: [{ id: 'p1', user1Id: PARTNER, user2Id: ME, status: 'ACCEPTED' }],
    });

    await notifyPartnerOfIncome(ME, '2026-09', 1000);

    expect(notifyPartnerIncomeAdded).not.toHaveBeenCalled();
    // Nor is the month reckoned for a message nobody will get.
    expect(calculateGroupMonthState).not.toHaveBeenCalled();
  });
});
