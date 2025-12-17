/**
 * Token management for email verification and password reset
 */

import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';

/**
 * Generate a secure random token
 */
function generateSecureToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Generate and store an email verification token
 * @param email - User's email address
 * @returns The generated token
 */
export async function generateVerificationToken(email: string): Promise<string> {
  // Delete any existing tokens for this email
  await prisma.verificationToken.deleteMany({
    where: { email },
  });

  // Generate new token
  const token = generateSecureToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); // Valid for 24 hours

  // Store token in database
  await prisma.verificationToken.create({
    data: {
      email,
      token,
      expiresAt,
    },
  });

  return token;
}

/**
 * Verify email token and mark user as verified
 * @param token - Verification token
 * @returns Success status and optional error message
 */
export async function verifyEmailToken(token: string): Promise<{
  success: boolean;
  error?: string;
  email?: string;
}> {
  // Find token in database
  const verificationToken = await prisma.verificationToken.findUnique({
    where: { token },
  });

  if (!verificationToken) {
    return { success: false, error: 'Invalid or expired token' };
  }

  // Check if token is expired
  if (verificationToken.expiresAt < new Date()) {
    // Delete expired token
    await prisma.verificationToken.delete({
      where: { id: verificationToken.id },
    });
    return { success: false, error: 'Token has expired' };
  }

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: verificationToken.email },
  });

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  // Mark user as verified
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: new Date() },
  });

  // Delete used token
  await prisma.verificationToken.delete({
    where: { id: verificationToken.id },
  });

  return {
    success: true,
    email: verificationToken.email,
  };
}

/**
 * Resend verification email
 * @param email - User's email address
 * @returns Success status and optional token
 */
export async function resendVerificationToken(email: string): Promise<{
  success: boolean;
  token?: string;
  error?: string;
}> {
  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  // Check if already verified
  if (user.emailVerified) {
    return { success: false, error: 'Email already verified' };
  }

  // Generate new token
  const token = await generateVerificationToken(email);

  return { success: true, token };
}

/**
 * Clean up expired tokens (should be run periodically)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.verificationToken.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  return result.count;
}

/**
 * Generate password reset token (for future implementation)
 * Similar to verification token but with shorter expiry (1 hour)
 */
export async function generatePasswordResetToken(email: string): Promise<string | null> {
  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return null;
  }

  // For password reset, we'll use the same VerificationToken table
  // but with a shorter expiry
  await prisma.verificationToken.deleteMany({
    where: { email },
  });

  const token = generateSecureToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1); // Valid for 1 hour

  await prisma.verificationToken.create({
    data: {
      email,
      token,
      expiresAt,
    },
  });

  return token;
}
