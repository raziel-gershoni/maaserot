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
    const summary = [];

    // Get my own unpaid amount
    const myMonthState = await prisma.monthState.findUnique({
      where: {
        userId_month: {
          userId: session.user.id,
          month: currentMonth,
        },
      },
    });

    const myUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true },
    });

    // Only include if unpaid
    if (myMonthState && !myMonthState.isPaid && myMonthState.extraToGive > 0) {
      summary.push({
        userId: session.user.id,
        userName: myUser?.name || '',
        userEmail: myUser?.email || '',
        extraToGive: myMonthState.extraToGive,
      });
    }

    // Get people sharing with me
    const sharedWithMe = await prisma.sharedAccess.findMany({
      where: { viewerId: session.user.id },
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

    // Get their unpaid amounts
    for (const share of sharedWithMe) {
      const monthState = await prisma.monthState.findUnique({
        where: {
          userId_month: {
            userId: share.owner.id,
            month: currentMonth,
          },
        },
      });

      // Only include if unpaid
      if (monthState && !monthState.isPaid && monthState.extraToGive > 0) {
        summary.push({
          userId: share.owner.id,
          userName: share.owner.name || '',
          userEmail: share.owner.email,
          extraToGive: monthState.extraToGive,
        });
      }
    }

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Combined summary error:', error);
    return NextResponse.json({ error: 'Failed to fetch combined summary' }, { status: 500 });
  }
}
