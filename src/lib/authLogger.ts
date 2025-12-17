/**
 * Authentication event logging
 * Provides audit trail for security and compliance
 */

import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/utils/ip';
import { Prisma } from '@prisma/client';

export type AuthEvent =
  | 'register'
  | 'login_success'
  | 'login_failed'
  | 'login_blocked_unverified'
  | 'login_blocked_locked'
  | 'email_verified'
  | 'verification_sent'
  | 'verification_resent'
  | 'password_changed'
  | 'rate_limit_exceeded';

interface LogAuthEventOptions {
  event: AuthEvent;
  email: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Log an authentication event
 * This runs asynchronously and doesn't block the request
 */
export async function logAuthEvent({
  event,
  email,
  userId,
  ip,
  userAgent,
  metadata,
}: LogAuthEventOptions): Promise<void> {
  try {
    await prisma.authLog.create({
      data: {
        event,
        email,
        userId: userId || null,
        ip: ip || null,
        userAgent: userAgent || null,
        metadata: metadata ? metadata : undefined,
      },
    });
  } catch (error) {
    // Log to console but don't throw - logging failures shouldn't break auth
    console.error('Failed to log auth event:', error);
  }
}

/**
 * Log authentication event from a Request object
 * Extracts IP and user agent automatically
 */
export async function logAuthEventFromRequest(
  request: Request,
  event: AuthEvent,
  email: string,
  userId?: string,
  metadata?: Prisma.InputJsonValue
): Promise<void> {
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || undefined;

  await logAuthEvent({
    event,
    email,
    userId,
    ip,
    userAgent,
    metadata,
  });
}

/**
 * Get recent auth logs for a user
 * Useful for showing activity in settings
 */
export async function getUserAuthLogs(
  userId: string,
  limit: number = 10
): Promise<Array<{
  id: string;
  event: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}>> {
  const logs = await prisma.authLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      event: true,
      ip: true,
      userAgent: true,
      createdAt: true,
    },
  });

  return logs;
}

/**
 * Get recent failed login attempts for an email
 * Useful for detecting brute force attacks
 */
export async function getRecentFailedLogins(
  email: string,
  minutes: number = 30
): Promise<number> {
  const since = new Date(Date.now() - minutes * 60 * 1000);

  const count = await prisma.authLog.count({
    where: {
      email,
      event: 'login_failed',
      createdAt: { gte: since },
    },
  });

  return count;
}

/**
 * Clean up old auth logs (should be run periodically)
 * Keep logs for 90 days by default
 */
export async function cleanupOldAuthLogs(daysToKeep: number = 90): Promise<number> {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

  const result = await prisma.authLog.deleteMany({
    where: {
      createdAt: { lt: cutoffDate },
    },
  });

  return result.count;
}
