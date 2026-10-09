import { after, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentMonth, maaserFor } from '@/lib/calculations';
import { addIncome, IncomeError, notifyPartnerOfIncome } from '@/lib/incomes';
import { apiError } from '../_lib/apiError';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return apiError('UNAUTHORIZED', 401);
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
    return apiError('SERVER_ERROR', 500);
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return apiError('UNAUTHORIZED', 401);
    }

    const userId = session.user.id;
    const { amount, percentage, description } = await request.json();

    // The form files into the current month only; a past month's deposit
    // goes through the bot. addIncome validates the rest.
    const income = await addIncome(userId, {
      month: getCurrentMonth(),
      amount,
      percentage,
      description,
    });

    // A bare promise left running after the response was dropped whenever the
    // function froze. after() keeps the function alive until it settles. It
    // is logged by name only, as everything on the notification path is.
    after(() =>
      notifyPartnerOfIncome(userId, income.month, income.amount).catch((e) =>
        console.error('[income] partner notification', (e as { name?: unknown })?.name)
      )
    );

    return NextResponse.json({ income }, { status: 201 });
  } catch (error) {
    if (error instanceof IncomeError) {
      return apiError(error.code, error.status);
    }
    // By name and code only: a Prisma error quotes the values it was given,
    // the amount and the description among them.
    console.error(
      'Error creating income:',
      (error as { name?: unknown })?.name,
      (error as { code?: unknown })?.code
    );
    return apiError('SERVER_ERROR', 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return apiError('UNAUTHORIZED', 401);
    }

    const { id, amount, percentage, description } = await request.json();

    if (!id) {
      return apiError('VALIDATION_FAILED', 400);
    }

    // Get the income to check if it's frozen
    const existingIncome = await prisma.income.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existingIncome) {
      return apiError('INCOME_NOT_FOUND', 404);
    }

    // Check if the income is frozen (existed before month was marked as paid)
    if (existingIncome.isFrozen) {
      return apiError('CANNOT_EDIT_FROZEN_INCOME', 403);
    }

    // Calculate new maaser if amount or percentage changed
    const newAmount = amount ?? existingIncome.amount;
    const newPercentage = percentage ?? existingIncome.percentage;
    const maaser = maaserFor(newAmount, newPercentage);

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

    // Get the income to check if it's frozen
    const income = await prisma.income.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!income) {
      return apiError('INCOME_NOT_FOUND', 404);
    }

    // Check if the income is frozen (existed before month was marked as paid)
    if (income.isFrozen) {
      return apiError('CANNOT_DELETE_FROZEN_INCOME', 403);
    }

    // Delete income
    await prisma.income.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting income:', error);
    return apiError('SERVER_ERROR', 500);
  }
}
