import { NextResponse } from 'next/server';
import { verifyEmailToken } from '@/lib/tokens';
import { logAuthEventFromRequest } from '@/lib/authLogger';
import { prisma } from '@/lib/prisma';
import { apiError } from '../../_lib/apiError';
import type { ErrorCode } from '@/lib/errorCodes';

/**
 * `verifyEmailToken` still answers in prose, so the route translates its three
 * outcomes into the stable codes the client speaks. Everything unrecognised
 * degrades to a bad token rather than leaking the sentence.
 */
function tokenErrorCode(error: string | undefined): ErrorCode {
  const message = (error ?? '').toLowerCase();
  if (message.includes('expire')) return 'TOKEN_EXPIRED';
  if (message.includes('user not found')) return 'USER_NOT_FOUND';
  return 'TOKEN_INVALID';
}

/**
 * Verify email with token
 * GET /api/auth/verify-email?token=xxx
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return apiError('TOKEN_INVALID', 400);
    }

    // Verify the token
    const result = await verifyEmailToken(token);

    if (!result.success) {
      return apiError(tokenErrorCode(result.error), 400);
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
    return apiError('SERVER_ERROR', 500);
  }
}
