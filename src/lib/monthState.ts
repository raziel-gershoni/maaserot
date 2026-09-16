import { prisma } from './prisma';
import { reckonMonth, resolveGroupMembers } from './reckoning';

/**
 * Loading the rows a reckoning needs.
 *
 * The arithmetic itself lives in ./reckoning — these functions only fetch.
 * Keeping the two apart is what lets the rules be tested without a database
 * and stops them drifting between screens, which is how the dashboard and the
 * history page came to report different amounts for the same month.
 */

export interface MonthState {
  month: string;
  totalMaaser: number;
  fixedCharitiesTotal: number;
  totalPaid: number;
  unpaid: number;
  snapshots: Awaited<ReturnType<typeof fetchSnapshots>>;
  hasPayments: boolean;
}

function fetchSnapshots(userId: string, months: string[]) {
  return prisma.groupPaymentSnapshot.findMany({
    where: { month: { in: months }, members: { some: { userId } } },
    orderBy: { paidAt: 'asc' },
    include: { members: true },
  });
}

/**
 * One user's own position for a month: their maaser, their commitments, and
 * every payment they took part in. This is the per-person view — for what a
 * couple owes together, use the group functions below.
 */
export async function calculateCurrentMonthState(userId: string, month: string) {
  const [incomes, snapshots, fixedCharities] = await Promise.all([
    prisma.income.findMany({ where: { userId, month } }),
    fetchSnapshots(userId, [month]),
    prisma.fixedCharity.findMany({ where: { userId, isActive: true } }),
  ]);

  const reckoning = reckonMonth({
    memberIds: [userId],
    incomes,
    fixedCharities,
    // Every snapshot here already involves this user, and from their own
    // perspective the whole amount counts against what they were part of.
    payments: snapshots.map((s) => ({
      memberIds: [userId],
      groupAmountPaid: s.groupAmountPaid,
    })),
  });

  return {
    ...reckoning,
    snapshots,
    hasPayments: snapshots.length > 0,
  };
}

/**
 * Group state for many months at once, in a fixed number of round trips
 * regardless of how many months are asked for.
 */
export async function calculateGroupMonthStatesInBatch(
  userId: string,
  months: string[]
): Promise<MonthState[]> {
  if (months.length === 0) return [];

  const [ownIncomes, allSnapshots, ownCharities, partnership] = await Promise.all([
    prisma.income.findMany({ where: { userId, month: { in: months } } }),
    fetchSnapshots(userId, months),
    prisma.fixedCharity.findMany({ where: { userId, isActive: true } }),
    // The standing partnership, not just whoever appears in past payments: a
    // month with a partner but no group payment yet is still a joint month.
    prisma.partnership.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      select: { user1Id: true, user2Id: true },
    }),
  ]);

  const currentPartnerId = partnership
    ? partnership.user1Id === userId
      ? partnership.user2Id
      : partnership.user1Id
    : null;

  // Everyone whose rows we may need: the standing partner, plus anyone this
  // user has previously settled a month with, who may no longer be a partner.
  const otherIds = new Set<string>();
  if (currentPartnerId) otherIds.add(currentPartnerId);
  for (const snapshot of allSnapshots) {
    if (snapshot.members.length > 1) {
      for (const member of snapshot.members) {
        if (member.userId !== userId) otherIds.add(member.userId);
      }
    }
  }

  let otherIncomes: typeof ownIncomes = [];
  let otherCharities: typeof ownCharities = [];
  if (otherIds.size > 0) {
    const ids = [...otherIds];
    [otherIncomes, otherCharities] = await Promise.all([
      prisma.income.findMany({ where: { userId: { in: ids }, month: { in: months } } }),
      prisma.fixedCharity.findMany({ where: { userId: { in: ids }, isActive: true } }),
    ]);
  }

  const incomes = [...ownIncomes, ...otherIncomes];
  const fixedCharities = [...ownCharities, ...otherCharities];

  const snapshotsByMonth = new Map<string, typeof allSnapshots>();
  for (const snapshot of allSnapshots) {
    const list = snapshotsByMonth.get(snapshot.month) ?? [];
    list.push(snapshot);
    snapshotsByMonth.set(snapshot.month, list);
  }

  return months.map((month) => {
    const monthSnapshots = snapshotsByMonth.get(month) ?? [];

    const settledWith = new Set<string>();
    for (const snapshot of monthSnapshots) {
      if (snapshot.members.length > 1) {
        for (const member of snapshot.members) settledWith.add(member.userId);
      }
    }

    const memberIds = resolveGroupMembers({
      userId,
      partnerId: currentPartnerId,
      settledWith: [...settledWith],
    });

    const reckoning = reckonMonth({
      memberIds,
      incomes: incomes.filter((i) => i.month === month),
      fixedCharities,
      payments: monthSnapshots.map((s) => ({
        memberIds: s.members.map((m) => m.userId),
        groupAmountPaid: s.groupAmountPaid,
      })),
    });

    return {
      month,
      ...reckoning,
      snapshots: monthSnapshots,
      hasPayments: monthSnapshots.length > 0,
    };
  });
}

/** Group state for a single month. The dashboard's source of truth. */
export async function calculateGroupMonthState(userId: string, month: string) {
  const [state] = await calculateGroupMonthStatesInBatch(userId, [month]);
  return state;
}
