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

    const myMonthState = await prisma.monthState.findUnique({
      where: {
        userId_month: {
          userId: session.user.id,
          month: currentMonth,
        },
      },
    });

    // Add current user to members
    if (currentUser) {
      members.push({
        userId: currentUser.id,
        name: currentUser.name || '',
        email: currentUser.email,
        monthState: myMonthState
          ? {
              totalMaaser: myMonthState.totalMaaser,
              fixedCharitiesTotal: myMonthState.fixedCharitiesTotal,
              extraToGive: myMonthState.extraToGive,
              isPaid: myMonthState.isPaid,
            }
          : null,
      });
    }

    // Add selected partners to members
    for (const share of selectedShares) {
      const monthState = await prisma.monthState.findUnique({
        where: {
          userId_month: {
            userId: share.owner.id,
            month: currentMonth,
          },
        },
      });

      members.push({
        userId: share.owner.id,
        name: share.owner.name || '',
        email: share.owner.email,
        monthState: monthState
          ? {
              totalMaaser: monthState.totalMaaser,
              fixedCharitiesTotal: monthState.fixedCharitiesTotal,
              extraToGive: monthState.extraToGive,
              isPaid: monthState.isPaid,
            }
          : null,
      });
    }

    // Calculate totals
    let totalMaaser = 0;
    let totalFixedCharities = 0;
    let totalExtraToGive = 0;
    let hasUnpaid = false;

    for (const member of members) {
      if (member.monthState) {
        totalMaaser += member.monthState.totalMaaser;
        totalFixedCharities += member.monthState.fixedCharitiesTotal;
        totalExtraToGive += member.monthState.extraToGive;
        if (!member.monthState.isPaid) {
          hasUnpaid = true;
        }
      }
    }

    return NextResponse.json({
      members,
      totals: {
        totalMaaser,
        totalFixedCharities,
        extraToGive: totalExtraToGive,
        hasUnpaid,
      },
    });
  } catch (error) {
    console.error('Group summary error:', error);
    return NextResponse.json({ error: 'Failed to fetch group summary' }, { status: 500 });
  }
}
