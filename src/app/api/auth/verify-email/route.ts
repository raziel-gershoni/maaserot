import { NextResponse } from 'next/server';
import { verifyEmailToken } from '@/lib/tokens';
import { logAuthEventFromRequest } from '@/lib/authLogger';
import { prisma } from '@/lib/prisma';

/**
 * Verify email with token
 * GET /api/auth/verify-email?token=xxx
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Verify the token
    const result = await verifyEmailToken(token);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Verification failed' },
        { status: 400 }
      );
    }

    // Get user ID for logging
    const user = await prisma.user.findUnique({
      where: { email: result.email },
      select: { id: true },
    });

    // Log verification event
    if (user) {
      await logAuthEventFromRequest(request, 'email_verified', result.email!, user.id);
    }

    return NextResponse.json({
      success: true,
      email: result.email,
    });
  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.json(
      { error: 'Failed to verify email' },
      { status: 500 }
    );
  }
}
