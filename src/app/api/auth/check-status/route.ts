import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Check account status for better error messages after failed login
 * POST /api/auth/check-status
 */
export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        emailVerified: true,
        lockedUntil: true,
      },
    });

    if (!user) {
      // User doesn't exist - show generic error
      return NextResponse.json({
        status: 'invalid_credentials',
        message: 'Invalid email or password',
      });
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesRemaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      return NextResponse.json({
        status: 'account_locked',
        message: `Account locked. Try again in ${minutesRemaining} minutes`,
        minutesRemaining,
      });
    }

    // Check if email is not verified
    if (!user.emailVerified) {
      return NextResponse.json({
        status: 'email_not_verified',
        message: 'Please verify your email before logging in',
      });
    }

    // User exists, not locked, email verified - must be wrong password
    return NextResponse.json({
      status: 'invalid_credentials',
      message: 'Invalid email or password',
    });
  } catch (error) {
    console.error('Check status error:', error);
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 }
    );
  }
}
