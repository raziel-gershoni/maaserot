import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Group reckoning on the history page.
 *
 * These run against a mocked Prisma client rather than the shared development
 * database, so they exercise the calculation itself and stay runnable when the
 * database is unavailable.
 */

const db = {
  income: { findMany: vi.fn() },
  groupPaymentSnapshot: { findMany: vi.fn() },
  fixedCharity: { findMany: vi.fn() },
  partnership: { findFirst: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma: db }));

const ME = 'user-me';
const PARTNER = 'user-partner';
const MONTH = '2026-09';

/** ₪1,000 of income at 10% -> ₪100 of maaser, in agorot. */
const income = (userId: string, maaser: number) => ({
  id: `inc-${userId}-${maaser}`,
  userId,
  month: MONTH,
  amount: maaser * 10,
  percentage: 10,
  maaser,
  description: null,
  isFrozen: false,
  createdAt: new Date('2026-09-01'),
});

const charity = (userId: string, amount: number) => ({
  id: `fc-${userId}-${amount}`,
  userId,
  name: 'Kollel',
  amount,
  isActive: true,
  createdAt: new Date('2026-01-01'),
});

const snapshot = (memberIds: string[], groupAmountPaid: number) => ({
  id: `snap-${memberIds.join('+')}-${groupAmountPaid}`,
  month: MONTH,
  groupOwnerId: memberIds[0],
  totalGroupMaaser: 0,
  totalGroupFixedCharities: 0,
  groupAmountPaid,
  memberStates: [],
  paidAt: new Date('2026-09-15'),
  createdAt: new Date('2026-09-15'),
  members: memberIds.map((userId) => ({
    id: `m-${userId}`,
    groupPaymentSnapshotId: 'snap',
    userId,
  })),
});

/** Wire the mock for one scenario. */
function given({
  myIncomes = [] as ReturnType<typeof income>[],
  partnerIncomes = [] as ReturnType<typeof income>[],
  myCharities = [] as ReturnType<typeof charity>[],
  partnerCharities = [] as ReturnType<typeof charity>[],
  snapshots = [] as ReturnType<typeof snapshot>[],
  partnered = false,
}) {
  db.income.findMany.mockImplementation(({ where }: never & { where: { userId: unknown } }) => {
    const u = (where as { userId: string | { in: string[] } }).userId;
    const ids = typeof u === 'string' ? [u] : u.in;
    return Promise.resolve(
      [...myIncomes, ...partnerIncomes].filter((i) => ids.includes(i.userId))
    );
  });
  db.fixedCharity.findMany.mockImplementation(({ where }: never & { where: { userId: unknown } }) => {
    const u = (where as { userId: string | { in: string[] } }).userId;
    const ids = typeof u === 'string' ? [u] : u.in;
    return Promise.resolve(
      [...myCharities, ...partnerCharities].filter((c) => ids.includes(c.userId))
    );
  });
  db.groupPaymentSnapshot.findMany.mockResolvedValue(snapshots);
  db.partnership.findFirst.mockResolvedValue(
    partnered
      ? {
          id: 'p1',
          user1Id: ME,
          user2Id: PARTNER,
          status: 'ACCEPTED',
          initiatedBy: ME,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        }
      : null
  );
}

async function stateForMonth() {
  const { calculateGroupMonthStatesInBatch } = await import('@/lib/monthState');
  const [state] = await calculateGroupMonthStatesInBatch(ME, [MONTH]);
  return state;
}

describe('calculateGroupMonthStatesInBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('reckons solo when there is no partner', async () => {
    given({
      myIncomes: [income(ME, 100_00)],
      myCharities: [charity(ME, 20_00)],
    });

    const state = await stateForMonth();

    expect(state.totalMaaser).toBe(100_00);
    expect(state.fixedCharitiesTotal).toBe(20_00);
    expect(state.unpaid).toBe(80_00);
  });

  it('includes the partner once a group payment exists that month', async () => {
    given({
      myIncomes: [income(ME, 100_00)],
      partnerIncomes: [income(PARTNER, 60_00)],
      myCharities: [charity(ME, 20_00)],
      partnerCharities: [charity(PARTNER, 10_00)],
      snapshots: [snapshot([ME, PARTNER], 30_00)],
      partnered: true,
    });

    const state = await stateForMonth();

    expect(state.totalMaaser).toBe(160_00);
    expect(state.fixedCharitiesTotal).toBe(30_00);
    expect(state.totalPaid).toBe(30_00);
    expect(state.unpaid).toBe(100_00);
  });

  // The reported bug. The dashboard sums both members' maaser for this exact
  // month; history reckoned the user alone because it derived the group from
  // payment snapshots, and no group payment had been made yet.
  it('includes the partner even when no group payment has been made yet', async () => {
    given({
      myIncomes: [income(ME, 100_00)],
      partnerIncomes: [income(PARTNER, 60_00)],
      myCharities: [charity(ME, 20_00)],
      partnerCharities: [charity(PARTNER, 10_00)],
      snapshots: [],
      partnered: true,
    });

    const state = await stateForMonth();

    expect(state.totalMaaser).toBe(160_00);
    expect(state.fixedCharitiesTotal).toBe(30_00);
    expect(state.unpaid).toBe(130_00);
  });

  it('counts a solo payment by either member against the shared obligation', async () => {
    given({
      myIncomes: [income(ME, 100_00)],
      partnerIncomes: [income(PARTNER, 60_00)],
      snapshots: [snapshot([ME], 25_00)],
      partnered: true,
    });

    const state = await stateForMonth();

    expect(state.totalMaaser).toBe(160_00);
    expect(state.totalPaid).toBe(25_00);
    expect(state.unpaid).toBe(135_00);
  });

  it('never reports a negative remaining when the group overpays', async () => {
    given({
      myIncomes: [income(ME, 100_00)],
      partnerIncomes: [income(PARTNER, 60_00)],
      snapshots: [snapshot([ME, PARTNER], 500_00)],
      partnered: true,
    });

    const state = await stateForMonth();

    expect(state.unpaid).toBe(0);
    expect(state.totalPaid).toBe(500_00);
  });
});
