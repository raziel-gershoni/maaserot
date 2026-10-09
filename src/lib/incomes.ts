import type { Income } from '@prisma/client';
import { prisma } from './prisma';
import { maaserFor } from './calculations';
import { calculateGroupMonthState } from './monthState';
import { notifyPartnerIncomeAdded } from './telegramNotify';
import type { ErrorCode } from './errorCodes';

/**
 * Adding an income — shared by the web form (`POST /api/income`) and the
 * bot's ✅.
 *
 * Two callers with different trust in their input are why the checks live
 * here rather than in the route: the form posts whatever the browser sent,
 * and the bot's row was built from a screenshot. Either way an Income row is
 * only ever written with a real month, a whole positive number of agorot and
 * a percentage that can actually be given.
 */

export class IncomeError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number
  ) {
    super(code);
    this.name = 'IncomeError';
  }
}

export interface AddIncomeInput {
  /** 'YYYY-MM'. The form passes the current month; the bot, the deposit's. */
  month: string;
  /** Agorot. */
  amount: number;
  percentage: number;
  description?: string | null;
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The bot's approve passes its transaction, so the row commits with the claim. */
type Db = Pick<typeof prisma, 'income'>;

export async function addIncome(
  userId: string,
  input: AddIncomeInput,
  db: Db = prisma
): Promise<Income> {
  const { month, amount, percentage, description } = input;

  if (typeof month !== 'string' || !MONTH_PATTERN.test(month)) {
    throw new IncomeError('VALIDATION_FAILED', 400);
  }
  // A fractional agora is a bug upstream, not an amount to round.
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new IncomeError('VALIDATION_FAILED', 400);
  }
  // A legacy `defaultPercent` of 0 reaches here through the bot; it must fail
  // as invalid input, not be stored as an income that owes nothing.
  if (!Number.isInteger(percentage) || percentage < 1 || percentage > 100) {
    throw new IncomeError('VALIDATION_FAILED', 400);
  }

  return db.income.create({
    data: {
      userId,
      month,
      amount,
      percentage,
      maaser: maaserFor(amount, percentage),
      description: description ?? null,
    },
  });
}

/**
 * Tell the user's partner, on Telegram, that income was added to `month` and
 * what the couple still owes for it.
 *
 * The month is passed through rather than taken as "now": the bot files a
 * deposit by the day it landed, which may be an earlier month, and the
 * remaining amount must be that month's.
 */
export async function notifyPartnerOfIncome(
  userId: string,
  month: string,
  incomeAmount: number
): Promise<void> {
  const partnership = await prisma.partnership.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [{ user1Id: userId }, { user2Id: userId }],
    },
    include: {
      user1: { select: { id: true, name: true, telegramId: true, locale: true } },
      user2: { select: { id: true, name: true, telegramId: true, locale: true } },
    },
  });

  if (!partnership) return;

  const sender = partnership.user1Id === userId ? partnership.user1 : partnership.user2;
  const partner = partnership.user1Id === userId ? partnership.user2 : partnership.user1;

  if (!partner.telegramId) return;

  // One shared reckoning. Adding the two members' own states together
  // double-counted every group payment — each member's totalPaid already
  // includes the whole group amount — so the message understated what the
  // couple still owed.
  const { unpaid: groupUnpaid } = await calculateGroupMonthState(userId, month);

  await notifyPartnerIncomeAdded(
    partner.telegramId,
    partner.locale || 'he',
    sender.name || 'Partner',
    incomeAmount,
    groupUnpaid,
    month,
  );
}
