import { prisma } from './prisma';

// Calculate state for a single month
export async function calculateCurrentMonthState(userId: string, month: string) {
  // Fetch all incomes for month
  const incomes = await prisma.income.findMany({
    where: { userId, month }
  });

  const totalMaaser = incomes.reduce((sum, i) => sum + i.maaser, 0);

  // Fetch group snapshots where this user is a member
  const groupSnapshots = await prisma.groupPaymentSnapshot.findMany({
    where: {
      month,
      members: { some: { userId } }
    },
    orderBy: { paidAt: 'asc' },
    include: { members: true }
  });

  // Calculate fixed charities and total paid
  const fixedCharities = await prisma.fixedCharity.findMany({
    where: { userId, isActive: true }
  });

  let fixedCharitiesTotal = 0;
  let totalPaid = 0;

  // Check if user has made any solo payments (group of 1)
  const soloSnapshots = groupSnapshots.filter(s => s.members.length === 1);

  if (soloSnapshots.length > 0) {
    // Use first solo payment's fixed charities
    fixedCharitiesTotal = soloSnapshots[0].totalGroupFixedCharities;
    totalPaid = soloSnapshots.reduce((sum, s) => sum + s.groupAmountPaid, 0);
  } else {
    // No solo payments yet
    fixedCharitiesTotal = fixedCharities.reduce((sum, c) => sum + c.amount, 0);
  }

  // Unpaid amount this month (calculated directly)
  const unpaid = Math.max(0, totalMaaser - fixedCharitiesTotal - totalPaid);

  return {
    totalMaaser,
    fixedCharitiesTotal,
    totalPaid,
    unpaid,
    snapshots: groupSnapshots,
    hasPayments: groupSnapshots.length > 0
  };
}

// Calculate accumulated unpaid across all months (for overflow handling)
export async function calculateTotalAccumulatedUnpaid(
  userId: string,
  upToMonth: string
): Promise<number> {
  // Get all distinct months that have incomes or snapshots
  const incomeMonths = await prisma.income.findMany({
    where: { userId },
    select: { month: true },
    distinct: ['month']
  });

  const snapshotMonths = await prisma.groupPaymentSnapshot.findMany({
    where: {
      members: { some: { userId } }
    },
    select: { month: true },
    distinct: ['month']
  });

  // Combine and deduplicate months
  const allMonthsSet = new Set<string>([
    ...incomeMonths.map(i => i.month),
    ...snapshotMonths.map(s => s.month)
  ]);

  // Filter to months <= upToMonth and sort
  const allMonths = Array.from(allMonthsSet)
    .filter(m => m <= upToMonth)
    .sort();

  // Sum unpaid amounts across all months
  let totalAccumulated = 0;
  for (const month of allMonths) {
    const state = await calculateCurrentMonthState(userId, month);
    totalAccumulated += state.unpaid;
  }

  return totalAccumulated;
}
