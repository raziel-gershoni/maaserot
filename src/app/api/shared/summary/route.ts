import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentMonth } from '@/lib/calculations';
import { calculateCurrentMonthState } from '@/lib/monthState';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentMonth = getCurrentMonth();

    let totalMaaser = 0;
    let totalFixedCharities = 0;
    let totalUnpaid = 0;

    // Get my own month state
    const myMonthState = await calculateCurrentMonthState(session.user.id, currentMonth);
    totalMaaser += myMonthState.totalMaaser;
    totalFixedCharities += myMonthState.fixedCharitiesTotal;
    totalUnpaid += myMonthState.unpaid;

    // Get people sharing with me
    const sharedWithMe = await prisma.sharedAccess.findMany({
      where: { viewerId: session.user.id },
    });

    // Get their month states and sum up
    for (const share of sharedWithMe) {
      const monthState = await calculateCurrentMonthState(share.ownerId, currentMonth);
      totalMaaser += monthState.totalMaaser;
      totalFixedCharities += monthState.fixedCharitiesTotal;
      totalUnpaid += monthState.unpaid;
    }

    return NextResponse.json({
      totalMaaser,
      totalFixedCharities,
      unpaid: totalUnpaid,
    });
  } catch (error) {
    console.error('Combined summary error:', error);
    return NextResponse.json({ error: 'Failed to fetch combined summary' }, { status: 500 });
  }
}
