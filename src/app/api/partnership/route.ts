import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET - Fetch current partnership and invitations
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Get current accepted partnership
    const currentPartnership = await prisma.partnership.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { user1Id: userId },
          { user2Id: userId },
        ],
      },
      include: {
        user1: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        user2: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Get pending invitations where I'm the recipient (user2)
    const pendingInvitations = await prisma.partnership.findMany({
      where: {
        status: 'PENDING',
        user2Id: userId,
      },
      include: {
        user1: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Get invitations I sent (user1)
    const sentInvitations = await prisma.partnership.findMany({
      where: {
        status: 'PENDING',
        user1Id: userId,
      },
      include: {
        user2: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      currentPartnership,
      pendingInvitations,
      sentInvitations,
    });
  } catch (error) {
    console.error('Partnership fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch partnerships' }, { status: 500 });
  }
}

// POST - Create partnership invitation
export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { partnerEmail } = await request.json();

    if (!partnerEmail) {
      return NextResponse.json({ error: 'Partner email is required' }, { status: 400 });
    }

    const userId = session.user.id;

    // Check if inviting self
    if (partnerEmail === session.user.email) {
      return NextResponse.json({ error: 'Cannot invite yourself' }, { status: 400 });
    }

    // Find partner by email
    const partner = await prisma.user.findUnique({
      where: { email: partnerEmail },
    });

    if (!partner) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if current user already has an active partnership
    const myPartnership = await prisma.partnership.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { user1Id: userId },
          { user2Id: userId },
        ],
      },
    });

    if (myPartnership) {
      return NextResponse.json({ error: 'You already have an active partnership' }, { status: 400 });
    }

    // Check if partner already has an active partnership
    const partnerPartnership = await prisma.partnership.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { user1Id: partner.id },
          { user2Id: partner.id },
        ],
      },
    });

    if (partnerPartnership) {
      return NextResponse.json({ error: 'This user is already in a partnership' }, { status: 400 });
    }

    // Check for existing pending invitation between these users
    const existingInvitation = await prisma.partnership.findFirst({
      where: {
        status: 'PENDING',
        OR: [
          { user1Id: userId, user2Id: partner.id },
          { user1Id: partner.id, user2Id: userId },
        ],
      },
    });

    if (existingInvitation) {
      return NextResponse.json({ error: 'Invitation already exists' }, { status: 400 });
    }

    // Create partnership invitation
    const partnership = await prisma.partnership.create({
      data: {
        user1Id: userId,
        user2Id: partner.id,
        status: 'PENDING',
        initiatedBy: userId,
      },
      include: {
        user1: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        user2: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ partnership }, { status: 201 });
  } catch (error) {
    console.error('Partnership creation error:', error);
    return NextResponse.json({ error: 'Failed to create partnership' }, { status: 500 });
  }
}

// PATCH - Accept/decline invitation
export async function PATCH(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { partnershipId, action } = await request.json();

    if (!partnershipId || !action) {
      return NextResponse.json({ error: 'Partnership ID and action are required' }, { status: 400 });
    }

    if (action !== 'accept' && action !== 'decline') {
      return NextResponse.json({ error: 'Action must be "accept" or "decline"' }, { status: 400 });
    }

    const userId = session.user.id;

    // Get the partnership
    const partnership = await prisma.partnership.findUnique({
      where: { id: partnershipId },
    });

    if (!partnership) {
      return NextResponse.json({ error: 'Partnership not found' }, { status: 404 });
    }

    // Verify user is the recipient (user2)
    if (partnership.user2Id !== userId) {
      return NextResponse.json({ error: 'Only the recipient can accept or decline' }, { status: 403 });
    }

    // Verify partnership is pending
    if (partnership.status !== 'PENDING') {
      return NextResponse.json({ error: 'Partnership is not pending' }, { status: 400 });
    }

    if (action === 'decline') {
      // Update status to DECLINED
      const updated = await prisma.partnership.update({
        where: { id: partnershipId },
        data: { status: 'DECLINED' },
        include: {
          user1: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          user2: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return NextResponse.json({ partnership: updated });
    }

    // action === 'accept'
    // Check if either user has another active partnership
    const existingPartnership = await prisma.partnership.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { user1Id: partnership.user1Id },
          { user2Id: partnership.user1Id },
          { user1Id: partnership.user2Id },
          { user2Id: partnership.user2Id },
        ],
      },
    });

    if (existingPartnership) {
      return NextResponse.json({ error: 'One of the users is already in a partnership' }, { status: 400 });
    }

    // Accept the partnership
    const updated = await prisma.partnership.update({
      where: { id: partnershipId },
      data: { status: 'ACCEPTED' },
      include: {
        user1: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        user2: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ partnership: updated });
  } catch (error) {
    console.error('Partnership update error:', error);
    return NextResponse.json({ error: 'Failed to update partnership' }, { status: 500 });
  }
}

// DELETE - Leave/dissolve partnership
export async function DELETE(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Partnership ID is required' }, { status: 400 });
    }

    const userId = session.user.id;

    // Get the partnership
    const partnership = await prisma.partnership.findUnique({
      where: { id },
    });

    if (!partnership) {
      return NextResponse.json({ error: 'Partnership not found' }, { status: 404 });
    }

    // Verify user is part of the partnership
    if (partnership.user1Id !== userId && partnership.user2Id !== userId) {
      return NextResponse.json({ error: 'You are not part of this partnership' }, { status: 403 });
    }

    // Delete the partnership
    await prisma.partnership.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Partnership deletion error:', error);
    return NextResponse.json({ error: 'Failed to delete partnership' }, { status: 500 });
  }
}
