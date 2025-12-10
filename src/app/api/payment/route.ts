import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateCurrentMonthState, calculateTotalAccumulatedUnpaid } from '@/lib/monthState';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { month, amountPaid } = await request.json();

    if (!month || !amountPaid || amountPaid <= 0) {
      return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 });
    }

    // Get current month state
    const state = await calculateCurrentMonthState(session.user.id, month);

    // Get total accumulated unpaid (for validation against total debt)
    const totalAccumulatedUnpaid = await calculateTotalAccumulatedUnpaid(session.user.id, month);

    // Validate payment amount - can pay up to total accumulated debt
    if (amountPaid > totalAccumulatedUnpaid) {
      return NextResponse.json({
        error: 'Payment amount exceeds total unpaid balance'
      }, { status: 400 });
    }

    // Get incomes for snapshot
    const incomes = await prisma.income.findMany({
      where: { userId: session.user.id, month },
      select: { id: true, amount: true, percentage: true, maaser: true, description: true }
    });

    // Get fixed charities for snapshot
    const fixedCharities = await prisma.fixedCharity.findMany({
      where: { userId: session.user.id, isActive: true },
      select: { name: true, amount: true }
    });

    // Determine if this is first payment (affects fixed charity deduction)
    const isFirstPayment = state.snapshots.length === 0;
    const fixedCharitiesTotal = isFirstPayment
      ? fixedCharities.reduce((sum, c) => sum + c.amount, 0)
      : 0;

    // Create snapshot
    const snapshot = await prisma.paymentSnapshot.create({
      data: {
        userId: session.user.id,
        month,
        totalMaaser: state.totalMaaser,
        fixedCharitiesTotal,
        amountPaid,
        incomeSnapshot: incomes,
        fixedCharitiesSnapshot: fixedCharities,
      }
    });

    // Freeze all current unfrozen incomes
    await prisma.income.updateMany({
      where: {
        userId: session.user.id,
        month,
        isFrozen: false
      },
      data: {
        isFrozen: true
      }
    });

    return NextResponse.json({ snapshot });
  } catch (error) {
    console.error('Error creating payment snapshot:', error);
    return NextResponse.json(
      { error: 'Failed to create payment snapshot' },
      { status: 500 }
    );
  }
}
