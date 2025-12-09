import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get people I'm sharing with (I'm the owner)
    const sharingWith = await prisma.sharedAccess.findMany({
      where: { ownerId: session.user.id },
      include: {
        viewer: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get people sharing with me (I'm the viewer)
    const sharedWithMe = await prisma.sharedAccess.findMany({
      where: { viewerId: session.user.id },
      include: {
        owner: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ sharingWith, sharedWithMe });
  } catch (error) {
    console.error('Shared access fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch shared access' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, canEdit } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Find the user to share with
    const viewerUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!viewerUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Can't share with yourself
    if (viewerUser.id === session.user.id) {
      return NextResponse.json({ error: 'Cannot share with yourself' }, { status: 400 });
    }

    // Check if already sharing
    const existingShare = await prisma.sharedAccess.findUnique({
      where: {
        ownerId_viewerId: {
          ownerId: session.user.id,
          viewerId: viewerUser.id,
        },
      },
    });

    if (existingShare) {
      return NextResponse.json({ error: 'Already sharing with this user' }, { status: 400 });
    }

    // Create shared access
    const sharedAccess = await prisma.sharedAccess.create({
      data: {
        ownerId: session.user.id,
        viewerId: viewerUser.id,
        canEdit: canEdit || false,
      },
    });

    return NextResponse.json({ sharedAccess }, { status: 201 });
  } catch (error) {
    console.error('Share creation error:', error);
    return NextResponse.json({ error: 'Failed to create share' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, isSelected } = await request.json();

    if (!id || isSelected === undefined) {
      return NextResponse.json({ error: 'ID and isSelected are required' }, { status: 400 });
    }

    // Verify user is the viewer (can only toggle selection for shares where they're the viewer)
    const sharedAccess = await prisma.sharedAccess.findFirst({
      where: {
        id,
        viewerId: session.user.id,
      },
    });

    if (!sharedAccess) {
      return NextResponse.json({ error: 'Shared access not found' }, { status: 404 });
    }

    // Update isSelected
    const updated = await prisma.sharedAccess.update({
      where: { id },
      data: { isSelected },
    });

    return NextResponse.json({ sharedAccess: updated });
  } catch (error) {
    console.error('Share update error:', error);
    return NextResponse.json({ error: 'Failed to update share' }, { status: 500 });
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

    // Verify ownership before deleting
    const sharedAccess = await prisma.sharedAccess.findFirst({
      where: {
        id,
        ownerId: session.user.id,
      },
    });

    if (!sharedAccess) {
      return NextResponse.json({ error: 'Shared access not found' }, { status: 404 });
    }

    await prisma.sharedAccess.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Share deletion error:', error);
    return NextResponse.json({ error: 'Failed to delete share' }, { status: 500 });
  }
}
