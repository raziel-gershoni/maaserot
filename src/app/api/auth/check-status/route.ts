import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '../../_lib/apiError';
import type { ErrorCode } from '@/lib/errorCodes';

/**
 * Why a failed sign-in failed.
 *
 * NextAuth only ever tells the browser that credentials were rejected, so the
 * login screen asks here to tell a locked account and an unverified address
 * apart from a wrong password.
 *
 * Every outcome is a 200 carrying a stable `code` — the login screen turns
 * that into a translated sentence. `status` keeps its original snake_case
 * values so an older client still resolves; nothing here returns prose.
 *
 * POST /api/auth/check-status
 */
type Outcome = {
  status: 'invalid_credentials' | 'account_locked' | 'email_not_verified';
  code: ErrorCode;
  minutesRemaining?: number;
};

function outcome(value: Outcome) {
  return NextResponse.json(value);
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return apiError('VALIDATION_FAILED', 400);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        emailVerified: true,
        lockedUntil: true,
      },
    });

    if (!user) {
      // User doesn't exist - never confirm that, report the generic failure
      return outcome({
        status: 'invalid_credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesRemaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      return outcome({
        status: 'account_locked',
        code: 'ACCOUNT_LOCKED',
        minutesRemaining,
      });
    }

    // Check if email is not verified
    if (!user.emailVerified) {
      return outcome({
        status: 'email_not_verified',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    // User exists, not locked, email verified - must be wrong password
    return outcome({
      status: 'invalid_credentials',
      code: 'INVALID_CREDENTIALS',
    });
  } catch (error) {
    console.error('Check status error:', error);
    return apiError('SERVER_ERROR', 500);
  }
}
