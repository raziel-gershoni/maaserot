import { prisma } from './prisma';

// Calculate state for a single month
export async function calculateCurrentMonthState(userId: string, month: string) {
  // Fetch all data in parallel - these queries are independent
  const [incomes, groupSnapshots, fixedCharities] = await Promise.all([
    prisma.income.findMany({
      where: { userId, month },
    }),
    prisma.groupPaymentSnapshot.findMany({
      where: {
        month,
        members: { some: { userId } },
      },
      orderBy: { paidAt: 'asc' },
      include: { members: true },
    }),
    prisma.fixedCharity.findMany({
      where: { userId, isActive: true },
    }),
  ]);

  const totalMaaser = incomes.reduce((sum, i) => sum + i.maaser, 0);

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

// Batch calculate group month states for multiple months (avoids N+1 queries)
export async function calculateGroupMonthStatesInBatch(userId: string, months: string[]) {
  if (months.length === 0) return [];

  // Phase 1: Fetch all user data across all months in 3 parallel queries
  const [allIncomes, allSnapshots, fixedCharities] = await Promise.all([
    prisma.income.findMany({
      where: { userId, month: { in: months } },
    }),
    prisma.groupPaymentSnapshot.findMany({
      where: {
        month: { in: months },
        members: { some: { userId } },
      },
      orderBy: { paidAt: 'asc' },
      include: { members: true },
    }),
    prisma.fixedCharity.findMany({
      where: { userId, isActive: true },
    }),
  ]);

  const fixedCharitiesTotal = fixedCharities.reduce((sum, c) => sum + c.amount, 0);

  // Discover all partner IDs from group snapshots
  const partnerIds = new Set<string>();
  for (const snapshot of allSnapshots) {
    if (snapshot.members.length > 1) {
      for (const member of snapshot.members) {
        if (member.userId !== userId) partnerIds.add(member.userId);
      }
    }
  }

  // Phase 2: Fetch partner data in bulk if needed (2 parallel queries)
  let partnerIncomes: typeof allIncomes = [];
  let partnerFixedCharitiesMap = new Map<string, number>();
  if (partnerIds.size > 0) {
    const partnerIdArray = [...partnerIds];
    const [pIncomes, pCharities] = await Promise.all([
      prisma.income.findMany({
        where: { userId: { in: partnerIdArray }, month: { in: months } },
      }),
      prisma.fixedCharity.findMany({
        where: { userId: { in: partnerIdArray }, isActive: true },
      }),
    ]);
    partnerIncomes = pIncomes;
    for (const charity of pCharities) {
      partnerFixedCharitiesMap.set(
        charity.userId,
        (partnerFixedCharitiesMap.get(charity.userId) || 0) + charity.amount
      );
    }
  }

  // Group data by month and compute in memory
  const incomesByMonth = new Map<string, typeof allIncomes>();
  for (const income of [...allIncomes, ...partnerIncomes]) {
    const key = `${income.userId}:${income.month}`;
    if (!incomesByMonth.has(key)) incomesByMonth.set(key, []);
    incomesByMonth.get(key)!.push(income);
  }

  const snapshotsByMonth = new Map<string, typeof allSnapshots>();
  for (const snapshot of allSnapshots) {
    if (!snapshotsByMonth.has(snapshot.month)) snapshotsByMonth.set(snapshot.month, []);
    snapshotsByMonth.get(snapshot.month)!.push(snapshot);
  }

  return months.map(month => {
    const monthSnapshots = snapshotsByMonth.get(month) || [];
    const userIncomes = incomesByMonth.get(`${userId}:${month}`) || [];
    const userTotalMaaser = userIncomes.reduce((sum, i) => sum + i.maaser, 0);
    const totalPaid = monthSnapshots.reduce((sum, s) => sum + s.groupAmountPaid, 0);

    // Check if any snapshots have group members
    const hasGroupSnapshots = monthSnapshots.some(s => s.members.length > 1);

    if (!hasGroupSnapshots) {
      // Solo-only month
      const unpaid = Math.max(0, userTotalMaaser - fixedCharitiesTotal - totalPaid);
      return {
        month,
        totalMaaser: userTotalMaaser,
        fixedCharitiesTotal,
        totalPaid,
        unpaid,
        snapshots: monthSnapshots,
        hasPayments: monthSnapshots.length > 0,
      };
    }

    // Group month - collect all member IDs from snapshots
    const memberIdsInMonth = new Set<string>([userId]);
    for (const snapshot of monthSnapshots) {
      if (snapshot.members.length > 1) {
        for (const member of snapshot.members) {
          memberIdsInMonth.add(member.userId);
        }
      }
    }

    // Sum maaser and fixed charities across all members
    let totalMaaser = userTotalMaaser;
    let totalFixedCharities = fixedCharitiesTotal;
    for (const partnerId of memberIdsInMonth) {
      if (partnerId === userId) continue;
      const pIncomes = incomesByMonth.get(`${partnerId}:${month}`) || [];
      totalMaaser += pIncomes.reduce((sum, i) => sum + i.maaser, 0);
      totalFixedCharities += partnerFixedCharitiesMap.get(partnerId) || 0;
    }

    // Filter to exact-composition group snapshots
    const sortedMemberIds = [...memberIdsInMonth].sort();
    const exactGroupSnapshots = monthSnapshots.filter(snapshot => {
      const snapshotMemberIds = snapshot.members.map(m => m.userId).sort();
      return JSON.stringify(snapshotMemberIds) === JSON.stringify(sortedMemberIds);
    });

    let groupPaid = 0;
    for (const snapshot of exactGroupSnapshots) {
      groupPaid += snapshot.groupAmountPaid;
    }

    const groupUnpaid = Math.max(0, totalMaaser - totalFixedCharities - groupPaid);

    return {
      month,
      totalMaaser,
      fixedCharitiesTotal: totalFixedCharities,
      totalPaid: groupPaid,
      unpaid: groupUnpaid,
      snapshots: monthSnapshots,
      hasPayments: monthSnapshots.length > 0,
    };
  });
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

  // Calculate all months in parallel
  const states = await Promise.all(
    allMonths.map(month => calculateCurrentMonthState(userId, month))
  );

  return states.reduce((sum, state) => sum + state.unpaid, 0);
}
