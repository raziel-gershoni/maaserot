import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  createTestUser,
  createIncome,
  createFixedCharity,
  cleanupTestUsers,
  getMonthState
} from './utils';

const TEST_MONTH = '2025-12';
const TEST_EMAIL_PREFIX = 'test-payment-';

describe('Group Payment Integration Tests', () => {
  beforeEach(async () => {
    // Clean up any existing test data
    await cleanupTestUsers(TEST_EMAIL_PREFIX);
  });

  afterEach(async () => {
    // Clean up test data after each test
    await cleanupTestUsers(TEST_EMAIL_PREFIX);
  });

  describe('Test 1: Individual Payment (Group of 1)', () => {
    it('should create a payment snapshot for individual user', async () => {
      // Setup: Create user with income and fixed charities
      const user = await createTestUser(`${TEST_EMAIL_PREFIX}solo@test.com`, 'Solo User');

      // User has 10,000 income with 10% = 1,000 maaser
      await createIncome(user.id, TEST_MONTH, 10000, 10);

      // User has 300 in fixed charities
      await createFixedCharity(user.id, 'Charity A', 300);

      // Verify initial state: unpaid = 1000 - 300 = 700
      const stateBefore = await getMonthState(user.id, TEST_MONTH);
      expect(stateBefore.totalMaaser).toBe(1000);
      expect(stateBefore.fixedCharitiesTotal).toBe(300);
      expect(stateBefore.unpaid).toBe(700);

      // Action: Make payment via API
      const snapshot = await prisma.groupPaymentSnapshot.create({
        data: {
          month: TEST_MONTH,
          groupOwnerId: user.id,
          totalGroupMaaser: 1000,
          totalGroupFixedCharities: 300,
          groupAmountPaid: 700,
          memberStates: [
            {
              userId: user.id,
              totalMaaser: 1000,
              fixedCharitiesTotal: 300,
              unpaid: 700
            }
          ],
          members: {
            create: [{ userId: user.id }]
          }
        },
        include: { members: true }
      });

      // Also freeze incomes
      await prisma.income.updateMany({
        where: { userId: user.id, month: TEST_MONTH, isFrozen: false },
        data: { isFrozen: true }
      });

      // Verify: Snapshot created with 1 member
      expect(snapshot).toBeDefined();
      expect(snapshot.members).toHaveLength(1);
      expect(snapshot.members[0].userId).toBe(user.id);
      expect(snapshot.groupAmountPaid).toBe(700);

      // Verify: Unpaid becomes 0
      const stateAfter = await getMonthState(user.id, TEST_MONTH);
      expect(stateAfter.unpaid).toBe(0);
      expect(stateAfter.totalPaid).toBe(700);

      // Verify: Incomes are frozen
      const incomes = await prisma.income.findMany({
        where: { userId: user.id, month: TEST_MONTH }
      });
      expect(incomes.every(i => i.isFrozen)).toBe(true);
    });
  });

  describe('Test 2: Group Payment', () => {
    it('should create a payment snapshot for group of 2 users', async () => {
      // Setup: Create 2 users with incomes
      const user1 = await createTestUser(`${TEST_EMAIL_PREFIX}group1@test.com`, 'User 1');
      const user2 = await createTestUser(`${TEST_EMAIL_PREFIX}group2@test.com`, 'User 2');

      // User 1: 10,000 income, 10% = 1,000 maaser, 300 fixed = 700 unpaid
      await createIncome(user1.id, TEST_MONTH, 10000, 10);
      await createFixedCharity(user1.id, 'Charity A', 300);

      // User 2: 50,000 income, 10% = 5,000 maaser, 100 fixed = 4,900 unpaid
      await createIncome(user2.id, TEST_MONTH, 50000, 10);
      await createFixedCharity(user2.id, 'Charity B', 100);

      // Total group unpaid = 700 + 4,900 = 5,600
      const state1 = await getMonthState(user1.id, TEST_MONTH);
      const state2 = await getMonthState(user2.id, TEST_MONTH);
      const totalUnpaid = state1.unpaid + state2.unpaid;
      expect(totalUnpaid).toBe(5600);

      // Action: Make group payment
      const snapshot = await prisma.groupPaymentSnapshot.create({
        data: {
          month: TEST_MONTH,
          groupOwnerId: user1.id,
          totalGroupMaaser: 6000,
          totalGroupFixedCharities: 400,
          groupAmountPaid: 5600,
          memberStates: [
            {
              userId: user1.id,
              totalMaaser: 1000,
              fixedCharitiesTotal: 300,
              unpaid: 700
            },
            {
              userId: user2.id,
              totalMaaser: 5000,
              fixedCharitiesTotal: 100,
              unpaid: 4900
            }
          ],
          members: {
            create: [
              { userId: user1.id },
              { userId: user2.id }
            ]
          }
        },
        include: { members: true }
      });

      // Freeze incomes for both users
      await prisma.income.updateMany({
        where: { userId: user1.id, month: TEST_MONTH, isFrozen: false },
        data: { isFrozen: true }
      });
      await prisma.income.updateMany({
        where: { userId: user2.id, month: TEST_MONTH, isFrozen: false },
        data: { isFrozen: true }
      });

      // Verify: Snapshot created with 2 members
      expect(snapshot.members).toHaveLength(2);
      expect(snapshot.groupAmountPaid).toBe(5600);

      // Verify: Both users show payment in their history
      const state1After = await getMonthState(user1.id, TEST_MONTH);
      const state2After = await getMonthState(user2.id, TEST_MONTH);

      expect(state1After.snapshots).toHaveLength(1);
      expect(state2After.snapshots).toHaveLength(1);
    });
  });

  describe('Test 3: Individual Then Group (Same Month)', () => {
    it('should handle individual payment followed by group payment', async () => {
      // Setup: Create 2 users
      const user1 = await createTestUser(`${TEST_EMAIL_PREFIX}mixed1@test.com`, 'Mixed User 1');
      const user2 = await createTestUser(`${TEST_EMAIL_PREFIX}mixed2@test.com`, 'Mixed User 2');

      // User 1: 20,000 income, 10% = 2,000 maaser, 500 fixed = 1,500 unpaid
      await createIncome(user1.id, TEST_MONTH, 20000, 10);
      await createFixedCharity(user1.id, 'Charity A', 500);

      // User 2: 30,000 income, 10% = 3,000 maaser, 200 fixed = 2,800 unpaid
      await createIncome(user2.id, TEST_MONTH, 30000, 10);
      await createFixedCharity(user2.id, 'Charity B', 200);

      // Action 1: User 1 makes individual payment of 1,000
      const snapshot1 = await prisma.groupPaymentSnapshot.create({
        data: {
          month: TEST_MONTH,
          groupOwnerId: user1.id,
          totalGroupMaaser: 2000,
          totalGroupFixedCharities: 500,
          groupAmountPaid: 1000,
          memberStates: [
            {
              userId: user1.id,
              totalMaaser: 2000,
              fixedCharitiesTotal: 500,
              unpaid: 1500
            }
          ],
          members: {
            create: [{ userId: user1.id }]
          }
        },
        include: { members: true }
      });

      await prisma.income.updateMany({
        where: { userId: user1.id, month: TEST_MONTH, isFrozen: false },
        data: { isFrozen: true }
      });

      // Verify: User 1 now has 500 unpaid (1500 - 1000)
      const state1AfterSolo = await getMonthState(user1.id, TEST_MONTH);
      expect(state1AfterSolo.totalPaid).toBe(1000);
      expect(state1AfterSolo.unpaid).toBe(500);

      // Action 2: User 1 + User 2 make group payment of 3,300 (500 + 2,800)
      const snapshot2 = await prisma.groupPaymentSnapshot.create({
        data: {
          month: TEST_MONTH,
          groupOwnerId: user1.id,
          totalGroupMaaser: 5000,
          totalGroupFixedCharities: 200, // Only User 2's fixed (User 1 already paid)
          groupAmountPaid: 3300,
          memberStates: [
            {
              userId: user1.id,
              totalMaaser: 2000,
              fixedCharitiesTotal: 0, // Already deducted in first payment
              unpaid: 500
            },
            {
              userId: user2.id,
              totalMaaser: 3000,
              fixedCharitiesTotal: 200,
              unpaid: 2800
            }
          ],
          members: {
            create: [
              { userId: user1.id },
              { userId: user2.id }
            ]
          }
        },
        include: { members: true }
      });

      await prisma.income.updateMany({
        where: { userId: user2.id, month: TEST_MONTH, isFrozen: false },
        data: { isFrozen: true }
      });

      // Verify: 2 separate snapshots exist
      const allSnapshots = await prisma.groupPaymentSnapshot.findMany({
        where: { month: TEST_MONTH },
        include: { members: true }
      });
      expect(allSnapshots).toHaveLength(2);

      // Verify: Fixed charities only in first payment per user
      expect(snapshot1.totalGroupFixedCharities).toBe(500); // User 1's first
      expect(snapshot2.totalGroupFixedCharities).toBe(200); // User 2's first

      // Verify: User 1 has total paid = 1000 (solo only, group payment not counted in solo view)
      const state1Final = await getMonthState(user1.id, TEST_MONTH);
      expect(state1Final.totalPaid).toBe(1000);
      expect(state1Final.snapshots).toHaveLength(2); // Participated in both
    });
  });

  describe('Test 4: Partial Payment', () => {
    it('should handle partial payments correctly', async () => {
      // Setup: Create user with unpaid amount
      const user = await createTestUser(`${TEST_EMAIL_PREFIX}partial@test.com`, 'Partial User');

      // User: 20,000 income, 10% = 2,000 maaser, 200 fixed = 1,800 unpaid
      await createIncome(user.id, TEST_MONTH, 20000, 10);
      await createFixedCharity(user.id, 'Charity C', 200);

      const stateBefore = await getMonthState(user.id, TEST_MONTH);
      expect(stateBefore.unpaid).toBe(1800);

      // Action 1: Make partial payment of 900 (50%)
      const snapshot1 = await prisma.groupPaymentSnapshot.create({
        data: {
          month: TEST_MONTH,
          groupOwnerId: user.id,
          totalGroupMaaser: 2000,
          totalGroupFixedCharities: 200,
          groupAmountPaid: 900,
          memberStates: [
            {
              userId: user.id,
              totalMaaser: 2000,
              fixedCharitiesTotal: 200,
              unpaid: 1800
            }
          ],
          members: {
            create: [{ userId: user.id }]
          }
        },
        include: { members: true }
      });

      await prisma.income.updateMany({
        where: { userId: user.id, month: TEST_MONTH, isFrozen: false },
        data: { isFrozen: true }
      });

      // Verify: Unpaid reduced to 900
      const stateAfterPartial = await getMonthState(user.id, TEST_MONTH);
      expect(stateAfterPartial.totalPaid).toBe(900);
      expect(stateAfterPartial.unpaid).toBe(900);

      // Action 2: Make second payment to complete (900)
      const snapshot2 = await prisma.groupPaymentSnapshot.create({
        data: {
          month: TEST_MONTH,
          groupOwnerId: user.id,
          totalGroupMaaser: 2000,
          totalGroupFixedCharities: 0, // Already deducted in first payment
          groupAmountPaid: 900,
          memberStates: [
            {
              userId: user.id,
              totalMaaser: 2000,
              fixedCharitiesTotal: 0,
              unpaid: 900
            }
          ],
          members: {
            create: [{ userId: user.id }]
          }
        },
        include: { members: true }
      });

      // Verify: Unpaid becomes 0
      const stateFinal = await getMonthState(user.id, TEST_MONTH);
      expect(stateFinal.totalPaid).toBe(1800);
      expect(stateFinal.unpaid).toBe(0);

      // Verify: 2 snapshots exist for this month
      expect(stateFinal.snapshots).toHaveLength(2);
    });
  });
});
