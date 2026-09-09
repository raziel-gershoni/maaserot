import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentMonth } from '@/lib/calculations';
import { calculateCurrentMonthState } from '@/lib/monthState';
import { notifyPartnerIncomeAdded } from '@/lib/telegramNotify';
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

    const { amount, percentage, description } = await request.json();

    if (!amount || !percentage) {
      return apiError('VALIDATION_FAILED', 400);
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

    // Fire-and-forget: notify partner via Telegram
    notifyPartner(session.user.id, month, income.amount).catch((err) =>
      console.error('Partner notification error:', err)
    );

    return NextResponse.json({ income }, { status: 201 });
  } catch (error) {
    console.error('Error creating income:', error);
    return apiError('SERVER_ERROR', 500);
  }
}

async function notifyPartner(userId: string, month: string, incomeAmount: number) {
  // Find accepted partnership
  const partnership = await prisma.partnership.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [{ user1Id: userId }, { user2Id: userId }],
    },
    include: {
      user1: { select: { id: true, name: true, telegramId: true, locale: true } },
      user2: { select: { id: true, name: true, telegramId: true, locale: true } },
    },
  });

  if (!partnership) return;

  const sender = partnership.user1Id === userId ? partnership.user1 : partnership.user2;
  const partner = partnership.user1Id === userId ? partnership.user2 : partnership.user1;

  if (!partner.telegramId) return;

  // Calculate group unpaid for the notification message
  const [myState, partnerState] = await Promise.all([
    calculateCurrentMonthState(userId, month),
    calculateCurrentMonthState(partner.id, month),
  ]);

  const totalMaaser = myState.totalMaaser + partnerState.totalMaaser;
  const totalFixed = myState.fixedCharitiesTotal + partnerState.fixedCharitiesTotal;
  const totalPaid = myState.totalPaid + partnerState.totalPaid;
  const groupUnpaid = Math.max(0, totalMaaser - totalFixed - totalPaid);

  await notifyPartnerIncomeAdded(
    partner.telegramId,
    partner.locale || 'he',
    sender.name || 'Partner',
    incomeAmount,
    groupUnpaid,
  );
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
