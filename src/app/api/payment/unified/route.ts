import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateCurrentMonthState } from '@/lib/monthState';

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { month, memberIds, paymentAmount } = await request.json();

    if (!month || !memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: month and memberIds are required' },
        { status: 400 }
      );
    }

    if (paymentAmount === undefined || paymentAmount === null || paymentAmount <= 0) {
      return NextResponse.json(
        { error: 'Invalid payment amount' },
        { status: 400 }
      );
    }

    // Calculate totals for all members
    let totalGroupMaaser = 0;
    let totalGroupFixedCharities = 0;
    const memberStates = [];

    for (const userId of memberIds) {
      const state = await calculateCurrentMonthState(userId, month);

      // Check if this user has ANY prior payments this month
      const priorPayments = await prisma.groupPaymentSnapshot.findFirst({
        where: {
          month,
          members: { some: { userId } }
        }
      });

      // Only include fixed charities if this is user's first payment
      const fixedCharitiesForUser = !priorPayments ? state.fixedCharitiesTotal : 0;

      totalGroupMaaser += state.totalMaaser;
      totalGroupFixedCharities += fixedCharitiesForUser;

      memberStates.push({
        userId,
        totalMaaser: state.totalMaaser,
        fixedCharitiesTotal: fixedCharitiesForUser,
        unpaid: state.unpaid
      });
    }

    // Create group snapshot
    const snapshot = await prisma.groupPaymentSnapshot.create({
      data: {
        month,
        groupOwnerId: session.user.id,
        totalGroupMaaser,
        totalGroupFixedCharities,
        groupAmountPaid: paymentAmount,
        memberStates,
        members: {
          create: memberIds.map((userId: string) => ({ userId }))
        }
      },
      include: { members: true }
    });

    // Freeze all current unfrozen incomes for all members
    for (const userId of memberIds) {
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
    }

    return NextResponse.json({ success: true, snapshot });
  } catch (error) {
    console.error('Payment error:', error);
    return NextResponse.json(
      { error: 'Failed to process payment' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing payment id' }, { status: 400 });
    }

    // Verify user is a member of this payment
    const member = await prisma.groupPaymentMember.findFirst({
      where: { groupPaymentSnapshotId: id, userId: session.user.id },
    });

    if (!member) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // Delete snapshot (GroupPaymentMember cascades automatically)
    await prisma.groupPaymentSnapshot.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete payment error:', error);
    return NextResponse.json(
      { error: 'Failed to delete payment' },
      { status: 500 }
    );
  }
}
