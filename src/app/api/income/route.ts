import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateMonthState, getCurrentMonth } from '@/lib/calculations';

// Helper function to recalculate month state after income changes
async function recalculateMonthState(userId: string, month: string) {
  const allIncomes = await prisma.income.findMany({
    where: { userId, month },
  });

  const fixedCharities = await prisma.fixedCharity.findMany({
    where: { userId, isActive: true },
  });

  const existingMonthState = await prisma.monthState.findUnique({
    where: {
      userId_month: { userId, month },
    },
  });

  const monthStateData = calculateMonthState(
    allIncomes.map((i) => ({ amount: i.amount, percentage: i.percentage })),
    fixedCharities.map((c) => ({ name: c.name, amount: c.amount })),
    existingMonthState?.isPaid || false
  );

  await prisma.monthState.upsert({
    where: {
      userId_month: { userId, month },
    },
    update: {
      totalMaaser: monthStateData.totalMaaser,
      fixedCharitiesTotal: monthStateData.fixedCharitiesTotal,
      extraToGive: monthStateData.extraToGive,
      fixedCharitiesSnapshot: monthStateData.fixedCharitiesSnapshot as any,
    },
    create: {
      userId,
      month,
      totalMaaser: monthStateData.totalMaaser,
      fixedCharitiesTotal: monthStateData.fixedCharitiesTotal,
      extraToGive: monthStateData.extraToGive,
      fixedCharitiesSnapshot: monthStateData.fixedCharitiesSnapshot as any,
      isPaid: false,
    },
  });
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || getCurrentMonth();

    const incomes = await prisma.income.findMany({
      where: {
        userId: session.user.id,
        month,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ incomes });
  } catch (error) {
    console.error('Error fetching incomes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch incomes' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { amount, percentage, description } = await request.json();

    if (!amount || !percentage) {
      return NextResponse.json(
        { error: 'Amount and percentage are required' },
        { status: 400 }
      );
    }

    const month = getCurrentMonth();
    const maaser = Math.round(amount * (percentage / 100));

    // Create income
    const income = await prisma.income.create({
      data: {
        userId: session.user.id,
        month,
        amount,
        percentage,
        maaser,
        description,
      },
    });

    // Recalculate month state
    await recalculateMonthState(session.user.id, month);

    return NextResponse.json({ income }, { status: 201 });
  } catch (error) {
    console.error('Error creating income:', error);
    return NextResponse.json(
      { error: 'Failed to create income' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, amount, percentage, description } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    // Get the income to know which month to recalculate
    const existingIncome = await prisma.income.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existingIncome) {
      return NextResponse.json({ error: 'Income not found' }, { status: 404 });
    }

    // Calculate new maaser if amount or percentage changed
    const newAmount = amount ?? existingIncome.amount;
    const newPercentage = percentage ?? existingIncome.percentage;
    const maaser = Math.round(newAmount * (newPercentage / 100));

    // Update income
    await prisma.income.update({
      where: { id },
      data: {
        ...(amount !== undefined && { amount }),
        ...(percentage !== undefined && { percentage }),
        ...(description !== undefined && { description }),
        maaser,
      },
    });

    // Recalculate month state
    await recalculateMonthState(session.user.id, existingIncome.month);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating income:', error);
    return NextResponse.json(
      { error: 'Failed to update income' },
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
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    // Get the income to know which month to recalculate
    const income = await prisma.income.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!income) {
      return NextResponse.json({ error: 'Income not found' }, { status: 404 });
    }

    const month = income.month;

    // Delete income
    await prisma.income.delete({
      where: { id },
    });

    // Recalculate month state
    await recalculateMonthState(session.user.id, month);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting income:', error);
    return NextResponse.json(
      { error: 'Failed to delete income' },
      { status: 500 }
    );
  }
}
