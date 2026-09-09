import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { registerSchema } from '@/lib/validations/auth';
import { checkRateLimit, resetRateLimit, RATE_LIMITS } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/utils/ip';
// TODO: Re-enable once Resend domain is verified
// import { generateVerificationToken } from '@/lib/tokens';
// import { sendVerificationEmail } from '@/lib/email';
import { logAuthEventFromRequest } from '@/lib/authLogger';
import { apiError } from '../../_lib/apiError';

export async function POST(request: Request) {
  try {
    // Rate limiting by IP
    const ip = getClientIp(request);
    const rateLimit = checkRateLimit(ip, 'register', RATE_LIMITS.REGISTER);

    if (!rateLimit.success) {
      return apiError('RATE_LIMITED', 429, {
        resetAt: new Date(rateLimit.resetAt).toISOString(),
      });
    }

    const body = await request.json();

    // Validate input with Zod
    const validation = registerSchema.safeParse(body);

    if (!validation.success) {
      // A too-short password is the one validation failure a person can act
      // on directly, so it gets its own code. `details` is unchanged.
      // Only when the password is the sole complaint — otherwise a bad email
      // would be reported as a weak password.
      const weakPassword = validation.error.issues.every(
        (issue) => issue.path[0] === 'password'
      );

      return apiError(weakPassword ? 'WEAK_PASSWORD' : 'VALIDATION_FAILED', 400, {
        details: validation.error.format(),
      });
    }

    const { name, email, password } = validation.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return apiError('EMAIL_TAKEN', 400);
    }

    // Hash password
    const passwordHash = await hash(password, 12);

    // Create user (emailVerified will be null by default)
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
      },
    });

    // TODO: Re-enable verification email once Resend domain is verified
    // const token = await generateVerificationToken(email);
    // await sendVerificationEmail(email, token, user.locale);

    // Log registration event
    await logAuthEventFromRequest(request, 'register', email, user.id);

    // Reset rate limit on successful registration
    resetRateLimit(ip, 'register');

    return NextResponse.json(
      {
        user: { id: user.id, email: user.email, name: user.name },
        message: 'Registration successful.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return apiError('SERVER_ERROR', 500);
  }
}
