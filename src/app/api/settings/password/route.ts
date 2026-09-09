import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { changePasswordSchema } from '@/lib/validations/auth';
import { checkRateLimit, resetRateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { logAuthEventFromRequest } from '@/lib/authLogger';
import { apiError } from '../../_lib/apiError';

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return apiError('UNAUTHORIZED', 401);
    }

    // Rate limiting by user ID
    const rateLimit = checkRateLimit(session.user.id, 'password-change', RATE_LIMITS.PASSWORD_CHANGE);

    if (!rateLimit.success) {
      return apiError('RATE_LIMITED', 429, {
        resetAt: new Date(rateLimit.resetAt).toISOString(),
      });
    }

    const body = await request.json();

    // Validate input with Zod
    const validation = changePasswordSchema.safeParse(body);

    if (!validation.success) {
      // A too-short new password is the only validation failure a person can
      // act on, so it gets its own code. `details` is unchanged.
      // Only when the password is the sole complaint — otherwise a bad email
      // would be reported as a weak password.
      const weakPassword = validation.error.issues.every(
        (issue) => issue.path[0] === 'newPassword'
      );

      return apiError(weakPassword ? 'WEAK_PASSWORD' : 'VALIDATION_FAILED', 400, {
        details: validation.error.format(),
      });
    }

    const { currentPassword, newPassword } = validation.data;

    // Get user with password hash and email
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true, email: true },
    });

    if (!user) {
      return apiError('USER_NOT_FOUND', 404);
    }

    if (!user.passwordHash) {
      // No PASSWORD_LOGIN_UNAVAILABLE code exists yet.
      return apiError('VALIDATION_FAILED', 400);
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!isValidPassword) {
      return apiError('INVALID_PASSWORD', 401);
    }

    // Hash new password (using 12 rounds for consistency with registration)
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: session.user.id },
      data: { passwordHash: newPasswordHash },
    });

    // Log password change event
    await logAuthEventFromRequest(request, 'password_changed', user.email || session.user.email!, session.user.id);

    // Reset rate limit on successful password change
    resetRateLimit(session.user.id, 'password-change');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Password change error:', error);
    return apiError('SERVER_ERROR', 500);
  }
}
