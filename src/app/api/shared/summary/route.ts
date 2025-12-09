import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentMonth } from '@/lib/calculations';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentMonth = getCurrentMonth();

    let totalMaaser = 0;
    let totalFixedCharities = 0;
    let hasUnpaid = false;

    // Get my own month state
    const myMonthState = await prisma.monthState.findUnique({
      where: {
        userId_month: {
          userId: session.user.id,
          month: currentMonth,
        },
      },
    });

    if (myMonthState) {
      if (!myMonthState.isPaid) {
        hasUnpaid = true;
      }
      totalMaaser += myMonthState.totalMaaser;
      totalFixedCharities += myMonthState.fixedCharitiesTotal;
    }

    // Get people sharing with me
    const sharedWithMe = await prisma.sharedAccess.findMany({
      where: { viewerId: session.user.id },
    });

    // Get their month states and sum up
    for (const share of sharedWithMe) {
      const monthState = await prisma.monthState.findUnique({
        where: {
          userId_month: {
            userId: share.ownerId,
            month: currentMonth,
          },
        },
      });

      if (monthState) {
        if (!monthState.isPaid) {
          hasUnpaid = true;
        }
        totalMaaser += monthState.totalMaaser;
        totalFixedCharities += monthState.fixedCharitiesTotal;
      }
    }

    // Calculate unpaid amount
    const unpaid = hasUnpaid ? Math.max(0, totalMaaser - totalFixedCharities) : 0;

    return NextResponse.json({
      totalMaaser,
      totalFixedCharities,
      unpaid,
    });
  } catch (error) {
    console.error('Combined summary error:', error);
    return NextResponse.json({ error: 'Failed to fetch combined summary' }, { status: 500 });
  }
}
