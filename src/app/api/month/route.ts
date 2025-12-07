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

    const monthState = await prisma.monthState.findUnique({
      where: {
        userId_month: {
          userId: session.user.id,
          month,
        },
      },
    });

    return NextResponse.json({ monthState });
  } catch (error) {
    console.error('Error fetching month state:', error);
    return NextResponse.json(
      { error: 'Failed to fetch month state' },
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

    const { month, isPaid } = await request.json();

    if (!month || isPaid === undefined) {
      return NextResponse.json(
        { error: 'Month and isPaid are required' },
        { status: 400 }
      );
    }

    const monthState = await prisma.monthState.update({
      where: {
        userId_month: {
          userId: session.user.id,
          month,
        },
      },
      data: {
        isPaid,
        paidAt: isPaid ? new Date() : null,
      },
    });

    return NextResponse.json({ monthState });
  } catch (error) {
    console.error('Error updating month state:', error);
    return NextResponse.json(
      { error: 'Failed to update month state' },
      { status: 500 }
    );
  }
}
