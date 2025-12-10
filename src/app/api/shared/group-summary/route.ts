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
    const members = [];

    // Get selected partners (people sharing with me where isSelected = true)
    const selectedShares = await prisma.sharedAccess.findMany({
      where: {
        viewerId: session.user.id,
        isSelected: true,
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Get current user's data
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true },
    });

    const myMonthState = await calculateCurrentMonthState(session.user.id, currentMonth);

    // Add current user to members
    if (currentUser) {
      members.push({
        userId: currentUser.id,
        name: currentUser.name || '',
        email: currentUser.email,
        monthState: {
          totalMaaser: myMonthState.totalMaaser,
          fixedCharitiesTotal: myMonthState.fixedCharitiesTotal,
          unpaid: myMonthState.unpaid,
        },
      });
    }

    // Add selected partners to members
    for (const share of selectedShares) {
      const monthState = await calculateCurrentMonthState(share.owner.id, currentMonth);

      members.push({
        userId: share.owner.id,
        name: share.owner.name || '',
        email: share.owner.email,
        monthState: {
          totalMaaser: monthState.totalMaaser,
          fixedCharitiesTotal: monthState.fixedCharitiesTotal,
          unpaid: monthState.unpaid,
        },
      });
    }

    // Calculate totals
    let totalMaaser = 0;
    let totalFixedCharities = 0;
    let totalUnpaid = 0;

    for (const member of members) {
      totalMaaser += member.monthState.totalMaaser;
      totalFixedCharities += member.monthState.fixedCharitiesTotal;
      totalUnpaid += member.monthState.unpaid;
    }

    return NextResponse.json({
      members,
      totals: {
        totalMaaser,
        totalFixedCharities,
        unpaid: totalUnpaid,
      },
    });
  } catch (error) {
    console.error('Group summary error:', error);
    return NextResponse.json({ error: 'Failed to fetch group summary' }, { status: 500 });
  }
}
