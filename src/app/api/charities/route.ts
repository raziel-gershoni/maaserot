import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateMonthState, getCurrentMonth } from '@/lib/calculations';

// Helper function to recalculate current month state
async function recalculateMonthState(userId: string) {
  const month = getCurrentMonth();

  const allIncomes = await prisma.income.findMany({
    where: { userId, month },
  });

  const fixedCharities = await prisma.fixedCharity.findMany({
    where: { userId, isActive: true },
  });

  const existingMonthState = await prisma.monthState.findUnique({
    where: {
      userId_month: {
        userId,
        month,
      },
    },
  });

  const monthStateData = calculateMonthState(
    allIncomes.map((i) => ({ amount: i.amount, percentage: i.percentage })),
    fixedCharities.map((c) => ({ name: c.name, amount: c.amount })),
    existingMonthState?.isPaid || false
  );

  await prisma.monthState.upsert({
    where: {
      userId_month: {
        userId,
        month,
      },
    },
    update: {
      totalMaaser: monthStateData.totalMaaser,
      fixedCharitiesTotal: monthStateData.fixedCharitiesTotal,
      extraToGive: monthStateData.extraToGive,
      fixedCharitiesSnapshot: monthStateData.fixedCharitiesSnapshot,
    },
    create: {
      userId,
      month,
      totalMaaser: monthStateData.totalMaaser,
      fixedCharitiesTotal: monthStateData.fixedCharitiesTotal,
      extraToGive: monthStateData.extraToGive,
      fixedCharitiesSnapshot: monthStateData.fixedCharitiesSnapshot,
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

    const charities = await prisma.fixedCharity.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ charities });
  } catch (error) {
    console.error('Error fetching charities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch charities' },
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

    const { name, amount } = await request.json();

    if (!name || !amount) {
      return NextResponse.json(
        { error: 'Name and amount are required' },
        { status: 400 }
      );
    }

    const charity = await prisma.fixedCharity.create({
      data: {
        userId: session.user.id,
        name,
        amount,
        isActive: true,
      },
    });

    // Recalculate month state after adding charity
    await recalculateMonthState(session.user.id);

    return NextResponse.json({ charity }, { status: 201 });
  } catch (error) {
    console.error('Error creating charity:', error);
    return NextResponse.json(
      { error: 'Failed to create charity' },
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

    const { id, isActive, name, amount } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const charity = await prisma.fixedCharity.updateMany({
      where: { id, userId: session.user.id },
      data: {
        ...(isActive !== undefined && { isActive }),
        ...(name && { name }),
        ...(amount && { amount }),
      },
    });

    if (charity.count === 0) {
      return NextResponse.json({ error: 'Charity not found' }, { status: 404 });
    }

    // Recalculate month state after updating charity
    await recalculateMonthState(session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating charity:', error);
    return NextResponse.json(
      { error: 'Failed to update charity' },
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

    await prisma.fixedCharity.deleteMany({
      where: { id, userId: session.user.id },
    });

    // Recalculate month state after deleting charity
    await recalculateMonthState(session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting charity:', error);
    return NextResponse.json(
      { error: 'Failed to delete charity' },
      { status: 500 }
    );
  }
}
