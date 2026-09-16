import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma, type FakeDb } from './fakePrisma';

/**
 * Exercises the real payment path — authorization, the reckoning it records,
 * and the freeze/unfreeze pair — against an in-memory database.
 */

const ME = 'me';
const PARTNER = 'partner';
const STRANGER = 'stranger';
const MONTH = '2026-09';

let db: FakeDb;

async function load() {
  const fake = createFakePrisma({
    incomes: [
      { id: 'i1', userId: ME, month: MONTH, amount: 1000_00, percentage: 10, maaser: 100_00, isFrozen: false },
      { id: 'i2', userId: PARTNER, month: MONTH, amount: 600_00, percentage: 10, maaser: 60_00, isFrozen: false },
      { id: 'i3', userId: ME, month: '2026-08', amount: 500_00, percentage: 10, maaser: 50_00, isFrozen: false },
      { id: 'i4', userId: STRANGER, month: MONTH, amount: 900_00, percentage: 10, maaser: 90_00, isFrozen: false },
    ],
    charities: [
      { id: 'c1', userId: ME, name: 'Kollel', amount: 20_00, isActive: true },
      { id: 'c2', userId: PARTNER, name: 'Shul', amount: 10_00, isActive: true },
    ],
    partnerships: [{ id: 'p1', user1Id: ME, user2Id: PARTNER, status: 'ACCEPTED' }],
  });
  db = fake.db;
  vi.doMock('@/lib/prisma', () => ({ prisma: fake.client }));
  return import('@/lib/payments');
}

const frozen = (id: string) => db.incomes.find((i) => i.id === id)!.isFrozen;

describe('recordPayment', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('records what the group gave and freezes that month for its members', async () => {
    const { recordPayment } = await load();

    const snapshot = await recordPayment(ME, {
      month: MONTH,
      memberIds: [ME, PARTNER],
      paymentAmount: 50_00,
    });

    expect(snapshot.groupAmountPaid).toBe(50_00);
    expect(snapshot.totalGroupMaaser).toBe(160_00);
    expect(snapshot.totalGroupFixedCharities).toBe(30_00);
    expect(db.snapshots).toHaveLength(1);

    expect(frozen('i1')).toBe(true);
    expect(frozen('i2')).toBe(true);
    // A different month must not be touched.
    expect(frozen('i3')).toBe(false);
    // Nor anyone outside the group.
    expect(frozen('i4')).toBe(false);
  });

  // The whole point of the freeze rule: a second payment in the same month
  // must not deduct the fixed charities again.
  it('deducts fixed charities only on a member first payment of the month', async () => {
    const { recordPayment } = await load();

    await recordPayment(ME, { month: MONTH, memberIds: [ME, PARTNER], paymentAmount: 10_00 });
    const second = await recordPayment(ME, {
      month: MONTH,
      memberIds: [ME, PARTNER],
      paymentAmount: 10_00,
    });

    expect(second.totalGroupFixedCharities).toBe(0);
  });

  it('refuses a payment on behalf of someone who is not a partner', async () => {
    const { recordPayment, PaymentError } = await load();

    await expect(
      recordPayment(ME, { month: MONTH, memberIds: [ME, STRANGER], paymentAmount: 10_00 })
    ).rejects.toBeInstanceOf(PaymentError);

    expect(db.snapshots).toHaveLength(0);
    expect(frozen('i4')).toBe(false);
  });

  // The reported hole: memberIds came straight off the request body, so any
  // logged-in user could settle and permanently freeze a stranger's month.
  it('refuses a payment the actor is not part of', async () => {
    const { recordPayment } = await load();

    await expect(
      recordPayment(STRANGER, { month: MONTH, memberIds: [ME], paymentAmount: 10_00 })
    ).rejects.toThrow();

    expect(db.snapshots).toHaveLength(0);
    expect(frozen('i1')).toBe(false);
  });

  it('refuses a non-positive amount', async () => {
    const { recordPayment } = await load();

    await expect(
      recordPayment(ME, { month: MONTH, memberIds: [ME], paymentAmount: 0 })
    ).rejects.toThrow();
    expect(db.snapshots).toHaveLength(0);
  });

  it('refuses a fractional agora', async () => {
    const { recordPayment } = await load();

    await expect(
      recordPayment(ME, { month: MONTH, memberIds: [ME], paymentAmount: 10.5 })
    ).rejects.toThrow();
    expect(db.snapshots).toHaveLength(0);
  });

  // Characterisation of a rule CLAUDE.md documents: a solo payment followed by
  // a group payment in the same month must not charge the payer's fixed
  // charities twice. Ported from the old payment.test.ts, which asserted it
  // against snapshot rows the test itself had written.
  it('does not re-charge a member fixed charities on a later group payment', async () => {
    const { recordPayment } = await load();

    const solo = await recordPayment(ME, {
      month: MONTH,
      memberIds: [ME],
      paymentAmount: 40_00,
    });
    expect(solo.totalGroupFixedCharities).toBe(20_00);

    const group = await recordPayment(ME, {
      month: MONTH,
      memberIds: [ME, PARTNER],
      paymentAmount: 40_00,
    });

    // Only the partner is paying for the first time this month.
    expect(group.totalGroupFixedCharities).toBe(10_00);
  });

  it('lets a user pay alone', async () => {
    const { recordPayment } = await load();

    const snapshot = await recordPayment(ME, {
      month: MONTH,
      memberIds: [ME],
      paymentAmount: 30_00,
    });

    expect(snapshot.totalGroupMaaser).toBe(100_00);
    expect(frozen('i1')).toBe(true);
    expect(frozen('i2')).toBe(false);
  });
});

describe('deletePayment', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  // Deleting a payment used to leave the month frozen forever, so a mistaken
  // payment made those rows permanently uneditable.
  it('unfreezes the month it had frozen', async () => {
    const { recordPayment, deletePayment } = await load();

    const snapshot = await recordPayment(ME, {
      month: MONTH,
      memberIds: [ME, PARTNER],
      paymentAmount: 50_00,
    });
    expect(frozen('i1')).toBe(true);

    await deletePayment(ME, snapshot.id);

    expect(db.snapshots).toHaveLength(0);
    expect(frozen('i1')).toBe(false);
    expect(frozen('i2')).toBe(false);
  });

  it('keeps the month frozen while another payment for it remains', async () => {
    const { recordPayment, deletePayment } = await load();

    const first = await recordPayment(ME, { month: MONTH, memberIds: [ME], paymentAmount: 10_00 });
    await recordPayment(ME, { month: MONTH, memberIds: [ME], paymentAmount: 10_00 });

    await deletePayment(ME, first.id);

    expect(db.snapshots).toHaveLength(1);
    expect(frozen('i1')).toBe(true);
  });

  it('refuses to delete a payment the actor was not part of', async () => {
    const { recordPayment, deletePayment } = await load();

    const snapshot = await recordPayment(ME, {
      month: MONTH,
      memberIds: [ME],
      paymentAmount: 10_00,
    });

    await expect(deletePayment(STRANGER, snapshot.id)).rejects.toThrow();
    expect(db.snapshots).toHaveLength(1);
    expect(frozen('i1')).toBe(true);
  });
});
