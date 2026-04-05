import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentMonth } from '@/lib/calculations';
import { sendIncomeReminder } from '@/lib/telegramNotify';

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
      return NextResponse.json({ error: 'No active partnership' }, { status: 400 });
    }

    const sender = partnership.user1Id === userId ? partnership.user1 : partnership.user2;
    const partner = partnership.user1Id === userId ? partnership.user2 : partnership.user1;

    if (!partner.telegramId) {
      return NextResponse.json({ error: 'Partner not connected to Telegram' }, { status: 400 });
    }

    const month = getCurrentMonth();

    const sent = await sendIncomeReminder(
      partner.telegramId,
      partner.locale || 'he',
      sender.name || 'Partner',
      month,
    );

    if (!sent) {
      return NextResponse.json({ error: 'Failed to send reminder' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Remind API error:', error);
    return NextResponse.json({ error: 'Failed to send reminder' }, { status: 500 });
  }
}
