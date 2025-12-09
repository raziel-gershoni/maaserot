import { prisma } from './prisma';

// Calculate state for a single month
export async function calculateCurrentMonthState(userId: string, month: string) {
  // Fetch all incomes for month
  const incomes = await prisma.income.findMany({
    where: { userId, month }
  });

  const totalMaaser = incomes.reduce((sum, i) => sum + i.maaser, 0);

  // Fetch all payment snapshots for month
  const snapshots = await prisma.paymentSnapshot.findMany({
    where: { userId, month },
    orderBy: { paidAt: 'asc' }
  });

  // Fixed charities deducted in first payment only
  const fixedCharities = await prisma.fixedCharity.findMany({
    where: { userId, isActive: true }
  });
  const fixedCharitiesTotal = snapshots.length === 0
    ? fixedCharities.reduce((sum, c) => sum + c.amount, 0)
    : snapshots[0].fixedCharitiesTotal;

  // Calculate total paid this month
  const totalPaid = snapshots.reduce((sum, s) => sum + s.amountPaid, 0);

  // Extra to give this month
  const extraToGive = Math.max(0, totalMaaser - fixedCharitiesTotal);

  // Unpaid amount this month
  const unpaid = Math.max(0, extraToGive - totalPaid);

  return {
    totalMaaser,
    fixedCharitiesTotal,
    extraToGive,
    totalPaid,
    unpaid,
    snapshots,
    hasPayments: snapshots.length > 0
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

  const snapshotMonths = await prisma.paymentSnapshot.findMany({
    where: { userId },
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
