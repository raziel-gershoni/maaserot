import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateCurrentMonthState } from '@/lib/monthState';

export async function PATCH(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { month } = await request.json();

    if (!month) {
      return NextResponse.json(
        { error: 'Month is required' },
        { status: 400 }
      );
    }

    // Get selected partner IDs (people sharing with current user where isSelected = true)
    const selectedShares = await prisma.sharedAccess.findMany({
      where: {
        viewerId: session.user.id,
        isSelected: true,
      },
      select: {
        ownerId: true,
      },
    });

    const partnerIds = selectedShares.map((share) => share.ownerId);
    const allUserIds = [session.user.id, ...partnerIds];

    // Create payment snapshots for ALL group members
    // Each snapshot stores the individual's own unpaid amount (not group-distributed)
    const snapshots = [];
    for (const userId of allUserIds) {
      const state = await calculateCurrentMonthState(userId, month);

      // Get incomes for snapshot
      const incomes = await prisma.income.findMany({
        where: { userId, month },
        select: { id: true, amount: true, percentage: true, maaser: true, description: true }
      });

      // Get fixed charities for snapshot
      const fixedCharities = await prisma.fixedCharity.findMany({
        where: { userId, isActive: true },
        select: { name: true, amount: true }
      });

      // Determine if this is first payment (affects fixed charity deduction)
      const isFirstPayment = state.snapshots.length === 0;
      const fixedCharitiesTotal = isFirstPayment
        ? fixedCharities.reduce((sum, c) => sum + c.amount, 0)
        : 0;

      // Create snapshot with individual's own unpaid amount
      // Group totals will be recalculated dynamically on dashboard using group logic
      const snapshot = await prisma.paymentSnapshot.create({
        data: {
          userId,
          month,
          totalMaaser: state.totalMaaser,
          fixedCharitiesTotal,
          amountPaid: state.unpaid, // Individual's own unpaid (may be 0)
          incomeSnapshot: incomes,
          fixedCharitiesSnapshot: fixedCharities,
        }
      });

      // Freeze all current unfrozen incomes for this member
      await prisma.income.updateMany({
        where: {
          userId,
          month,
          isFrozen: false
        },
        data: {
          isFrozen: true
        }
      });

      snapshots.push(snapshot);
    }

    return NextResponse.json({
      success: true,
      created: snapshots.length
    });
  } catch (error) {
    console.error('Group payment error:', error);
    return NextResponse.json({ error: 'Failed to create group payment snapshots' }, { status: 500 });
  }
}
