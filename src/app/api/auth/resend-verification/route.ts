import { NextResponse } from 'next/server';
import { resendVerificationToken } from '@/lib/tokens';
import { sendVerificationEmail } from '@/lib/email';
import { checkRateLimit, resetRateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { logAuthEventFromRequest } from '@/lib/authLogger';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { apiError } from '../../_lib/apiError';

const resendSchema = z.object({
  email: z.string().email('Invalid email format'),
});

/**
 * Resend verification email
 * POST /api/auth/resend-verification
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate input
    const validation = resendSchema.safeParse(body);

    if (!validation.success) {
      return apiError('VALIDATION_FAILED', 400, {
        details: validation.error.format(),
      });
    }

    const { email } = validation.data;

    // Rate limiting by email (1 request per 5 minutes)
    const rateLimit = checkRateLimit(email, 'resend-verification', RATE_LIMITS.EMAIL_VERIFICATION);

    if (!rateLimit.success) {
      return apiError('RATE_LIMITED', 429, {
        resetAt: new Date(rateLimit.resetAt).toISOString(),
      });
    }

    // Generate new token
    const result = await resendVerificationToken(email);

    if (!result.success) {
      // `resendVerificationToken` still answers in prose. An unknown address
      // and an already-verified one are the only two outcomes, and neither has
      // a code of its own yet, so `reason` carries the distinction the
      // verify-email screen needs to offer "just sign in" instead of an error.
      const alreadyVerified = (result.error ?? '')
        .toLowerCase()
        .includes('already verified');

      return apiError(
        alreadyVerified ? 'VALIDATION_FAILED' : 'USER_NOT_FOUND',
        400,
        alreadyVerified ? { reason: 'already_verified' } : undefined
      );
    }

    // Get user for locale and logging
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, locale: true },
    });

    // Send verification email with user's locale
    const emailSent = await sendVerificationEmail(email, result.token!, user?.locale || 'he');

    if (!emailSent) {
      return apiError('SERVER_ERROR', 500);
    }

    // Log resend event
    if (user) {
      await logAuthEventFromRequest(request, 'verification_resent', email, user.id);
    }

    // Reset rate limit on successful send
    resetRateLimit(email, 'resend-verification');

    return NextResponse.json({
      success: true,
      message: 'Verification email sent successfully',
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return apiError('SERVER_ERROR', 500);
  }
}
