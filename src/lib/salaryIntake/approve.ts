import type { Prisma } from '@prisma/client';

/**
 * The ✅: one transaction that turns an OPEN row into exactly one Income.
 * Task 9 fills this in; the duplicate check starts here so the card can
 * already ask for it.
 */

/** An Income that may be this same deposit. `name` is null when the sender added it. */
export interface DuplicateIncome { name: string | null; month: string; amount: number }

/** Either the client or an approve's transaction: the check runs inside it, under the lock. */
export type IncomeDb = Pick<Prisma.TransactionClient, 'income' | 'partnership'>;

// Task 9 replaces this stub with the check against the sender's and their
// partner's incomes in the card's month and the month after it.
export async function findDuplicateIncome(
  db: IncomeDb,
  userId: string,
  month: string,
  amount: number
): Promise<DuplicateIncome | null> {
  void db; void userId; void month; void amount;
  return null;
}
