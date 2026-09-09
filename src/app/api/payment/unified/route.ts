import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateCurrentMonthState } from '@/lib/monthState';
import { apiError } from '../../_lib/apiError';

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return apiError('UNAUTHORIZED', 401);
    }

    const { month, memberIds, paymentAmount } = await request.json();

    if (!month || !memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return apiError('VALIDATION_FAILED', 400);
    }

    if (paymentAmount === undefined || paymentAmount === null) {
      return apiError('VALIDATION_FAILED', 400);
    }

    // Same requests rejected as before, split so a zero or negative amount
    // reads as "there is nothing to pay" rather than a malformed request.
    if (paymentAmount <= 0) {
      return apiError('NOTHING_TO_PAY', 400);
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
    return apiError('SERVER_ERROR', 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return apiError('UNAUTHORIZED', 401);
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return apiError('VALIDATION_FAILED', 400);
    }

    // Verify user is a member of this payment
    const member = await prisma.groupPaymentMember.findFirst({
      where: { groupPaymentSnapshotId: id, userId: session.user.id },
    });

    if (!member) {
      // No PAYMENT_NOT_FOUND code exists yet; the generic code keeps the 404
      // from leaking English prose.
      return apiError('VALIDATION_FAILED', 404);
    }

    // Delete snapshot (GroupPaymentMember cascades automatically)
    await prisma.groupPaymentSnapshot.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete payment error:', error);
    return apiError('SERVER_ERROR', 500);
  }
}
