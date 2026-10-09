import type { Income, Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { addIncome } from '../incomes';
import { addMonths } from '../israelTime';

/**
 * The ✅: one transaction that turns an OPEN row into exactly one Income.
 *
 * A double tap, a redelivered tap and a tap racing an amount reply all
 * arrive as separate requests. An advisory lock puts one user's approves in
 * a line, and inside it the row is checked again at the version the card
 * showed, which a reply has already bumped. So at most one of them claims
 * the row. The claim and the Income commit together or not at all: a failed
 * save leaves the row OPEN for another ✅.
 */

/** An Income that may be this same deposit. `name` is null when the sender added it. */
export interface DuplicateIncome { name: string | null; month: string; amount: number }

/** Either the client or an approve's transaction: the check runs inside it, under the lock. */
export type IncomeDb = Pick<Prisma.TransactionClient, 'income' | 'partnership'>;

/** ₪1: the same deposit, typed in by hand with the agorot rounded off. */
const SAME_AMOUNT_AGOROT = 100;

/**
 * An Income the sender or their partner already has for this deposit. The
 * couple share one month's reckoning, so either of them adding it counts.
 * The month after is searched too: the web form files by the day it is used,
 * so a salary that landed on the 30th is often typed in under the next month.
 */
export async function findDuplicateIncome(
  db: IncomeDb,
  userId: string,
  month: string,
  amount: number
): Promise<DuplicateIncome | null> {
  const partnership = await db.partnership.findFirst({
    where: { status: 'ACCEPTED', OR: [{ user1Id: userId }, { user2Id: userId }] },
    include: {
      user1: { select: { id: true, name: true } },
      user2: { select: { id: true, name: true } },
    },
  });
  const partner = partnership && (partnership.user1Id === userId ? partnership.user2 : partnership.user1);

  const matches = await db.income.findMany({
    where: {
      userId: { in: partner ? [userId, partner.id] : [userId] },
      month: { in: [month, addMonths(month, 1)] },
      amount: { gte: amount - SAME_AMOUNT_AGOROT, lte: amount + SAME_AMOUNT_AGOROT },
    },
    orderBy: { createdAt: 'desc' },
  });
  // The sender's own match first: "you already added" is the plainer warning,
  // and the name shown must not depend on the order the database returns.
  // Otherwise the newest, the one most likely to be this deposit.
  const income = matches.find((i) => i.userId === userId) ?? matches[0];
  if (!income) return null;
  return {
    // null is how the card says "you"; a partner without a name is still not
    // you, and the card names them by a fallback.
    name: income.userId === userId ? null : (partner?.name ?? ''),
    month: income.month,
    amount: income.amount,
  };
}

export type ApproveResult =
  | { kind: 'stale' }
  | { kind: 'duplicate'; dup: DuplicateIncome }
  | { kind: 'added'; income: Income };

/**
 * `a` checks for a duplicate first; `A` ("Add anyway") is the tap on a card
 * that already showed one. Throws when the transaction fails, after it has
 * rolled back; an `IncomeError` means the row's values cannot be recorded.
 */
export async function approve(a: {
  id: string; userId: string; version: number; action: 'a' | 'A'; now: Date;
}): Promise<ApproveResult> {
  const { id, userId, version, action, now } = a;
  return prisma.$transaction(async (tx): Promise<ApproveResult> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`; // serialize approves per user
    const row = await tx.pendingIncome.findUnique({ where: { id } });
    if (!row || row.userId !== userId || row.status !== 'OPEN' || row.version !== version
        || row.expiresAt <= now || row.amount == null || row.month == null || row.percentage == null) {
      return { kind: 'stale' as const };
    }
    if (action === 'a') {
      const dup = await findDuplicateIncome(tx, userId, row.month, row.amount); // sender + partner, month and month+1, ±100 agorot
      if (dup) return { kind: 'duplicate' as const, dup };
    }
    const { count } = await tx.pendingIncome.updateMany({
      where: { id, status: 'OPEN', version },
      data: { status: 'APPROVED', version: { increment: 1 }, candidates: [] },
    });
    if (count !== 1) return { kind: 'stale' as const };
    const income = await addIncome(userId, {
      month: row.month, amount: row.amount, percentage: row.percentage, description: row.description,
    }, tx);
    await tx.pendingIncome.update({ where: { id }, data: { incomeId: income.id } });
    return { kind: 'added' as const, income };
  });
}
