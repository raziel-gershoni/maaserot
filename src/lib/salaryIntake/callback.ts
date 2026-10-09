import { IncomeError, notifyPartnerOfIncome } from '../incomes';
import { israelMonth } from '../israelTime';
import {
  decodeCallback,
  defaultDescription,
  isAllowedMonth,
  renderNotice,
  toastText,
  type BotToastKey,
  type CallbackData,
} from '../salaryCard';
import { answerCallbackQuery, sendMessage, type TgCallbackQuery } from '../telegramBot';
import { approve, type ApproveResult } from './approve';
import { logError, type Ctx } from './context';
import { showPointer, showRow } from './render';
import { cancelOpen, candidatesOf, getRow, isExpired, updateOpen, type Row } from './rows';

/**
 * A tap on a card's button (spec §4).
 *
 * Anyone can send any callback_data, and the card a tap came from can be
 * older than its row. So a tap is never taken at its word: the row is loaded
 * first and the tap checked against it, in the order of the spec's table:
 * whose row it is, what state it is in, which version the card showed, and
 * whether the argument still fits. Only then is the tap answered, exactly
 * once, with the toast for what was found. A tap that passes acts through
 * one conditional write, and the screen then shows the row as it now is,
 * whether that write won or lost.
 */

/** After the answer: stop, show the row's final state, show what replaced a stale card, or act. */
type Next = 'stop' | 'final' | 'stale' | 'act';

export async function handleCallback(ctx: Ctx, query: TgCallbackQuery): Promise<void> {
  // One clock for the checks and the writes, so they agree on whether the
  // card has expired and which months it may move to.
  const now = ctx.now();
  const tap = decodeCallback(query.data);
  const row = tap ? await getRow(tap.id) : null;
  const { toast, next } = triage(ctx, tap, row, now);

  try {
    await answerCallbackQuery(query.id, toast ? toastText(ctx.sender.locale, toast) : undefined);
  } catch (err) {
    // The spinner times out by itself; the tap still counts.
    logError('callback', err, { updateId: ctx.updateId, pendingId: row?.id });
  }

  // index.ts takes a tap's chat from its message, so the message is always there.
  if (next === 'stop' || !tap || !row || !query.message) return;
  const tapped = query.message.message_id;
  if (next === 'final') return showRow(ctx, tapped, row);
  if (next === 'stale') return showStale(ctx, tapped, row);
  await act(ctx, tap, row, tapped, now);
}

function triage(ctx: Ctx, tap: CallbackData | null, row: Row | null, now: Date): { toast: BotToastKey | null; next: Next } {
  if (!tap || !row) return { toast: 'invalid', next: 'stop' };
  // Message ids repeat across chats, and a row is only ever shown in its own.
  if (row.userId !== ctx.sender.id || row.chatId !== ctx.chatId) return { toast: 'notYours', next: 'stop' };
  if (row.status === 'APPROVED') return { toast: 'alreadyAdded', next: 'final' };
  if (row.status === 'CANCELLED') return { toast: 'cancelled', next: 'final' };
  if (row.status === 'READING') return { toast: 'stillReading', next: 'stop' };
  // Only an open card says "send again"; an added one must never invite a second Income.
  if (isExpired(row, now)) return { toast: 'expired', next: 'final' };
  if (tap.version !== row.version) return { toast: 'changed', next: 'stale' };
  if (!argumentFits(tap, row, now)) return { toast: 'invalid', next: 'stop' };
  return { toast: null, next: 'act' };
}

/** What decodeCallback could only check for shape, checked against the row and today. */
function argumentFits(tap: CallbackData, row: Row, now: Date): boolean {
  switch (tap.action) {
    case 'p':
      return Number(tap.arg) < candidatesOf(row).length;
    case 'm':
      // The same Israeli month the card's buttons were drawn from. A picker
      // has no month to move: it would be left half selected.
      return row.month !== null && isAllowedMonth(tap.arg ?? '', israelMonth(now));
    case 'l':
      // A card read from a single deposit has no list to go back to.
      return candidatesOf(row).length > 1;
    default:
      return true;
  }
}

async function act(ctx: Ctx, tap: CallbackData, row: Row, tapped: number, now: Date): Promise<void> {
  const { sender } = ctx;
  const { id, version } = row;
  switch (tap.action) {
    case 'a':
    case 'A':
      return approveTap(ctx, tap.action, row, tapped, now);
    case 'c':
      await cancelOpen(id, sender.id, version, now);
      break;
    case 'p': {
      const c = candidatesOf(row)[Number(tap.arg)];
      await updateOpen(id, sender.id, version, now, {
        amount: c.amount,
        month: c.month,
        depositDate: c.date,
        dateFromImage: c.dateFromImage,
        description: c.description || defaultDescription(sender.locale),
        // Captured at the pick and shown on the card; approve records exactly this.
        percentage: sender.defaultPercent,
      });
      break;
    }
    case 'm':
      await updateOpen(id, sender.id, version, now, { month: tap.arg });
      break;
    case 'l':
      // With no selection, the row renders as the picker again.
      await updateOpen(id, sender.id, version, now, {
        amount: null, month: null, depositDate: null, description: null, percentage: null,
      });
      break;
  }
  // A count of 0 lost a race to another tap or a reply. Either way the card
  // shows the row as it now is; a lost race is never a toast.
  const fresh = await getRow(id);
  if (fresh) await showChange(ctx, tapped, fresh);
}

async function approveTap(ctx: Ctx, action: 'a' | 'A', row: Row, tapped: number, now: Date): Promise<void> {
  const { sender } = ctx;
  const ids = { updateId: ctx.updateId, pendingId: row.id };
  let result: ApproveResult;
  try {
    result = await approve({ id: row.id, userId: sender.id, version: row.version, action, now });
  } catch (err) {
    if (err instanceof IncomeError) {
      // The card's own values cannot be recorded (a legacy percentage of 0),
      // so "tap again" would fail the same way every time.
      await sendMessage(ctx.chatId, renderNotice(sender.locale, 'checkPercent'), { deadline: ctx.deadline });
      return;
    }
    logError('approve', err, ids);
    // Rolled back, so the row is still the card that was tapped, buttons and all.
    await showChange(ctx, tapped, row, { saveFailed: true });
    return;
  }

  // A version bump with no change: the ✅ just tapped cannot be replayed past
  // the warning, which the card now shows, with "Add anyway".
  if (result.kind === 'duplicate') await updateOpen(row.id, sender.id, row.version, now, {});
  const fresh = await getRow(row.id);
  if (fresh) await showChange(ctx, tapped, fresh);

  if (result.kind === 'added') {
    try {
      await notifyPartnerOfIncome(sender.id, result.income.month, result.income.amount);
    } catch (err) {
      // The income is in; the partner still sees it in the app.
      logError('notify', err, ids);
    }
  }
}

/**
 * After a tap acted, the row's card shows what the row now is. The tap may
 * have come from another message of the same row, one that was meant to be
 * superseded; that one points down to the card rather than becoming a
 * second live one.
 */
async function showChange(ctx: Ctx, tapped: number, row: Row, opts?: { saveFailed?: boolean }): Promise<void> {
  const card = row.cardMessageId ?? tapped;
  await showRow(ctx, card, row, opts);
  if (tapped !== card) await showPointer(ctx, tapped);
}

/**
 * A tap on a card older than its row: the card is shown as the row now is.
 * An older message is only pointed down; the current card already shows
 * the row and is left alone.
 */
async function showStale(ctx: Ctx, tapped: number, row: Row): Promise<void> {
  if (row.cardMessageId === null || row.cardMessageId === tapped) await showRow(ctx, tapped, row);
  else await showPointer(ctx, tapped);
}
