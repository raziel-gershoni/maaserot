import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { changePasswordSchema } from '@/lib/validations/auth';
import { checkRateLimit, resetRateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { logAuthEventFromRequest } from '@/lib/authLogger';

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limiting by user ID
    const rateLimit = checkRateLimit(session.user.id, 'password-change', RATE_LIMITS.PASSWORD_CHANGE);

    if (!rateLimit.success) {
      return NextResponse.json(
        {
          error: 'Too many password change attempts. Please try again later.',
          resetAt: new Date(rateLimit.resetAt).toISOString(),
        },
        { status: 429 }
      );
    }

    const body = await request.json();

    // Validate input with Zod
    const validation = changePasswordSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.format()
        },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = validation.data;

    // Get user with password hash and email
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401 }
      );
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
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  }
}
