import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

/**
 * Create a test user with email and password
 */
export async function createTestUser(email: string, name: string = 'Test User') {
  const passwordHash = await bcrypt.hash('password123', 10);

  return await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      defaultPercent: 10,
      locale: 'he'
    }
  });
}

/**
 * Create income for a user
 */
export async function createIncome(
  userId: string,
  month: string,
  amount: number,
  percentage: number = 10
) {
  const maaser = Math.round(amount * percentage / 100);

  return await prisma.income.create({
    data: {
      userId,
      month,
      amount,
      percentage,
      maaser,
      description: 'Test income',
      isFrozen: false
    }
  });
}

/**
 * Create fixed charity for a user
 */
export async function createFixedCharity(
  userId: string,
  name: string,
  amount: number
) {
  return await prisma.fixedCharity.create({
    data: {
      userId,
      name,
      amount,
      isActive: true
    }
  });
}

/**
 * Cleanup test data by user email pattern
 */
export async function cleanupTestUsers(emailPattern: string) {
  await prisma.user.deleteMany({
    where: {
      email: {
        contains: emailPattern
      }
    }
  });
}

/**
 * Get month state for user
 */
export async function getMonthState(userId: string, month: string) {
  const { calculateCurrentMonthState } = await import('@/lib/monthState');
  return await calculateCurrentMonthState(userId, month);
}
