import { prisma } from '../prisma';
import { calculateGroupMonthState } from '../monthState';
import { israelDate, israelMonth } from '../israelTime';
import {
  defaultDescription,
  renderAdded,
  renderCancelled,
  renderCard,
  renderExpired,
  renderPicker,
  renderReading,
} from '../salaryCard';
import { editMessageText, type OutgoingMessage } from '../telegramBot';
import { findDuplicateIncome } from './approve';
import { appUrl, type Ctx, type Sender } from './context';
import { candidatesOf, getRow, isExpired, otherOpenSameAmount, type Row } from './rows';

/**
 * A row as the user should see it right now. Every message the flow edits
 * goes through here, so a card, a stale tap and a lost race all show the
 * same thing for the same row.
 */

type RenderOpts = { saveFailed?: boolean; truncated?: boolean };

export async function rowMessage(row: Row, sender: Sender, now: Date, opts: RenderOpts = {}): Promise<OutgoingMessage> {
  const { locale } = sender;
  if (row.status === 'READING') return renderReading(locale);
  if (row.status === 'CANCELLED') return renderCancelled({ locale, amount: row.amount });

  const { amount, month, depositDate, percentage } = row;
  const selected = amount != null && month != null && depositDate != null && percentage != null;
  const description = row.description || defaultDescription(locale);

  if (row.status === 'APPROVED') {
    // Approve refuses a row without an amount, a month or a percentage.
    if (!selected) throw new Error('approved row without a selection');
    // The couple's figure for that month, as the dashboard shows it.
    const { unpaid } = await calculateGroupMonthState(row.userId, month);
    return renderAdded({
      locale, amount, description, month, percentage,
      leftToPay: unpaid,
      appUrl: `${appUrl()}/${locale}/income?month=${month}`,
    });
  }

  if (isExpired(row, now)) return renderExpired(locale);

  const candidates = candidatesOf(row);
  if (!selected) {
    // The row stores no "truncated" flag; only the first render of a fresh
    // picker knows, from the read itself.
    return renderPicker({ locale, id: row.id, version: row.version, candidates, truncated: opts.truncated ?? false });
  }

  const [duplicate, otherOpen, payment] = await Promise.all([
    findDuplicateIncome(prisma, row.userId, month, amount),
    otherOpenSameAmount(row, now),
    prisma.groupPaymentSnapshot.findFirst({ where: { month, members: { some: { userId: row.userId } } } }),
  ]);

  return renderCard({
    locale, id: row.id, version: row.version,
    amount, month, depositDate, dateFromImage: row.dateFromImage, description, percentage,
    // The row has no direction column: it is read off the candidate the card
    // shows. Two lines with the same amount and date cannot be told apart,
    // so either being unsure is enough to warn.
    directionUnknown: candidates.some((c) => c.amount === amount && c.date === depositDate && c.directionUnknown),
    // Israeli, from the same clock a tap is checked against, so the card
    // offers exactly the months a tap may file into.
    today: israelDate(now),
    currentMonth: israelMonth(now),
    // A one-deposit row keeps that one candidate; there is nothing to go back to.
    hasOtherCandidates: candidates.length > 1,
    duplicate,
    otherOpenSameAmount: otherOpen,
    monthPaid: payment !== null,
    saveFailed: opts.saveFailed,
  });
}

/**
 * Edits `messageId` to show the row, then makes the screen catch up (spec §4
 * step 4): a tap or a reply may have changed the row while it was rendered,
 * so it is read once more and, if it moved on, shown again. Whichever edit
 * lands last then shows a committed state. `opts` are for the first render
 * only; a row that moved on is no longer what they described.
 */
export async function showRow(ctx: Ctx, messageId: number, row: Row, opts?: RenderOpts): Promise<void> {
  const edit = async (r: Row, o?: RenderOpts) =>
    editMessageText(ctx.chatId, messageId, await rowMessage(r, ctx.sender, ctx.now(), o), { deadline: ctx.deadline });

  await edit(row, opts);
  const fresh = await getRow(row.id);
  if (fresh && (fresh.status !== row.status || fresh.version !== row.version)) await edit(fresh);
}
