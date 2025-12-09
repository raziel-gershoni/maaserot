import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { month, isPaid } = await request.json();

    if (!month || isPaid === undefined) {
      return NextResponse.json(
        { error: 'Month and isPaid are required' },
        { status: 400 }
      );
    }

    // Get selected partner IDs (people sharing with current user where isSelected = true)
    const selectedShares = await prisma.sharedAccess.findMany({
      where: {
        viewerId: session.user.id,
        isSelected: true,
      },
      select: {
        ownerId: true,
      },
    });

    const partnerIds = selectedShares.map((share) => share.ownerId);
    const allUserIds = [session.user.id, ...partnerIds];

    // Use transaction to update all month states
    const results = await prisma.$transaction(
      allUserIds.map((userId) =>
        prisma.monthState.updateMany({
          where: {
            userId,
            month,
          },
          data: {
            isPaid,
            paidAt: isPaid ? new Date() : null,
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      updated: results.reduce((sum, r) => sum + r.count, 0)
    });
  } catch (error) {
    console.error('Group payment error:', error);
    return NextResponse.json({ error: 'Failed to update group payment status' }, { status: 500 });
  }
}
