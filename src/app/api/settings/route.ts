import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentMonth } from '@/lib/calculations';
import { apiError } from '../_lib/apiError';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return apiError('UNAUTHORIZED', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        email: true,
        defaultPercent: true,
        locale: true,
      },
    });

    if (!user) {
      return apiError('USER_NOT_FOUND', 404);
    }

    return NextResponse.json({
      userId: session.user.id,
      settings: {
        name: user.name || '',
        email: user.email,
        defaultPercent: user.defaultPercent,
        locale: user.locale,
      },
    });
  } catch (error) {
    console.error('Settings fetch error:', error);
    return apiError('SERVER_ERROR', 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return apiError('UNAUTHORIZED', 401);
    }

    const body = await request.json();
    const { name, defaultPercent, locale } = body;

    // Validate inputs
    if (defaultPercent && (defaultPercent < 1 || defaultPercent > 100)) {
      return apiError('VALIDATION_FAILED', 400);
    }

    if (locale && !['he', 'en'].includes(locale)) {
      return apiError('VALIDATION_FAILED', 400);
    }

    // Update user settings
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        ...(name !== undefined && { name }),
        ...(defaultPercent !== undefined && { defaultPercent: parseInt(defaultPercent) }),
        ...(locale !== undefined && { locale }),
      },
      select: {
        name: true,
        email: true,
        defaultPercent: true,
        locale: true,
      },
    });

    // If default percentage changed, update current month's unfrozen incomes
    if (defaultPercent !== undefined) {
      const currentMonth = getCurrentMonth();

      // Get all unfrozen incomes for current month
      const currentMonthIncomes = await prisma.income.findMany({
        where: {
          userId: session.user.id,
          month: currentMonth,
          isFrozen: false, // Only update unfrozen incomes
        },
      });

      // Update each income with new percentage and recalculated maaser
      const newDefaultPercent = parseInt(defaultPercent);
      for (const income of currentMonthIncomes) {
        const newMaaser = Math.round(income.amount * (newDefaultPercent / 100));
        await prisma.income.update({
          where: { id: income.id },
          data: {
            percentage: newDefaultPercent,
            maaser: newMaaser,
          },
        });
      }
    }

    return NextResponse.json({
      settings: {
        name: updatedUser.name || '',
        email: updatedUser.email,
        defaultPercent: updatedUser.defaultPercent,
        locale: updatedUser.locale,
      },
    });
  } catch (error) {
    console.error('Settings update error:', error);
    return apiError('SERVER_ERROR', 500);
  }
}
