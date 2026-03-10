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

  // Always use live active charities for dashboard calculation
  const fixedCharitiesTotal = fixedCharities.reduce((sum, c) => sum + c.amount, 0);

  // Sum all payments where user participated
  const totalPaid = groupSnapshots.reduce((sum, s) => sum + s.groupAmountPaid, 0);

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

// Calculate group-aware month state for a user
// For solo-only months, returns individual state as-is.
// For months with group payments, calculates at the group level
// (summing all members' maaser/fixed charities, subtracting group payments).
export async function calculateGroupMonthState(userId: string, month: string) {
  const individualState = await calculateCurrentMonthState(userId, month);

  // Check if any snapshots have more than 1 member (group payments)
  const hasGroupSnapshots = individualState.snapshots.some(s => s.members.length > 1);

  if (!hasGroupSnapshots) {
    // Solo-only month — individual state is correct
    return individualState;
  }

  // Collect all partner IDs from group snapshots
  const partnerIds = new Set<string>();
  for (const snapshot of individualState.snapshots) {
    if (snapshot.members.length > 1) {
      for (const member of snapshot.members) {
        if (member.userId !== userId) {
          partnerIds.add(member.userId);
        }
      }
    }
  }

  // Fetch all members' individual states
  const allMemberIds = [userId, ...Array.from(partnerIds)];
  const memberStates = await Promise.all(
    allMemberIds.map(id => calculateCurrentMonthState(id, month))
  );

  // Sum maaser and fixed charities across all members
  let totalMaaser = 0;
  let totalFixedCharities = 0;
  for (const state of memberStates) {
    totalMaaser += state.totalMaaser;
    totalFixedCharities += state.fixedCharitiesTotal;
  }

  // Filter to exact-composition group snapshots (matching this group)
  const sortedMemberIds = [...allMemberIds].sort();
  const exactGroupSnapshots = individualState.snapshots.filter(snapshot => {
    const snapshotMemberIds = snapshot.members.map(m => m.userId).sort();
    return JSON.stringify(snapshotMemberIds) === JSON.stringify(sortedMemberIds);
  });

  // Always use live fixed charities for dashboard calculation
  let groupPaid = 0;
  for (const snapshot of exactGroupSnapshots) {
    groupPaid += snapshot.groupAmountPaid;
  }

  const groupUnpaid = Math.max(0, totalMaaser - totalFixedCharities - groupPaid);

  return {
    totalMaaser,
    fixedCharitiesTotal: totalFixedCharities,
    totalPaid: groupPaid,
    unpaid: groupUnpaid,
    snapshots: individualState.snapshots,
    hasPayments: individualState.hasPayments,
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
