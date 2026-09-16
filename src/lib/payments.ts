import { prisma } from './prisma';
import { reckonMonth } from './reckoning';
import type { ErrorCode } from './errorCodes';

/**
 * Recording and undoing a payment — the only place money-state is written.
 *
 * Three things live here that were previously missing or scattered:
 *
 *  - Authorization. The route used to take `memberIds` straight off the request
 *    body, so any logged-in user could settle a stranger's month and freeze
 *    their income rows permanently.
 *  - Atomicity. Creating the snapshot and freezing the incomes were separate
 *    writes; a failure between them left a month frozen with nothing recorded,
 *    or recorded with nothing frozen.
 *  - The inverse. Deleting a payment left every income it had frozen locked
 *    forever, because nothing in the codebase ever set isFrozen back to false.
 *
 * It also flattens the query waterfall: the old route issued 2N+3 sequential
 * round trips for N members (a `for` loop with an `await` inside, twice). This
 * issues three, regardless of N — which matters because a new connection to
 * the database costs the better part of a second.
 */

export class PaymentError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number
  ) {
    super(code);
    this.name = 'PaymentError';
  }
}

export interface RecordPaymentInput {
  month: string;
  memberIds: string[];
  /** Agorot. Must be a positive integer. */
  paymentAmount: number;
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Who may the actor pay on behalf of? Themselves, and their accepted partner.
 * Nobody else, and never a group they are not part of.
 */
async function authorizeMembers(actorId: string, memberIds: string[]) {
  if (!memberIds.includes(actorId)) {
    throw new PaymentError('UNAUTHORIZED', 403);
  }

  const others = memberIds.filter((id) => id !== actorId);
  if (others.length === 0) return;

  const partnership = await prisma.partnership.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [{ user1Id: actorId }, { user2Id: actorId }],
    },
    select: { user1Id: true, user2Id: true },
  });

  const partnerId = partnership
    ? partnership.user1Id === actorId
      ? partnership.user2Id
      : partnership.user1Id
    : null;

  if (!partnerId || others.some((id) => id !== partnerId)) {
    throw new PaymentError('UNAUTHORIZED', 403);
  }
}

export async function recordPayment(actorId: string, input: RecordPaymentInput) {
  const { month, memberIds, paymentAmount } = input;

  if (!month || !MONTH_PATTERN.test(month)) {
    throw new PaymentError('VALIDATION_FAILED', 400);
  }
  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    throw new PaymentError('VALIDATION_FAILED', 400);
  }
  if (new Set(memberIds).size !== memberIds.length) {
    throw new PaymentError('VALIDATION_FAILED', 400);
  }
  // Money is integer agorot; a fractional agora is a bug upstream, not a
  // payment to round.
  if (!Number.isInteger(paymentAmount)) {
    throw new PaymentError('VALIDATION_FAILED', 400);
  }
  if (paymentAmount <= 0) {
    throw new PaymentError('NOTHING_TO_PAY', 400);
  }

  await authorizeMembers(actorId, memberIds);

  const [incomes, charities, priorSnapshots] = await Promise.all([
    prisma.income.findMany({
      where: { userId: { in: memberIds }, month },
      select: { userId: true, maaser: true },
    }),
    prisma.fixedCharity.findMany({
      where: { userId: { in: memberIds }, isActive: true },
      select: { userId: true, amount: true },
    }),
    prisma.groupPaymentSnapshot.findMany({
      where: { month, members: { some: { userId: { in: memberIds } } } },
      include: { members: true },
    }),
  ]);

  // Fixed charities come out of a member's FIRST payment in the month and not
  // again after that.
  const alreadyPaid = new Set(
    priorSnapshots.flatMap((s) => s.members.map((m) => m.userId))
  );
  const chargeableCharities = charities.filter((c) => !alreadyPaid.has(c.userId));

  const memberStates = memberIds.map((userId) => {
    const solo = reckonMonth({
      memberIds: [userId],
      incomes,
      fixedCharities: chargeableCharities,
      payments: priorSnapshots.map((s) => ({
        memberIds: s.members.map((m) => m.userId),
        groupAmountPaid: s.groupAmountPaid,
      })),
    });
    return {
      userId,
      totalMaaser: solo.totalMaaser,
      fixedCharitiesTotal: solo.fixedCharitiesTotal,
      unpaid: solo.unpaid,
    };
  });

  const totalGroupMaaser = memberStates.reduce((sum, m) => sum + m.totalMaaser, 0);
  const totalGroupFixedCharities = memberStates.reduce(
    (sum, m) => sum + m.fixedCharitiesTotal,
    0
  );

  return prisma.$transaction(async (tx) => {
    const snapshot = await tx.groupPaymentSnapshot.create({
      data: {
        month,
        groupOwnerId: actorId,
        totalGroupMaaser,
        totalGroupFixedCharities,
        groupAmountPaid: paymentAmount,
        memberStates,
        members: { create: memberIds.map((userId) => ({ userId })) },
      },
      include: { members: true },
    });

    // One statement for the whole group; the old code looped per member.
    await tx.income.updateMany({
      where: { userId: { in: memberIds }, month, isFrozen: false },
      data: { isFrozen: true },
    });

    return snapshot;
  });
}

/**
 * Remove a payment and reopen the month for anyone it no longer covers.
 *
 * A member's incomes stay frozen while some other payment for that month still
 * includes them — the freeze belongs to the month, not to one payment.
 */
export async function deletePayment(actorId: string, snapshotId: string) {
  if (!snapshotId) throw new PaymentError('VALIDATION_FAILED', 400);

  const snapshot = await prisma.groupPaymentSnapshot.findUnique({
    where: { id: snapshotId },
    include: { members: true },
  });

  if (!snapshot) throw new PaymentError('VALIDATION_FAILED', 404);

  const memberIds = snapshot.members.map((m) => m.userId);
  if (!memberIds.includes(actorId)) {
    throw new PaymentError('UNAUTHORIZED', 403);
  }

  await prisma.$transaction(async (tx) => {
    await tx.groupPaymentSnapshot.delete({ where: { id: snapshotId } });

    const remaining = await tx.groupPaymentSnapshot.findMany({
      where: { month: snapshot.month, members: { some: { userId: { in: memberIds } } } },
      include: { members: true },
    });

    const stillCovered = new Set(
      remaining.flatMap((s) => s.members.map((m) => m.userId))
    );
    const toRelease = memberIds.filter((id) => !stillCovered.has(id));

    if (toRelease.length > 0) {
      await tx.income.updateMany({
        where: { userId: { in: toRelease }, month: snapshot.month, isFrozen: true },
        data: { isFrozen: false },
      });
    }
  });
}
