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

  // Count ALL snapshots where user is a member (solo or group)
  if (groupSnapshots.length > 0) {
    // Extract THIS USER's fixed charities from the first payment's memberStates
    const firstSnapshot = groupSnapshots[0];
    const memberStates = firstSnapshot.memberStates as Array<{
      userId: string;
      fixedCharitiesTotal: number;
    }> | null;

    if (memberStates && Array.isArray(memberStates)) {
      const userState = memberStates.find(m => m.userId === userId);
      fixedCharitiesTotal = userState?.fixedCharitiesTotal ?? 0;
    } else {
      // Fallback for old snapshots without memberStates
      fixedCharitiesTotal = fixedCharities.reduce((sum, c) => sum + c.amount, 0);
    }

    // Sum all payments where user participated
    totalPaid = groupSnapshots.reduce((sum, s) => sum + s.groupAmountPaid, 0);
  } else {
    // No payments yet
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
