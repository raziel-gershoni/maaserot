/**
 * The reckoning: what a group owes for one month, and what it has given.
 *
 * Pure functions over plain rows — no Prisma, no I/O. This is the one place
 * the two rules that constitute this app are written down:
 *
 *   1. who is reckoned together for a given month  (resolveGroupMembers)
 *   2. what that group owes for it                 (reckonMonth)
 *
 * They used to be spelled out separately in the dashboard, the history page,
 * monthState.ts and a Telegram notification helper, and they had already
 * drifted into disagreeing about the same month.
 */

export interface ReckoningIncome {
  userId: string;
  /** Pre-computed maaser for the row, in agorot. */
  maaser: number;
}

export interface ReckoningCharity {
  userId: string;
  /** Monthly commitment in agorot. */
  amount: number;
}

export interface ReckoningPayment {
  /** Everyone the payment was made on behalf of. */
  memberIds: string[];
  /** Total given by that payment, in agorot. */
  groupAmountPaid: number;
}

export interface ReckoningInput {
  memberIds: string[];
  incomes: ReckoningIncome[];
  fixedCharities: ReckoningCharity[];
  payments: ReckoningPayment[];
}

export interface Reckoning {
  totalMaaser: number;
  fixedCharitiesTotal: number;
  /** What was actually given. Not clamped — an overpayment reports in full. */
  totalPaid: number;
  /** What is still owed. Clamped at zero; an overpayment is not a negative debt. */
  unpaid: number;
}

/**
 * Decide who is reckoned together for a month.
 *
 * A month that was settled as a group keeps that payment's members: it is
 * historical fact and stays correct after a partnership ends. Any other month
 * follows the standing partnership, which is what the dashboard shows.
 */
export function resolveGroupMembers({
  userId,
  partnerId,
  settledWith,
}: {
  userId: string;
  partnerId?: string | null;
  /** Members of any multi-member payment already recorded for the month. */
  settledWith: string[];
}): string[] {
  if (settledWith.length > 0) {
    return [userId, ...settledWith.filter((id) => id !== userId)];
  }
  return partnerId ? [userId, partnerId] : [userId];
}

export function reckonMonth({
  memberIds,
  incomes,
  fixedCharities,
  payments,
}: ReckoningInput): Reckoning {
  const group = new Set(memberIds);

  const totalMaaser = incomes
    .filter((i) => group.has(i.userId))
    .reduce((sum, i) => sum + i.maaser, 0);

  const fixedCharitiesTotal = fixedCharities
    .filter((c) => group.has(c.userId))
    .reduce((sum, c) => sum + c.amount, 0);

  // Money given by anyone in the group discharges the shared obligation, so a
  // solo payment by one member counts. A payment that also covers someone
  // outside the group belongs to a different reckoning and is left out.
  const totalPaid = payments
    .filter((p) => p.memberIds.every((id) => group.has(id)))
    .reduce((sum, p) => sum + p.groupAmountPaid, 0);

  return {
    totalMaaser,
    fixedCharitiesTotal,
    totalPaid,
    unpaid: Math.max(0, totalMaaser - fixedCharitiesTotal - totalPaid),
  };
}
