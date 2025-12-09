import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentMonth } from '@/lib/calculations';

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

    // Get the income to check if it's frozen
    const existingIncome = await prisma.income.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existingIncome) {
      return NextResponse.json({ error: 'Income not found' }, { status: 404 });
    }

    // Check if the income is frozen (existed before month was marked as paid)
    if (existingIncome.isFrozen) {
      return NextResponse.json(
        { error: 'errors.cannotEditFrozenIncome' },
        { status: 403 }
      );
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

    // Get the income to check if it's frozen
    const income = await prisma.income.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!income) {
      return NextResponse.json({ error: 'Income not found' }, { status: 404 });
    }

    // Check if the income is frozen (existed before month was marked as paid)
    if (income.isFrozen) {
      return NextResponse.json(
        { error: 'errors.cannotDeleteFrozenIncome' },
        { status: 403 }
      );
    }

    // Delete income
    await prisma.income.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting income:', error);
    return NextResponse.json(
      { error: 'Failed to delete income' },
      { status: 500 }
    );
  }
}
