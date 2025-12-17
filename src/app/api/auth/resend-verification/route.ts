import { NextResponse } from 'next/server';
import { resendVerificationToken } from '@/lib/tokens';
import { sendVerificationEmail } from '@/lib/email';
import { checkRateLimit, resetRateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { logAuthEventFromRequest } from '@/lib/authLogger';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

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
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.format(),
        },
        { status: 400 }
      );
    }

    const { email } = validation.data;

    // Rate limiting by email (1 request per 5 minutes)
    const rateLimit = checkRateLimit(email, 'resend-verification', RATE_LIMITS.EMAIL_VERIFICATION);

    if (!rateLimit.success) {
      return NextResponse.json(
        {
          error: 'Too many verification requests. Please try again later.',
          resetAt: new Date(rateLimit.resetAt).toISOString(),
        },
        { status: 429 }
      );
    }

    // Generate new token
    const result = await resendVerificationToken(email);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to resend verification email' },
        { status: 400 }
      );
    }

    // Send verification email
    const emailSent = await sendVerificationEmail(email, result.token!);

    if (!emailSent) {
      return NextResponse.json(
        { error: 'Failed to send verification email. Please try again later.' },
        { status: 500 }
      );
    }

    // Get user ID for logging
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

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
    return NextResponse.json(
      { error: 'Failed to resend verification email' },
      { status: 500 }
    );
  }
}
