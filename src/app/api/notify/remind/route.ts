import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentMonth } from '@/lib/calculations';
import { sendIncomeReminder } from '@/lib/telegramNotify';
import { apiError } from '../../_lib/apiError';

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return apiError('UNAUTHORIZED', 401);
    }

    const userId = session.user.id;

    // Find accepted partnership with partner's telegram info
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

    if (!partnership) {
      return apiError('PARTNERSHIP_NOT_FOUND', 400);
    }

    const sender = partnership.user1Id === userId ? partnership.user1 : partnership.user2;
    const partner = partnership.user1Id === userId ? partnership.user2 : partnership.user1;

    if (!partner.telegramId) {
      // No PARTNER_NOT_ON_TELEGRAM code exists yet.
      return apiError('VALIDATION_FAILED', 400);
    }

    const month = getCurrentMonth();

    const sent = await sendIncomeReminder(
      partner.telegramId,
      partner.locale || 'he',
      sender.name || 'Partner',
      month,
    );

    if (!sent) {
      return apiError('SERVER_ERROR', 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Remind API error:', error);
    return apiError('SERVER_ERROR', 500);
  }
}
