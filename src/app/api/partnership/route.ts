import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiError } from '../_lib/apiError';

// GET - Fetch current partnership and invitations
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return apiError('UNAUTHORIZED', 401);
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
    return apiError('SERVER_ERROR', 500);
  }
}

// POST - Create partnership invitation
export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return apiError('UNAUTHORIZED', 401);
    }

    const { partnerEmail } = await request.json();

    if (!partnerEmail) {
      return apiError('VALIDATION_FAILED', 400);
    }

    const userId = session.user.id;

    // Check if inviting self
    if (partnerEmail === session.user.email) {
      return apiError('CANNOT_INVITE_SELF', 400);
    }

    // Find partner by email
    const partner = await prisma.user.findUnique({
      where: { email: partnerEmail },
    });

    if (!partner) {
      return apiError('USER_NOT_FOUND', 404);
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
      return apiError('ALREADY_HAS_PARTNERSHIP', 400);
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
      // No PARTNER_ALREADY_HAS_PARTNERSHIP code exists yet, so the shared
      // "already partnered" code carries this case too.
      return apiError('ALREADY_HAS_PARTNERSHIP', 400);
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
      return apiError('ALREADY_HAS_PARTNERSHIP', 400);
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
    return apiError('SERVER_ERROR', 500);
  }
}

// PATCH - Accept/decline invitation
export async function PATCH(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return apiError('UNAUTHORIZED', 401);
    }

    const { partnershipId, action } = await request.json();

    if (!partnershipId || !action) {
      return apiError('VALIDATION_FAILED', 400);
    }

    if (action !== 'accept' && action !== 'decline') {
      return apiError('VALIDATION_FAILED', 400);
    }

    const userId = session.user.id;

    // Get the partnership
    const partnership = await prisma.partnership.findUnique({
      where: { id: partnershipId },
    });

    if (!partnership) {
      return apiError('PARTNERSHIP_NOT_FOUND', 404);
    }

    // Verify user is the recipient (user2)
    if (partnership.user2Id !== userId) {
      return apiError('UNAUTHORIZED', 403);
    }

    // Verify partnership is pending
    if (partnership.status !== 'PENDING') {
      // The invitation was already accepted, declined or withdrawn.
      return apiError('PARTNERSHIP_NOT_FOUND', 400);
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
      return apiError('ALREADY_HAS_PARTNERSHIP', 400);
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
    return apiError('SERVER_ERROR', 500);
  }
}

// DELETE - Leave/dissolve partnership
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

    const userId = session.user.id;

    // Get the partnership
    const partnership = await prisma.partnership.findUnique({
      where: { id },
    });

    if (!partnership) {
      return apiError('PARTNERSHIP_NOT_FOUND', 404);
    }

    // Verify user is part of the partnership
    if (partnership.user1Id !== userId && partnership.user2Id !== userId) {
      return apiError('UNAUTHORIZED', 403);
    }

    // Delete the partnership
    await prisma.partnership.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Partnership deletion error:', error);
    return apiError('SERVER_ERROR', 500);
  }
}
